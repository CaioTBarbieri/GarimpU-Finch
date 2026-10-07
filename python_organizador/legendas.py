"""Geração de legendas com tradução em paralelo.

O modelo (CPU) gera a legenda em inglês em série; a tradução roda em outra
thread enquanto o modelo já processa as próximas imagens.
"""

import re
import threading
import time
from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor

LOOKAHEAD_PADRAO = 3
# Uma única thread: o Google Tradutor gratuito bloqueia o IP com muitas
# requisições. O modelo leva alguns segundos por imagem, então uma thread
# de tradução já acompanha o ritmo.
THREADS_TRADUCAO_PADRAO = 1
TENTATIVAS_TRADUCAO = 3
INTERVALO_MINIMO_TRADUCAO = 1.0
ESPERA_LIMITE_REQUISICOES = 8.0

_trava_traducao = threading.Lock()
_ultima_traducao = 0.0


def limitar_ritmo():
    """Garante um intervalo mínimo entre chamadas a um serviço externo."""
    global _ultima_traducao
    with _trava_traducao:
        espera = INTERVALO_MINIMO_TRADUCAO - (time.monotonic() - _ultima_traducao)
        if espera > 0:
            time.sleep(espera)
        _ultima_traducao = time.monotonic()


# Formas de Portugal que o modelo local ainda produz, trocadas pelas do Brasil.
_AJUSTES_PT_BR = (
    (r"\bnum\b", "em um"),
    (r"\bnuma\b", "em uma"),
    (r"\bnuns\b", "em uns"),
    (r"\bnumas\b", "em umas"),
    (r"\bfrigorífico\b", "geladeira"),
    (r"\bcasa de banho\b", "banheiro"),
    (r"\bpequeno-almoço\b", "café da manhã"),
    (r"\becrã\b", "tela"),
    # O modelo traduz "slide" de formas erradas (ou nem traduz).
    (r"\bdeslizamento de água\b", "toboágua"),
    (r"\b(?:slide|deslizamento|deslize)\b", "escorregador"),
    # Termos de hotel que o modelo traduz de forma literal ou errada.
    (r"\bcadeiras de (?:gramado|relva|estar)\b", "espreguiçadeiras"),
    (r"\bcadeiras de salão\b", "espreguiçadeiras"),
    (r"\b(?:banho|chuveiro) de caminhada\b", "chuveiro"),
    (r"\bguarda-chuvas\b", "guarda-sóis"),
    (r"\bconvés\b", "deck"),
    (r"\bbordad[oa]s? de\b", "cercada de"),
    (r"\buma caminhada\b", "uma passarela"),
    (r"\bárea de jogo\b", "área de recreação"),
    (r"\bsalão de restaurantes\b", "salão de restaurante"),
)

# Pronomes soltos no fim da frase ("... com cadeiras nele") não ajudam.
_FINAL_PRONOME = r"\s+(?:nele|nela|neles|nelas)(?=[.!]?\s*$)"

# Detalhes sem valor para SEO, removidos da legenda em inglês antes de traduzir.
_DETALHES_IRRELEVANTES_EN = (
    r"night\s?stands?",
    r"bedside tables?",
    r"night tables?",
)

# "room" é ambíguo (quarto ou sala): a categoria do CLIP decide a palavra.
_PALAVRA_PARA_ROOM = {
    "acomodacoes": "bedroom",
    "gastronomia": "restaurant hall",
    "entretenimento": "hall",
    "criancas": "hall",
}

# Quando "room" faz parte de um nome composto, a palavra não deve mudar.
_COMPOSTOS_ROOM = {
    "living", "dining", "bath", "bed", "meeting", "game", "conference",
    "play", "billiard", "waiting", "locker", "changing", "ball", "laundry",
    "recreation", "board", "show", "tea", "club", "ladies", "men's",
}


def ajustar_legenda_en(texto, categoria=None):
    """Prepara a legenda em inglês: remove detalhes inúteis e resolve "room"."""
    detalhes = "|".join(_DETALHES_IRRELEVANTES_EN)
    texto = re.sub(
        r"(?:,|\s+and|\s+with)?\s+(?:an?|two|three|some)?\s*(?:" + detalhes + ")",
        "",
        texto,
        flags=re.IGNORECASE,
    )
    texto = re.sub(r"\s+(?:and|with)\s*(?=[.,]|$)", "", texto)
    texto = re.sub(
        r"\b(?:is|are) (on|in|at|next to|near) ", r"\1 ", texto
    )

    palavra = _PALAVRA_PARA_ROOM.get(categoria)
    if palavra:
        def trocar_room(m):
            anterior = (m.group(1) or "").strip().lower()
            if anterior in _COMPOSTOS_ROOM:
                return m.group(0)
            plural = "s" if m.group(2).lower().endswith("s") else ""
            return (m.group(1) or "") + palavra + plural

        texto = re.sub(
            r"(\b\w+['\w]*\s+)?\b(rooms?)\b",
            trocar_room,
            texto,
            flags=re.IGNORECASE,
        )
    return texto


def ajustar_portugues_brasil(texto):
    """Troca termos típicos de Portugal pelos usados no Brasil."""
    for padrao, troca in _AJUSTES_PT_BR:
        def substituir(m, troca=troca):
            if m.group(0)[:1].isupper():
                return troca[:1].upper() + troca[1:]
            return troca

        texto = re.sub(padrao, substituir, texto, flags=re.IGNORECASE)
    texto = re.sub(_FINAL_PRONOME, "", texto, flags=re.IGNORECASE)
    return texto


LIMITE_ALT_TEXT = 125


def montar_alt_text(descricao_pt, nome_hotel, limite=LIMITE_ALT_TEXT):
    """Monta o alt text: descrição + nome do hotel, sem passar do limite.

    Ex.: "Quarto de hotel com duas camas em EL ARAM IMIRÁ BEACH RESORT".
    "em" evita errar o gênero do hotel (no/na).
    """
    descricao = re.sub(r"\s+", " ", str(descricao_pt or "")).strip(" .")
    hotel = re.sub(r"\s+", " ", str(nome_hotel or "")).strip()
    if not descricao:
        return ""
    # Artigo inicial ("um quarto…") é dispensável num alt text.
    descricao = re.sub(r"^(?:uma?|uns|umas)\s+", "", descricao, flags=re.IGNORECASE)
    descricao = descricao[:1].upper() + descricao[1:]
    if not hotel:
        return descricao
    sufixo = f" em {hotel}"
    maximo = limite - len(sufixo)
    if len(descricao) > maximo > 20:
        descricao = descricao[:maximo].rsplit(" ", 1)[0].rstrip(" ,;")
    return descricao + sufixo


def traduzir_com_tentativas(traduzir, texto, tentativas=TENTATIVAS_TRADUCAO):
    """Traduz com novas tentativas, esperando mais se o serviço limitar."""
    for tentativa in range(1, tentativas + 1):
        try:
            return traduzir(texto)
        except Exception as erro:
            if tentativa == tentativas:
                raise
            limitado = "too many requests" in str(erro).lower()
            time.sleep(
                ESPERA_LIMITE_REQUISICOES * tentativa if limitado else tentativa
            )


def gerar_legendas_paralelas(
    arquivos,
    gerar_legenda_en,
    traduzir,
    lookahead=LOOKAHEAD_PADRAO,
    threads=THREADS_TRADUCAO_PADRAO,
):
    """Gera (um Future por item, na mesma ordem de ``arquivos``).

    Cada item de ``arquivos`` é repassado a ``gerar_legenda_en(item)`` e a
    ``traduzir(texto_en, item)``, o que permite levar contexto (ex.: categoria).
    ``future.result()`` devolve a legenda traduzida ou levanta a exceção que
    ocorreu na geração ou na tradução daquele item.
    """
    pendentes = deque()
    with ThreadPoolExecutor(max_workers=threads) as pool:
        for arquivo in arquivos:
            try:
                texto_en = gerar_legenda_en(arquivo)
                futuro = pool.submit(
                    traduzir_com_tentativas,
                    lambda texto, item=arquivo: traduzir(texto, item),
                    texto_en,
                )
            except Exception as erro:
                futuro = Future()
                futuro.set_exception(erro)
            pendentes.append(futuro)
            if len(pendentes) > lookahead:
                yield pendentes.popleft()
        while pendentes:
            yield pendentes.popleft()
