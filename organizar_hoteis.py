"""
=============================================================================
  ORGANIZADOR DE IMAGENS DE HOTÉIS
  Classifica imagens em: Entretenimento, Gastronomia, Acomodações, Crianças

  - Sem API key, sem GPU necessária
  - Usa CLIP (OpenAI) via sentence-transformers, roda 100% local na CPU
  - Aprende com suas imagens já categorizadas (~3k exemplos)
  - Detecção de humanos via YOLOv8 (muito mais preciso que CLIP para isso)
=============================================================================

INSTALAÇÃO (execute uma vez):
    pip install sentence-transformers Pillow numpy scikit-learn tqdm ultralytics transformers accelerate deep-translator
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
    pip install sentence-transformers Pillow numpy scikit-learn tqdm
    pip install ultralytics   ← NOVO: detector de pessoas (YOLOv8, ~6MB)

USO:
    1. Configure os caminhos abaixo (PASTA_EXEMPLOS e PASTA_HOTEIS)
    2. Execute: python organizar_hoteis.py
    3. O script pergunta se quer COPIAR ou MOVER as imagens

ESTRUTURA ESPERADA DA PASTA DE EXEMPLOS:
    PASTA_EXEMPLOS/
        Entretenimento/   ← imagens de piscina, spa, shows, esportes
        Gastronomia/      ← imagens de restaurantes, bares, comida
        Acomodações/      ← imagens de quartos, suítes, lobby
        Crianças/         ← imagens de kids club, playground, atividades infantis

ESTRUTURA QUE SERÁ CRIADA NOS HOTÉIS:
    NomeDoHotel/
        Entretenimento/
        Gastronomia/
        Acomodações/
        Crianças/
"""

import os
import re
import json
from deep_translator import GoogleTranslator
import sys
import shutil
import argparse
import numpy as np
from pathlib import Path
from tqdm import tqdm
import warnings

warnings.filterwarnings("ignore")


def emitir_status(etapa, **dados):
    """Emite uma linha JSON que pode ser consumida incrementalmente pelo Node.js."""
    payload = {"etapa": etapa, **dados}
    print(
        "STATUS_JSON:" + json.dumps(payload, ensure_ascii=False),
        flush=True,
    )


# Pasta com suas ~3k imagens já categorizadas (subpastas = categorias)
PASTA_EXEMPLOS = r"C:\Users\User\Downloads\Novo Garimpu\GarimpU-Finch\Fotos exemplos"

# Pasta raiz com as pastas dos hotéis a organizar
PASTA_HOTEIS = r"C:\Users\User\Downloads\Trabaio\Software\DOWNLOADS HOTEIS"

# Categorias (devem coincidir com as subpastas em PASTA_EXEMPLOS)
CATEGORIAS = ["entretenimento", "gastronomia", "acomodacoes", "criancas"]

# Extensões de imagem aceitas
EXTENSOES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}

# Confiança mínima para classificar (0.0 a 1.0)
# Imagens abaixo disso vão para a pasta "_Revisar"
CONFIANCA_MINIMA = 0.45

# Arquivo para salvar/carregar os embeddings de treino (evita recalcular)
CACHE_EMBEDDINGS = "cache_embeddings_treino.npz"

# Se True, fotos reais com humanos saem da classificação normal
# e vão para a pasta "_Com_Humanos".
REMOVER_FOTOS_COM_HUMANOS = True

# ── Configurações do detector YOLO ────────────────────────────────────────────
# Confiança mínima para o YOLO considerar que encontrou uma pessoa (0.0 a 1.0).
# 0.45 já é bem preciso; abaixe para 0.35 se estiver perdendo casos reais,
# ou suba para 0.60 se estiver marcando imagens sem pessoas.
CONFIANCA_YOLO_HUMANO = 0.45

# Tamanho mínimo da bounding box da pessoa detectada, como fração da área total.
# Filtra silhuetas minúsculas ou ícones residuais que o YOLO classificar como
# "person" mas que são pequenos demais para ser uma foto real de pessoa.
# Ex.: 0.01 = a caixa da pessoa ocupa ao menos 1% da área total da imagem.
TAMANHO_MINIMO_PESSOA = 0.01

# ─────────────────────────────────────────────────────────────────────────────


def verificar_dependencias():
    """Verifica e orienta instalação das dependências."""
    faltando = []
    try:
        import torch
    except ImportError:
        faltando.append(
            "torch torchvision --index-url https://download.pytorch.org/whl/cpu"
        )
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        faltando.append("sentence-transformers")
    try:
        from PIL import Image
    except ImportError:
        faltando.append("Pillow")
    try:
        from sklearn.neighbors import KNeighborsClassifier
    except ImportError:
        faltando.append("scikit-learn")
    try:
        from ultralytics import YOLO
    except ImportError:
        faltando.append(
            "ultralytics  # detector de pessoas — muito mais preciso que CLIP"
        )
    try:
        import transformers
    except ImportError:
        faltando.append("transformers accelerate")
    try:
        from deep_translator import GoogleTranslator
    except ImportError:
        faltando.append("deep-translator")

    if faltando:
        print("\n❌ Dependências faltando. Execute os comandos abaixo:\n")
        for pkg in faltando:
            print(f"   pip install {pkg}")
        print()
        sys.exit(1)


def carregar_modelo():
    """Carrega o modelo CLIP leve (ViT-B/32). ~350MB, baixa uma vez."""
    from sentence_transformers import SentenceTransformer

    print("\n🔄 Carregando modelo CLIP (pode demorar na primeira vez ~350MB)...")
    # clip-ViT-B-32 é rápido na CPU e excelente para imagens de hotel
    modelo = SentenceTransformer("clip-ViT-B-32")
    print("✅ Modelo carregado!")
    return modelo


def listar_imagens(pasta):
    """Lista todos os arquivos de imagem em uma pasta (não recursivo)."""
    pasta = Path(pasta)
    return [f for f in pasta.iterdir() if f.is_file() and f.suffix.lower() in EXTENSOES]


def limpar_para_nome_arquivo(texto):
    """Limpa a descrição do Florence preservando espaços."""
    if not texto:
        return "imagem"

    texto_limpo = re.sub(r'[\\/*?:"<>|]', "", texto)

    # Mantém a descrição criada pelo Florence e troca underscores por espaços.
    texto_limpo = texto_limpo.replace("_", " ")
    texto_limpo = re.sub(r"\s+", " ", texto_limpo).strip().lower()

    return texto_limpo or "imagem"


def carregar_florence():
    """Carrega o modelo Florence-2."""
    from transformers import AutoProcessor, AutoModelForCausalLM
    import transformers.dynamic_module_utils

    # --- TRUQUE CORRIGIDO PARA RODAR NA CPU ---
    # Desativa a checagem rigorosa de pacotes da Hugging Face.
    # Retornamos uma lista vazia [] para não quebrar o loop interno da biblioteca.
    transformers.dynamic_module_utils.check_imports = lambda *args, **kwargs: []
    # --------------------------------

    print("\n🔄 Carregando modelo Florence-2 (Geração de Nomes)...")
    model_id = "microsoft/Florence-2-base-ft"
    modelo = AutoModelForCausalLM.from_pretrained(model_id, trust_remote_code=True)
    processador = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
    print("✅ Florence-2 carregado!")
    return modelo, processador


def calcular_embeddings(modelo, arquivos, desc="Calculando embeddings"):
    """Calcula embeddings para uma lista de arquivos de imagem."""
    from PIL import Image

    embeddings = []
    validos = []

    for arq in tqdm(arquivos, desc=desc, unit="img"):
        try:
            img = Image.open(arq).convert("RGB")
            # Redimensiona para acelerar (o modelo aceita qualquer tamanho)
            img.thumbnail((336, 336), Image.LANCZOS)
            emb = modelo.encode(img, show_progress_bar=False)
            embeddings.append(emb)
            validos.append(arq)
        except Exception as e:
            print(f"   ⚠️  Ignorando {arq.name}: {e}")

    return np.array(embeddings), validos


def carregar_detector_yolo():
    """
    Carrega o YOLOv8-nano para detecção de pessoas.

    Por que YOLO e não CLIP para isso?
    ───────────────────────────────────
    O CLIP compara a imagem inteira com frases de texto — ele "entende" cenas,
    mas não foi treinado para *localizar* objetos. Por isso não distingue bem
    se há uma pessoa real ou apenas um ícone de banheiro.

    O YOLO é um detector de objetos: ele varreu milhões de fotos reais
    aprendendo a *desenhar caixas* ao redor de pessoas. Ícones, placas e
    silhuetas vetoriais não passam por essa peneira porque não têm a textura,
    proporção e contexto de uma pessoa fotografada de verdade.
    """
    from ultralytics import YOLO

    print("\n🔄 Carregando detector de pessoas (YOLOv8n, ~6MB)...")
    # yolov8n é o modelo nano — rápido na CPU e preciso o suficiente para este caso
    detector = YOLO("yolov8n.pt")
    print("✅ Detector de pessoas carregado!")
    return detector


def parece_foto_com_humano(caminho_imagem, detector_yolo):
    """
    Retorna True somente se o YOLO detectar pelo menos uma pessoa real na foto.

    Critérios para NÃO disparar o filtro (falsos positivos evitados):
    - Bounding box muito pequena (< TAMANHO_MINIMO_PESSOA da área) → ícone/placa
    - Confiança abaixo de CONFIANCA_YOLO_HUMANO → detecção incerta
    - Classe ≠ 0 (classe 0 = person no dataset COCO)

    Dica: ajuste CONFIANCA_YOLO_HUMANO e TAMANHO_MINIMO_PESSOA no topo
    do script se quiser calibrar a sensibilidade.
    """
    try:
        resultados = detector_yolo(
            str(caminho_imagem),
            classes=[0],  # classe 0 = person (COCO)
            conf=CONFIANCA_YOLO_HUMANO,
            verbose=False,
        )
        for r in resultados:
            img_area = r.orig_shape[0] * r.orig_shape[1]
            for box in r.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                box_area = (x2 - x1) * (y2 - y1)
                # Descarta detecções minúsculas (ícones, letreiros, etc.)
                if (box_area / img_area) >= TAMANHO_MINIMO_PESSOA:
                    return True
    except Exception as e:
        print(f"   ⚠️  Erro no detector YOLO ({Path(caminho_imagem).name}): {e}")
    return False


def treinar_classificador(modelo, pasta_exemplos):
    """
    Treina um classificador KNN com as imagens de exemplo.
    Usa cache para não recalcular embeddings desnecessariamente.
    """
    from sklearn.neighbors import KNeighborsClassifier
    from sklearn.preprocessing import normalize

    pasta_exemplos = Path(pasta_exemplos)

    # Tenta carregar cache
    if Path(CACHE_EMBEDDINGS).exists():
        print(f"\n📦 Cache encontrado: {CACHE_EMBEDDINGS}")
        print("   ✅ Usando embeddings em cache automaticamente...")
        dados = np.load(CACHE_EMBEDDINGS, allow_pickle=True)
        X = dados["X"]
        y = dados["y"]
        categorias_cache = list(dados["categorias"])
        print(
            f"   ✅ Cache carregado: {len(X)} imagens, categorias: {categorias_cache}"
        )

        clf = KNeighborsClassifier(n_neighbors=7, metric="cosine", weights="distance")
        clf.fit(normalize(X), y)
        return clf, categorias_cache

    # Coleta imagens por categoria
    print(f"\n📚 Lendo imagens de exemplo em: {pasta_exemplos}")
    X_all, y_all = [], []
    categorias_encontradas = []

    for cat in CATEGORIAS:
        pasta_cat = pasta_exemplos / cat
        if not pasta_cat.exists():
            print(f"   ⚠️  Pasta não encontrada: {pasta_cat}")
            continue

        imagens = listar_imagens(pasta_cat)
        print(f"   📁 {cat}: {len(imagens)} imagens")

        if not imagens:
            continue

        embs, validos = calcular_embeddings(modelo, imagens, desc=f"   {cat}")
        if len(embs) > 0:
            X_all.append(embs)
            y_all.extend([cat] * len(embs))
            categorias_encontradas.append(cat)

    if not X_all:
        print("\n❌ Nenhuma imagem de exemplo encontrada. Verifique PASTA_EXEMPLOS.")
        sys.exit(1)

    X = np.vstack(X_all)
    y = np.array(y_all)

    # Salva cache
    np.savez(CACHE_EMBEDDINGS, X=X, y=y, categorias=categorias_encontradas)
    print(f"\n💾 Cache salvo: {CACHE_EMBEDDINGS}")

    # Treina KNN (leve, rápido, sem GPU)
    clf = KNeighborsClassifier(n_neighbors=7, metric="cosine", weights="distance")
    clf.fit(normalize(X), y)
    print(f"✅ Classificador treinado com {len(X)} imagens!")

    return clf, categorias_encontradas


def classificar_e_organizar(modelo, clf, pasta_hoteis, modo_copia=True):
    """Classifica imagens de cada hotel e organiza nas subpastas."""
    from sklearn.preprocessing import normalize
    from PIL import Image

    pasta_hoteis = Path(pasta_hoteis)

    if listar_imagens(pasta_hoteis):
        pastas_hoteis = [pasta_hoteis]
    else:
        pastas_hoteis = [
            p
            for p in pasta_hoteis.iterdir()
            if p.is_dir() and listar_imagens(p)
        ]

    imagens_por_hotel = {
        pasta_hotel: listar_imagens(pasta_hotel)
        for pasta_hotel in pastas_hoteis
    }
    total_imagens_geral = sum(
        len(imagens) for imagens in imagens_por_hotel.values()
    )
    imagens_processadas_geral = 0

    emitir_status(
        etapa="contagem_concluida",
        totalImagensGeral=total_imagens_geral,
        imagensProcessadasGeral=0,
        imagensPendentesGeral=total_imagens_geral,
        mensagem=f"{total_imagens_geral} imagens aguardando processamento.",
    )

    if not pastas_hoteis:
        print(f"\n❌ Nenhuma imagem ou pasta de hotel encontrada em: {pasta_hoteis}")
        return

    print(f"\n🏨 {len(pastas_hoteis)} hotel(is) em processamento...")

    emitir_status(
        etapa="carregando_yolo",
        mensagem="Carregando detector de pessoas YOLOv8.",
    )
    detector_yolo = carregar_detector_yolo() if REMOVER_FOTOS_COM_HUMANOS else None

    emitir_status(
        etapa="carregando_florence",
        mensagem="Carregando Florence-2.",
    )
    modelo_florence, processador_florence = carregar_florence()

    stats_total = {"classificadas": 0, "revisar": 0, "com_humanos": 0, "erros": 0}
    processamento_imagens_iniciado = False

    for pasta_hotel in pastas_hoteis:
        print(f"\n{'─'*60}")
        print(f"🏨 Hotel: {pasta_hotel.name}")

        imagens = imagens_por_hotel[pasta_hotel]

        if not imagens:
            print("   ℹ️  Nenhuma imagem solta encontrada.")
            continue

        print(f"   📸 {len(imagens)} imagens para classificar")

        if not processamento_imagens_iniciado:
            emitir_status(
                etapa="processamento_imagens_iniciado",
                hotel=pasta_hotel.name,
                mensagem="Modelos carregados. Análise das imagens iniciada.",
            )
            processamento_imagens_iniciado = True

        # ── Etapa 1: filtra humanos via YOLO ──
        sem_humanos = []
        qtd_humanos_detectados = 0

        if detector_yolo:
            print("   👤 Verificando presença de pessoas (YOLO)...")
            for indice, arq in enumerate(
                tqdm(imagens, desc="   Detectando pessoas", unit="img"),
                start=1,
            ):
                if parece_foto_com_humano(arq, detector_yolo):
                    pasta_dest = pasta_hotel / "_Com_Humanos"
                    pasta_dest.mkdir(exist_ok=True)
                    dest = pasta_dest / arq.name
                    if dest.exists():
                        stem, suffix, c = arq.stem, arq.suffix, 1
                        while dest.exists():
                            dest = pasta_dest / f"{stem}_{c}{suffix}"
                            c += 1
                    try:
                        if modo_copia:
                            shutil.copy2(arq, dest)
                        else:
                            shutil.move(str(arq), dest)
                        qtd_humanos_detectados += 1
                        stats_total["com_humanos"] += 1
                        imagens_processadas_geral += 1
                        emitir_status(
                            etapa="arquivo_concluido",
                            hotel=pasta_hotel.name,
                            pasta=str(pasta_dest),
                            imagem=arq.name,
                            imagemAtual=indice,
                            totalImagens=len(imagens),
                            categoria="_Com_Humanos",
                            nomeFinal=dest.name,
                            imagensProcessadasGeral=imagens_processadas_geral,
                            totalImagensGeral=total_imagens_geral,
                            imagensPendentesGeral=max(
                                total_imagens_geral - imagens_processadas_geral,
                                0,
                            ),
                            mensagem=f"{arq.name} foi salvo como {dest.name}.",
                        )
                    except Exception as e:
                        print(f"   ❌ Erro ao mover {arq.name}: {e}")
                        stats_total["erros"] += 1
                        sem_humanos.append(arq)
                else:
                    sem_humanos.append(arq)
            print(f"   👤 {qtd_humanos_detectados} foto(s) com pessoas → _Com_Humanos")
        else:
            sem_humanos = imagens

        if not sem_humanos:
            print("   ℹ️  Todas as imagens continham pessoas.")
            continue

        # ── Etapa 2: classifica imagens via CLIP + Florence-2 ──
        imagens_concluidas_hotel = qtd_humanos_detectados
        embs, validos = calcular_embeddings(
            modelo, sem_humanos, desc="   Analisando categorias"
        )

        caminhos_validos = {str(arq) for arq in validos}
        for arq in sem_humanos:
            if str(arq) in caminhos_validos:
                continue

            imagens_processadas_geral += 1
            imagens_concluidas_hotel += 1
            emitir_status(
                etapa="arquivo_concluido",
                hotel=pasta_hotel.name,
                pasta=str(pasta_hotel),
                imagem=arq.name,
                imagemAtual=imagens_concluidas_hotel,
                totalImagens=len(imagens),
                categoria="_Erro",
                nomeFinal=arq.name,
                imagensProcessadasGeral=imagens_processadas_geral,
                totalImagensGeral=total_imagens_geral,
                imagensPendentesGeral=max(
                    total_imagens_geral - imagens_processadas_geral,
                    0,
                ),
                mensagem=f"{arq.name} terminou com erro durante a análise.",
            )

        if len(embs) == 0:
            continue

        embs_norm = normalize(embs)
        predicoes = clf.predict(embs_norm)
        distancias, _ = clf.kneighbors(embs_norm)
        confiancas = 1 - (distancias.mean(axis=1) / 2)

        stats = {cat: 0 for cat in CATEGORIAS}
        stats["_Revisar"] = 0
        textos_alternativos = {}

        for arq, pred, conf in zip(validos, predicoes, confiancas):
            if conf < CONFIANCA_MINIMA:
                categoria_dest = "_Revisar"
                stats["_Revisar"] += 1
                stats_total["revisar"] += 1
            else:
                categoria_dest = pred
                stats[pred] = stats.get(pred, 0) + 1
                stats_total["classificadas"] += 1

            pasta_dest = pasta_hotel / categoria_dest
            pasta_dest.mkdir(exist_ok=True)

            nome_hotel = pasta_hotel.name

            # --- INTEGRAÇÃO FLORENCE-2 E TRADUÇÃO ---
            descricao_florence = "imagem"
            descricao_pt = ""
            try:
                img_pil = Image.open(arq).convert("RGB")
                task_prompt = "<CAPTION>"
                inputs = processador_florence(
                    text=task_prompt, images=img_pil, return_tensors="pt"
                )

                generated_ids = modelo_florence.generate(
                    input_ids=inputs["input_ids"],
                    pixel_values=inputs["pixel_values"],
                    max_new_tokens=64,
                )
                generated_text = processador_florence.batch_decode(
                    generated_ids, skip_special_tokens=False
                )[0]
                parsed_answer = processador_florence.post_process_generation(
                    generated_text,
                    task=task_prompt,
                    image_size=(img_pil.width, img_pil.height),
                )

                descricao_bruta_en = parsed_answer[task_prompt]
                descricao_pt = GoogleTranslator(source="en", target="pt").translate(
                    descricao_bruta_en
                )
                descricao_florence = limpar_para_nome_arquivo(descricao_pt)

            except Exception as e:
                print(f"   ⚠️ Erro no Florence/Tradução para {arq.name}: {e}")

                # Remove underscores somente do nome final da imagem.
            categoria_nome = categoria_dest.replace("_", " ").strip()
            descricao_nome = descricao_florence.replace("_", " ").strip()
            hotel_nome = nome_hotel.replace("_", " ").strip()

            nome_sem_extensao = f"{categoria_nome} {descricao_nome} {hotel_nome}"

            # Remove espaços repetidos.
            nome_sem_extensao = re.sub(r"\s+", " ", nome_sem_extensao).strip()

            novo_nome_arquivo = f"{nome_sem_extensao}{arq.suffix}"
            dest = pasta_dest / novo_nome_arquivo

            if dest.exists():
                stem_novo = Path(novo_nome_arquivo).stem
                suffix = arq.suffix
                c = 1

                while dest.exists():
                    dest = pasta_dest / f"{stem_novo} {c}{suffix}"
                    c += 1

            try:
                if modo_copia:
                    shutil.copy2(arq, dest)
                else:
                    shutil.move(str(arq), dest)

                # Salva no dicionário JSON usando o nome final do arquivo como chave
                if descricao_pt:
                    textos_alternativos[dest.name] = descricao_pt

                imagens_processadas_geral += 1
                imagens_concluidas_hotel += 1
                emitir_status(
                    etapa="arquivo_concluido",
                    hotel=pasta_hotel.name,
                    pasta=str(pasta_dest),
                    imagem=arq.name,
                    imagemAtual=imagens_concluidas_hotel,
                    totalImagens=len(imagens),
                    categoria=categoria_dest,
                    nomeFinal=dest.name,
                    imagensProcessadasGeral=imagens_processadas_geral,
                    totalImagensGeral=total_imagens_geral,
                    imagensPendentesGeral=max(
                        total_imagens_geral - imagens_processadas_geral,
                        0,
                    ),
                    mensagem=f"{arq.name} foi salvo como {dest.name}.",
                )
            except Exception as e:
                print(f"   ❌ Erro ao mover {arq.name}: {e}")
                stats_total["erros"] += 1
                imagens_processadas_geral += 1
                imagens_concluidas_hotel += 1
                emitir_status(
                    etapa="arquivo_concluido",
                    hotel=pasta_hotel.name,
                    pasta=str(pasta_hotel),
                    imagem=arq.name,
                    imagemAtual=imagens_concluidas_hotel,
                    totalImagens=len(imagens),
                    categoria="_Erro",
                    nomeFinal=arq.name,
                    imagensProcessadasGeral=imagens_processadas_geral,
                    totalImagensGeral=total_imagens_geral,
                    imagensPendentesGeral=max(
                        total_imagens_geral - imagens_processadas_geral,
                        0,
                    ),
                    mensagem=f"{arq.name} terminou com erro ao salvar.",
                )

        # Salva o JSON com os Alt Texts na pasta do hotel
        caminho_json = pasta_hotel / "alt_texts.json"
        with open(caminho_json, "w", encoding="utf-8") as f:
            json.dump(textos_alternativos, f, indent=4, ensure_ascii=False)
        print(f"   📝 Arquivo alt_texts.json gerado com sucesso!")

        # Resumo do hotel
        print(f"   ✅ Resultado:")
        emoji_map = {
            "entretenimento": "🎭",
            "gastronomia": "🍽️",
            "acomodacoes": "🛏️",
            "criancas": "🧒",
            "_Revisar": "⚠️",
        }
        for cat, qtd in stats.items():
            if qtd > 0:
                print(f"      {emoji_map.get(cat, '📁')} {cat}: {qtd} imagens")
        if qtd_humanos_detectados > 0:
            print(f"      👤 _Com_Humanos: {qtd_humanos_detectados} imagens")

    print(f"\n{'═'*60}")
    print(f"🏁 CONCLUÍDO!")
    print(f"   ✅ Classificadas e Renomeadas: {stats_total['classificadas']}")
    print(
        f"   👤 Com humanos:   {stats_total['com_humanos']}  (separadas em _Com_Humanos)"
    )
    print(
        f"   ⚠️  Para revisar: {stats_total['revisar']}  (confiança < {CONFIANCA_MINIMA:.0%})"
    )
    print(f"   ❌ Erros: {stats_total['erros']}")
    if stats_total["revisar"] > 0:
        print(f"\n   💡 Dica: Verifique as pastas '_Revisar' e mova manualmente.")
    if stats_total["com_humanos"] > 0:
        print(f"   💡 Dica: Fotos em '_Com_Humanos' foram separadas pelo YOLO.")
        print(f"           Se alguma foi marcada errado, ajuste CONFIANCA_YOLO_HUMANO")
        print(f"           ou TAMANHO_MINIMO_PESSOA no topo do script.")


def main():
    print("=" * 60)
    print("  ORGANIZADOR DE IMAGENS DE HOTÉIS")
    print("  Categorias: Entretenimento | Gastronomia | Acomodações | Crianças")
    print("=" * 60)

    # Configuração para receber a pasta do Node.js
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pasta", type=str, default=None, help="Pasta do hotel a ser organizada"
    )
    args = parser.parse_args()

    # 1. Verifica dependências
    verificar_dependencias()

    # 2. Define qual pasta será organizada
    if args.pasta:
        pasta_alvo = args.pasta
        print(f"🏨 Organizando pasta recebida do scraper: {pasta_alvo}")
    else:
        pasta_alvo = PASTA_HOTEIS
        if not Path(PASTA_HOTEIS).exists():
            print(f"\n❌ PASTA_HOTEIS não encontrada:\n   {PASTA_HOTEIS}")
            sys.exit(1)

    # 3. Configuração de modo automático
    print(f"\n📂 Pasta de exemplos: {PASTA_EXEMPLOS}")
    print(f"🏨 Pasta alvo:  {pasta_alvo}")
    print(
        "   → Modo Automático: MOVER (arquivos originais serão movidos para as categorias)"
    )
    modo_copia = False  # Força o script a sempre mover as imagens

    # 4. Carrega modelo
    emitir_status(
        etapa="carregando_clip",
        mensagem="Carregando modelo CLIP.",
    )
    modelo = carregar_modelo()

    # 5. Treina classificador (com cache automático)
    emitir_status(
        etapa="carregando_classificador",
        mensagem="Carregando ou treinando o classificador de imagens.",
    )
    clf, categorias = treinar_classificador(modelo, PASTA_EXEMPLOS)

    # 6. Classifica e organiza a pasta alvo específica
    classificar_e_organizar(modelo, clf, pasta_alvo, modo_copia=modo_copia)


if __name__ == "__main__":
    main()
