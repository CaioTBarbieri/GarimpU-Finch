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


def ja_passou_pelo_florence(nome_arquivo):
    """Arquivos renomeados pelo Florence começam com o nome da categoria.

    Ex.: "acomodacoes-quarto-de-hotel-hotel-x.jpg" (ou, nas versões antigas,
    "acomodacoes quarto de hotel Hotel X.jpg").
    """
    nome = _normalizar_nome_categoria(nome_arquivo)
    return any(
        nome.startswith(f"{categoria}{separador}")
        for categoria in CATEGORIAS
        for separador in ("-", " ")
    )


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
