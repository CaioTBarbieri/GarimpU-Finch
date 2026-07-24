import json
import shutil
from pathlib import Path

from .config import EXTENSOES


def listar_imagens_soltas(pasta):
    """Lista imagens diretamente na pasta, sem percorrer subpastas."""
    pasta = Path(pasta)
    return [
        arquivo
        for arquivo in pasta.iterdir()
        if arquivo.is_file()
        and arquivo.suffix.lower() in EXTENSOES
    ]


def listar_hoteis(pasta_raiz):
    pasta_raiz = Path(pasta_raiz)
    if listar_imagens_soltas(pasta_raiz):
        return [pasta_raiz]
    return [
        pasta
        for pasta in pasta_raiz.iterdir()
        if pasta.is_dir() and listar_imagens_soltas(pasta)
    ]


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
    with open(caminho_json, "w", encoding="utf-8") as arquivo:
        json.dump(
            textos_alternativos,
            arquivo,
            indent=4,
            ensure_ascii=False,
        )
    return caminho_json
