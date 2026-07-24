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

from deep_translator import GoogleTranslator
from datetime import datetime
import os
import sys
import argparse
import numpy as np
from pathlib import Path
from tqdm import tqdm
import warnings

from python_organizador.arquivos import (
    criar_pasta,
    escrever_alt_texts,
    listar_hoteis,
    listar_imagens_soltas,
    mover_ou_copiar,
)
from python_organizador.config import (
    CACHE_EMBEDDINGS,
    CATEGORIAS,
    CONFIANCA_MINIMA,
    CONFIANCA_YOLO_HUMANO,
    PASTA_EXEMPLOS,
    PASTA_HOTEIS,
    PASTA_LOGS_FLORENCE,
    REMOVER_FOTOS_COM_HUMANOS,
    TAMANHO_MINIMO_PESSOA,
)
from python_organizador.nomes import (
    criar_nome_final,
    limpar_para_nome_arquivo,
    resolver_nome_duplicado,
)
from python_organizador.log_classificacao import registrar_tempo_classificacao
from python_organizador.status import emitir_status

warnings.filterwarnings("ignore")


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

        imagens = listar_imagens_soltas(pasta_cat)
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

    pastas_hoteis = listar_hoteis(pasta_hoteis)

    imagens_por_hotel = {
        pasta_hotel: listar_imagens_soltas(pasta_hotel)
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
    execucao_id = datetime.now().astimezone().strftime("%Y%m%dT%H%M%S%z")
    numero_hoteis_lote = len(pastas_hoteis)

    for pasta_hotel in pastas_hoteis:
        print(f"\n{'─'*60}")
        print(f"🏨 Hotel: {pasta_hotel.name}")

        imagens = imagens_por_hotel[pasta_hotel]

        if not imagens:
            print("   ℹ️  Nenhuma imagem solta encontrada.")
            continue

        print(f"   📸 {len(imagens)} imagens para classificar")
        tamanhos_imagens_hotel = []
        for imagem in imagens:
            try:
                tamanho_bytes = imagem.stat().st_size
            except OSError:
                tamanho_bytes = 0
            tamanhos_imagens_hotel.append(
                {"nome": imagem.name, "bytes": tamanho_bytes}
            )

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
                    pasta_dest = criar_pasta(
                        pasta_hotel / "_Com_Humanos"
                    )
                    dest = resolver_nome_duplicado(
                        pasta_dest,
                        arq.name,
                        separador="_",
                    )
                    try:
                        mover_ou_copiar(
                            arq,
                            dest,
                            modo_copia=modo_copia,
                        )
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
        inicio_classificacao_hotel = datetime.now().astimezone()
        print(
            "   ⏱️ Classificação Florence iniciada em: "
            f"{inicio_classificacao_hotel.isoformat(timespec='seconds')}"
        )
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
            fim_classificacao_hotel = datetime.now().astimezone()
            registrar_tempo_classificacao(
                PASTA_LOGS_FLORENCE,
                execucao_id,
                pasta_hotel.name,
                inicio_classificacao_hotel,
                fim_classificacao_hotel,
                tamanhos_imagens_hotel,
                numero_hoteis_lote,
                status="sem_embeddings_validos",
            )
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

            pasta_dest = criar_pasta(
                pasta_hotel / categoria_dest
            )

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
            novo_nome_arquivo = criar_nome_final(
                categoria_dest,
                descricao_florence,
                nome_hotel,
                arq.suffix,
            )
            dest = resolver_nome_duplicado(
                pasta_dest,
                novo_nome_arquivo,
            )

            try:
                mover_ou_copiar(
                    arq,
                    dest,
                    modo_copia=modo_copia,
                )

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
        escrever_alt_texts(pasta_hotel, textos_alternativos)
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

        fim_classificacao_hotel = datetime.now().astimezone()
        caminho_log = registrar_tempo_classificacao(
            PASTA_LOGS_FLORENCE,
            execucao_id,
            pasta_hotel.name,
            inicio_classificacao_hotel,
            fim_classificacao_hotel,
            tamanhos_imagens_hotel,
            numero_hoteis_lote,
        )
        duracao_classificacao = (
            fim_classificacao_hotel - inicio_classificacao_hotel
        ).total_seconds()
        print(
            "   ⏱️ Classificação Florence concluída em: "
            f"{fim_classificacao_hotel.isoformat(timespec='seconds')} "
            f"({duracao_classificacao:.3f} segundos)"
        )
        print(f"   🧾 Log atualizado: {caminho_log}")

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

    versao_esperada = os.environ.get("PYTHON_VERSION_ESPERADA")
    versao_atual = f"{sys.version_info.major}.{sys.version_info.minor}"
    if versao_esperada and versao_atual != versao_esperada:
        print(
            f"\n❌ Versão do Python incompatível: esperada {versao_esperada}.x, "
            f"encontrada {versao_atual}.{sys.version_info.micro}.",
            flush=True,
        )
        sys.exit(1)

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
