import json
import shutil
import unicodedata
from pathlib import Path

from .config import CATEGORIAS, EXTENSOES


ALIASES_CATEGORIAS = {
    "entreterimento": "entretenimento",
}


def listar_imagens_soltas(pasta):
    """Lista imagens diretamente na pasta, sem percorrer subpastas."""
    pasta = Path(pasta)
    return [
        arquivo
        for arquivo in pasta.iterdir()
        if arquivo.is_file()
        and arquivo.suffix.lower() in EXTENSOES
    ]


def _normalizar_nome_categoria(nome):
    texto = unicodedata.normalize("NFKD", str(nome))
    return "".join(
        caractere for caractere in texto if not unicodedata.combining(caractere)
    ).casefold()


def listar_imagens_categorizadas(pasta_hotel, categorias):
    """Lista imagens nas pastas de categorias, mantendo a categoria canônica."""
    categorias_normalizadas = {
        _normalizar_nome_categoria(categoria): categoria
        for categoria in categorias
    }
    categorias_normalizadas.update(
        {
            alias: categoria
            for alias, categoria in ALIASES_CATEGORIAS.items()
            if categoria in categorias
        }
    )
    imagens = {}
    for subpasta in Path(pasta_hotel).iterdir():
        if not subpasta.is_dir():
            continue
        categoria = categorias_normalizadas.get(
            _normalizar_nome_categoria(subpasta.name)
        )
        if categoria:
            imagens.update(
                {arquivo: categoria for arquivo in listar_imagens_soltas(subpasta)}
            )
    return imagens


def ler_alt_texts(pasta_hotel):
    caminho_json = Path(pasta_hotel) / "alt_texts.json"
    if not caminho_json.is_file():
        return {}
    try:
        with open(caminho_json, encoding="utf-8") as arquivo:
            conteudo = json.load(arquivo)
        return conteudo if isinstance(conteudo, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def listar_hoteis(pasta_raiz, categorias_organizadas=None):
    pasta_raiz = Path(pasta_raiz)
    categorias_organizadas = categorias_organizadas or []
    nomes_categorias = {
        _normalizar_nome_categoria(categoria)
        for categoria in CATEGORIAS
    }
    nomes_categorias.update(ALIASES_CATEGORIAS)

    def possui_imagens(pasta):
        return bool(listar_imagens_soltas(pasta)) or bool(
            categorias_organizadas
            and listar_imagens_categorizadas(pasta, categorias_organizadas)
        )

    def encontrar_hoteis(pasta):
        if possui_imagens(pasta):
            return [pasta]

        encontrados = []
        for subpasta in pasta.iterdir():
            if not subpasta.is_dir():
                continue
            nome_normalizado = _normalizar_nome_categoria(subpasta.name)
            if subpasta.name.startswith("_") or nome_normalizado in nomes_categorias:
                continue
            encontrados.extend(encontrar_hoteis(subpasta))
        return encontrados

    return encontrar_hoteis(pasta_raiz)


def criar_pasta(pasta):
    pasta = Path(pasta)
    pasta.mkdir(exist_ok=True)
    return pasta


def mover_ou_copiar(origem, destino, modo_copia=True):
    if modo_copia:
        return shutil.copy2(origem, destino)
    return shutil.move(str(origem), destino)


def escrever_alt_texts(pasta_hotel, textos_alternativos):
    caminho_json = Path(pasta_hotel) / "alt_texts.json"
    textos_atualizados = ler_alt_texts(pasta_hotel)
    textos_atualizados.update(textos_alternativos)
    with open(caminho_json, "w", encoding="utf-8") as arquivo:
        json.dump(
            textos_atualizados,
            arquivo,
            indent=4,
            ensure_ascii=False,
        )
    return caminho_json
