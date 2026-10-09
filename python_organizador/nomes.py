import re
from pathlib import Path


CARACTERES_INVALIDOS = r'[\\/*?:"<>|]'


def remover_caracteres_invalidos(texto):
    return re.sub(CARACTERES_INVALIDOS, "", str(texto))


def underscores_para_espacos(texto):
    return str(texto).replace("_", " ").strip()


MAX_PALAVRAS_DESCRICAO = 6
_ARTIGOS = {"um", "uma", "uns", "umas", "o", "a", "os", "as"}
_LIGACOES = {
    "de", "do", "da", "dos", "das", "com", "em", "no", "na", "nos", "nas",
    "ao", "à", "e", "para", "por", "ou",
}
# A descrição é cortada no primeiro destes pontos: o resto é detalhe.
_CORTES = re.compile(
    r"\s+(?:e|ao lado|próximo|perto|em frente|ao fundo|ao redor)(?=\s)|[,;:]",
    re.IGNORECASE,
)


def simplificar_descricao(texto, max_palavras=MAX_PALAVRAS_DESCRICAO):
    """Encurta a legenda para o nome do arquivo (o alt text segue completo).

    Ex.: "um quarto de hotel com uma cama grande e uma mesa"
    -> "quarto de hotel com cama grande".
    """
    texto = re.split(_CORTES, str(texto or ""), maxsplit=1)[0]
    palavras = [
        p for p in texto.split() if p.lower().strip(".") not in _ARTIGOS
    ]
    palavras = palavras[:max_palavras]
    while palavras and palavras[-1].lower().strip(".") in _LIGACOES:
        palavras.pop()
    return " ".join(palavras)


def limpar_para_nome_arquivo(texto):
    """Limpa a descrição do Florence preservando espaços."""
    if not texto:
        return "imagem"

    texto_limpo = remover_caracteres_invalidos(texto)
    texto_limpo = underscores_para_espacos(texto_limpo)
    texto_limpo = re.sub(r"\s+", " ", texto_limpo).strip().lower()
    texto_limpo = re.sub(r"[.\s]+$", "", texto_limpo)
    return texto_limpo or "imagem"


def criar_nome_final(categoria, descricao, nome_hotel, extensao):
    categoria_nome = underscores_para_espacos(categoria)
    descricao_nome = underscores_para_espacos(descricao)
    hotel_nome = underscores_para_espacos(nome_hotel)
    nome_sem_extensao = (
        f"{categoria_nome} {descricao_nome} {hotel_nome}"
    )
    # Tudo em minúsculo e com hífen no lugar de cada espaço.
    nome_sem_extensao = re.sub(
        r"\s+",
        "-",
        nome_sem_extensao.strip().lower(),
    )
    return f"{nome_sem_extensao}{extensao}"


def resolver_nome_duplicado(
    pasta_destino,
    nome_arquivo,
    separador="-",
):
    pasta_destino = Path(pasta_destino)
    destino = pasta_destino / nome_arquivo
    if not destino.exists():
        return destino

    stem = Path(nome_arquivo).stem
    suffix = Path(nome_arquivo).suffix
    contador = 1
    while destino.exists():
        destino = (
            pasta_destino /
            f"{stem}{separador}{contador}{suffix}"
        )
        contador += 1
    return destino
