import re
from pathlib import Path


CARACTERES_INVALIDOS = r'[\\/*?:"<>|]'


def remover_caracteres_invalidos(texto):
    return re.sub(CARACTERES_INVALIDOS, "", str(texto))


def underscores_para_espacos(texto):
    return str(texto).replace("_", " ").strip()


def limpar_para_nome_arquivo(texto):
    """Limpa a descrição do Florence preservando espaços."""
    if not texto:
        return "imagem"

    texto_limpo = remover_caracteres_invalidos(texto)
    texto_limpo = underscores_para_espacos(texto_limpo)
    texto_limpo = re.sub(r"\s+", " ", texto_limpo).strip().lower()
    return texto_limpo or "imagem"


def criar_nome_final(categoria, descricao, nome_hotel, extensao):
    categoria_nome = underscores_para_espacos(categoria)
    descricao_nome = underscores_para_espacos(descricao)
    hotel_nome = underscores_para_espacos(nome_hotel)
    nome_sem_extensao = (
        f"{categoria_nome} {descricao_nome} {hotel_nome}"
    )
    nome_sem_extensao = re.sub(
        r"\s+",
        " ",
        nome_sem_extensao,
    ).strip()
    return f"{nome_sem_extensao}{extensao}"


def resolver_nome_duplicado(
    pasta_destino,
    nome_arquivo,
    separador=" ",
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
