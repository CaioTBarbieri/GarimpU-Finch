import os
from pathlib import Path


DIRETORIO_PROJETO = Path(__file__).resolve().parent.parent
PASTA_EXEMPLOS = Path(
    os.environ.get(
        "PASTA_EXEMPLOS",
        DIRETORIO_PROJETO / "Fotos exemplos",
    )
).resolve()
PASTA_HOTEIS = Path(
    os.environ.get(
        "PASTA_IMAGENS",
        DIRETORIO_PROJETO / "img",
    )
).resolve()
PASTA_LOGS_FLORENCE = Path(
    os.environ.get(
        "PASTA_LOGS_FLORENCE",
        DIRETORIO_PROJETO / "logs" / "florence",
    )
).resolve()

CATEGORIAS = [
    "entretenimento",
    "gastronomia",
    "acomodacoes",
    "criancas",
]
EXTENSOES = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
    ".tiff",
    ".tif",
}

CONFIANCA_MINIMA = 0.45
CACHE_EMBEDDINGS = os.environ.get(
    "CACHE_EMBEDDINGS",
    "cache_embeddings_treino.npz",
)
REMOVER_FOTOS_COM_HUMANOS = True
CONFIANCA_YOLO_HUMANO = 0.45
TAMANHO_MINIMO_PESSOA = 0.01
