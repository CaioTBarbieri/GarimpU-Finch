import csv
import json
from datetime import datetime
from pathlib import Path


NOME_ARQUIVO_LOG = "log_classificacao_florence.csv"
CAMPOS_LOG = (
    "execucao_id",
    "hotel",
    "inicio_classificacao",
    "fim_classificacao",
    "duracao_segundos",
    "numero_imagens",
    "tamanhos_imagens_bytes",
    "tamanho_total_bytes",
    "numero_hoteis",
    "status",
)


def caminho_log_classificacao(pasta_logs):
    return Path(pasta_logs).resolve() / NOME_ARQUIVO_LOG


def registrar_tempo_classificacao(
    pasta_logs,
    execucao_id,
    hotel,
    inicio,
    fim,
    tamanhos_imagens,
    numero_hoteis,
    status="concluido",
):
    """Acrescenta ao CSV o tempo de classificação Florence de um hotel."""
    if not isinstance(inicio, datetime) or not isinstance(fim, datetime):
        raise TypeError("Início e fim devem ser objetos datetime.")
    if fim < inicio:
        raise ValueError("O fim da classificação não pode ser anterior ao início.")

    tamanhos_normalizados = [
        {
            "nome": str(imagem["nome"]),
            "bytes": max(0, int(imagem["bytes"])),
        }
        for imagem in tamanhos_imagens
    ]
    caminho = caminho_log_classificacao(pasta_logs)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    arquivo_novo = not caminho.exists() or caminho.stat().st_size == 0
    encoding = "utf-8-sig" if arquivo_novo else "utf-8"
    registro = {
        "execucao_id": str(execucao_id),
        "hotel": str(hotel),
        "inicio_classificacao": inicio.isoformat(timespec="seconds"),
        "fim_classificacao": fim.isoformat(timespec="seconds"),
        "duracao_segundos": f"{(fim - inicio).total_seconds():.3f}",
        "numero_imagens": len(tamanhos_normalizados),
        "tamanhos_imagens_bytes": json.dumps(
            tamanhos_normalizados,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        "tamanho_total_bytes": sum(
            imagem["bytes"] for imagem in tamanhos_normalizados
        ),
        "numero_hoteis": max(1, int(numero_hoteis)),
        "status": str(status),
    }

    with caminho.open("a", newline="", encoding=encoding) as arquivo:
        escritor = csv.DictWriter(
            arquivo,
            fieldnames=CAMPOS_LOG,
            delimiter=";",
        )
        if arquivo_novo:
            escritor.writeheader()
        escritor.writerow(registro)

    return caminho
