import json


PREFIXO_STATUS = "STATUS_JSON:"


def criar_payload_status(etapa, **dados):
    return {"etapa": etapa, **dados}


def serializar_status(etapa, **dados):
    payload = criar_payload_status(etapa, **dados)
    return PREFIXO_STATUS + json.dumps(payload, ensure_ascii=False)


def emitir_status(etapa, **dados):
    """Emite uma linha JSON que pode ser consumida incrementalmente pelo Node.js."""
    print(serializar_status(etapa, **dados), flush=True)
