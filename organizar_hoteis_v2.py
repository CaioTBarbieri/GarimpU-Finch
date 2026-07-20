"""
=============================================================================
  ORGANIZADOR DE IMAGENS DE HOTÉIS — V2

  Classificação em dois níveis:
    1. CLIP + KNN: categoria geral
       (Entretenimento, Gastronomia, Acomodações ou Crianças)
    2. YOLO Open Images + CLIP zero-shot: cena detalhada
       (Piscina, Quarto com cama, Banheiro, Academia etc.)

  Segurança:
    - SIMULAR é o modo padrão e não copia/move imagens.
    - COPIAR preserva os arquivos originais.
    - MOVER exige confirmação explícita.
    - A pasta original do hotel nunca é renomeada.
    - Todas as decisões são registradas em CSV.

  Sem API, sem chave e sem envio de imagens para a internet.
  Os modelos são baixados somente na primeira execução e depois ficam locais.
=============================================================================
"""

import csv
import re
import shutil
import sys
import warnings
from datetime import datetime
from pathlib import Path

import numpy as np

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None

warnings.filterwarnings("ignore")


# =============================================================================
# CONFIGURAÇÃO
# =============================================================================

# Pasta com suas imagens já separadas nas quatro categorias.
PASTA_EXEMPLOS = r"/home/resorts/Downloads/Trabaio/Fotos exemplos"

# Pasta raiz que contém uma pasta para cada hotel.
PASTA_HOTEIS = r"/home/resorts/Downloads/Trabaio/Software/DOWNLOADS HOTEIS"

CATEGORIAS = ["entretenimento", "gastronomia", "acomodacoes", "criancas"]
EXTENSOES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}

# Modelo leve recomendado para CPU. Para testar o modelo maior, use
# "clip-ViT-L-14" e reconstrua o cache quando o programa solicitar.
MODELO_CLIP = "clip-ViT-B-32"
CACHE_EMBEDDINGS = "cache_embeddings_treino.npz"

# Confiança da categoria geral calculada a partir da distância dos vizinhos.
CONFIANCA_MINIMA = 0.45

# Detecção de pessoas — mantém o YOLO treinado em COCO.
REMOVER_FOTOS_COM_HUMANOS = True
MODELO_YOLO_PESSOAS = "yolov8n.pt"
CONFIANCA_YOLO_HUMANO = 0.45
TAMANHO_MINIMO_PESSOA = 0.01

# Reconhecimento detalhado de objetos — modelo treinado em Open Images V7.
RECONHECER_CENAS_DETALHADAS = True
MODELO_YOLO_OBJETOS = "yolov8n-oiv7.pt"
CONFIANCA_YOLO_OBJETO = 0.25
TAMANHO_MINIMO_OBJETO = 0.001

# Limites conservadores para aceitar uma cena sugerida pelo CLIP.
# Ajuste somente depois de revisar o relatório de pelo menos 100 imagens.
SIMILARIDADE_CENA_MINIMA = 0.20
MARGEM_CENA_MINIMA = 0.012

GERAR_RELATORIO_CSV = True


# =============================================================================
# VOCABULÁRIO DE HOTELARIA PARA O CLIP ZERO-SHOT
#
# Os prompts ficam em inglês porque o CLIP original compreende melhor as
# descrições em inglês. O nome final do arquivo continua em português.
# =============================================================================

CENAS_CLIP = {
    "entretenimento": [
        (
            "Piscina",
            [
                "a photo of a hotel swimming pool",
                "an outdoor resort swimming pool",
                "an indoor hotel swimming pool",
            ],
        ),
        (
            "Academia",
            [
                "a hotel gym with exercise equipment",
                "a fitness room with treadmills",
                "a resort fitness center",
            ],
        ),
        (
            "Spa",
            [
                "a hotel spa treatment room",
                "a resort wellness spa",
                "a massage room inside a hotel",
            ],
        ),
        (
            "Sauna",
            [
                "a wooden sauna room",
                "a hotel steam room or sauna",
                "the interior of a resort sauna",
            ],
        ),
        (
            "Praia",
            [
                "a beach in front of a hotel",
                "a tropical resort beach",
                "a sandy beach by the sea",
            ],
        ),
        (
            "Jardim",
            [
                "a landscaped hotel garden",
                "a tropical resort garden",
                "a garden with plants at a hotel",
            ],
        ),
        (
            "Sala de jogos",
            [
                "a hotel game room",
                "a recreation room with games",
                "a games room with a pool table",
            ],
        ),
        (
            "Recepção e lobby",
            [
                "a luxury hotel lobby",
                "a hotel reception area",
                "a resort entrance lobby",
            ],
        ),
        (
            "Área externa",
            [
                "an outdoor area of a hotel",
                "a resort exterior with seating",
                "an outdoor lounge at a hotel",
            ],
        ),
    ],
    "acomodacoes": [
        (
            "Quarto com cama",
            [
                "a hotel bedroom with a bed",
                "a luxury hotel room interior",
                "a guest bedroom in a resort",
            ],
        ),
        (
            "Banheiro",
            [
                "a modern hotel bathroom",
                "a bathroom with shower and sink",
                "a luxury bathroom in a hotel room",
            ],
        ),
        (
            "Banheira",
            [
                "a hotel bathroom with a bathtub",
                "a freestanding bathtub in a luxury bathroom",
                "a jacuzzi bathtub in a hotel suite",
            ],
        ),
        (
            "Varanda da acomodação",
            [
                "a balcony attached to a hotel room",
                "a private hotel room balcony",
                "a terrace outside a guest room",
            ],
        ),
        (
            "Sala da acomodação",
            [
                "a living room inside a hotel suite",
                "a hotel suite lounge with a sofa",
                "a sitting room in a guest suite",
            ],
        ),
        (
            "Vista da acomodação",
            [
                "a scenic view from a hotel room",
                "a view through a hotel room window",
                "a landscape viewed from a guest room",
            ],
        ),
    ],
    "gastronomia": [
        (
            "Café da manhã",
            [
                "a hotel breakfast buffet",
                "breakfast food served at a hotel",
                "a breakfast table with coffee and pastries",
            ],
        ),
        (
            "Restaurante",
            [
                "a restaurant dining room inside a hotel",
                "a luxury resort restaurant",
                "an elegant restaurant with dining tables",
            ],
        ),
        (
            "Bar",
            [
                "a hotel bar with drinks",
                "a cocktail bar inside a resort",
                "a bar counter with wine glasses",
            ],
        ),
        (
            "Prato servido",
            [
                "a plated gourmet food dish",
                "a restaurant meal served on a plate",
                "a close-up photo of prepared food",
            ],
        ),
        (
            "Mesa preparada",
            [
                "a restaurant table set for dining",
                "an elegant table with plates and glasses",
                "a dining table prepared for guests",
            ],
        ),
    ],
    "criancas": [
        (
            "Brinquedoteca",
            [
                "a children's playroom with toys",
                "an indoor kids club at a hotel",
                "a colorful playroom for children",
            ],
        ),
        (
            "Playground",
            [
                "an outdoor children's playground",
                "a hotel playground for kids",
                "an outdoor play area with slides",
            ],
        ),
        (
            "Piscina infantil",
            [
                "a shallow swimming pool for children",
                "a kids pool at a family resort",
                "a children's splash pool",
            ],
        ),
        (
            "Espaço infantil",
            [
                "a children's area inside a hotel",
                "a family hotel area for kids",
                "a room designed for young children",
            ],
        ),
    ],
}


NOMES_GENERICOS = {
    "entretenimento": "Entretenimento",
    "gastronomia": "Gastronomia",
    "acomodacoes": "Acomodação",
    "criancas": "Espaço infantil",
}


# Somente essas classes do Open Images serão procuradas. Isso reduz ruído e
# evita que objetos irrelevantes influenciem o nome do arquivo.
OBJETOS_RELEVANTES = {
    # Acomodações e banheiros
    "Bathroom accessory",
    "Bathroom cabinet",
    "Bathtub",
    "Bed",
    "Bidet",
    "Closet",
    "Couch",
    "Jacuzzi",
    "Loveseat",
    "Mirror",
    "Nightstand",
    "Pillow",
    "Shower",
    "Sink",
    "Sofa bed",
    "Studio couch",
    "Toilet",
    "Wardrobe",
    # Lazer
    "Billiard table",
    "Dumbbell",
    "Fountain",
    "Palm tree",
    "Porch",
    "Sports equipment",
    "Stationary bicycle",
    "Surfboard",
    "Swimming pool",
    "Table tennis racket",
    "Training bench",
    "Treadmill",
    # Gastronomia
    "Baked goods",
    "Bread",
    "Cocktail",
    "Coffee",
    "Coffee cup",
    "Croissant",
    "Dessert",
    "Drink",
    "Fast food",
    "Food",
    "Fruit",
    "Pancake",
    "Plate",
    "Platter",
    "Salad",
    "Seafood",
    "Serving tray",
    "Table",
    "Tableware",
    "Waffle",
    "Wine",
    "Wine glass",
    # Crianças
    "Ball",
    "Balloon",
    "Doll",
    "Infant bed",
    "Teddy bear",
    "Toy",
}


# =============================================================================
# UTILITÁRIOS
# =============================================================================

def obter_preposicao_hotel(nome_hotel):
    """Define se a preposição mais provável é 'na' ou 'no'."""
    nome_lower = nome_hotel.casefold()
    palavras_femininas = [
        "pousada",
        "casa",
        "villa",
        "vila",
        "colina",
        "estalagem",
        "fazenda",
        "hospedaria",
    ]
    return "na" if any(p in nome_lower for p in palavras_femininas) else "no"


def limpar_nome_hotel(nome):
    """Limpa somente o texto usado nos novos arquivos; não renomeia a pasta."""
    nome = re.sub(r"_+", " ", nome).strip()
    nome = re.sub(r"\s+", " ", nome)
    return nome


def sanitizar_nome_arquivo(texto):
    """Remove caracteres inválidos em Windows/Linux sem retirar acentos."""
    texto = re.sub(r'[<>:"/\\|?*]', " ", texto)
    texto = re.sub(r"\s+", " ", texto).strip(" .")
    return texto or "Imagem"


def listar_imagens(pasta):
    pasta = Path(pasta)
    if not pasta.exists():
        return []
    return [
        arquivo
        for arquivo in pasta.iterdir()
        if arquivo.is_file() and arquivo.suffix.casefold() in EXTENSOES
    ]


def proximo_destino(pasta_destino, base_nome, extensao, reservados):
    """Encontra um nome livre considerando arquivos reais e simulados."""
    pasta_destino = Path(pasta_destino)
    base_nome = sanitizar_nome_arquivo(base_nome)

    numero = 1
    while True:
        destino = pasta_destino / f"{base_nome}_{numero}{extensao}"
        chave = str(destino)
        if not destino.exists() and chave not in reservados:
            reservados.add(chave)
            return destino
        numero += 1


def executar_operacao(origem, destino, modo):
    """Executa SIMULAR, COPIAR ou MOVER e devolve o status para o relatório."""
    if modo == "SIMULAR":
        return "simulado"

    destino.parent.mkdir(parents=True, exist_ok=True)
    if modo == "COPIAR":
        shutil.copy2(origem, destino)
        return "copiado"

    shutil.move(str(origem), destino)
    return "movido"


def verificar_dependencias():
    faltando = []

    if tqdm is None:
        faltando.append("tqdm")

    try:
        import torch  # noqa: F401
    except ImportError:
        faltando.append(
            "torch torchvision --index-url https://download.pytorch.org/whl/cpu"
        )

    try:
        from sentence_transformers import SentenceTransformer  # noqa: F401
    except ImportError:
        faltando.append("sentence-transformers")

    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        faltando.append("Pillow")

    try:
        from sklearn.neighbors import KNeighborsClassifier  # noqa: F401
    except ImportError:
        faltando.append("scikit-learn")

    try:
        from ultralytics import YOLO  # noqa: F401
    except ImportError:
        faltando.append("ultralytics")

    if faltando:
        print("\n❌ Dependências faltando. Execute:\n")
        for pacote in faltando:
            print(f"   pip install {pacote}")
        print()
        sys.exit(1)


# =============================================================================
# CLIP E CLASSIFICADOR DE CATEGORIA
# =============================================================================

def carregar_modelo_clip():
    from sentence_transformers import SentenceTransformer

    print(f"\n🔄 Carregando CLIP: {MODELO_CLIP}")
    print("   Na primeira execução, o modelo será baixado automaticamente.")
    modelo = SentenceTransformer(MODELO_CLIP)
    print("✅ CLIP carregado!")
    return modelo


def calcular_embeddings(modelo, arquivos, desc="Calculando embeddings"):
    from PIL import Image

    embeddings = []
    validos = []

    for arquivo in tqdm(arquivos, desc=desc, unit="img"):
        try:
            with Image.open(arquivo) as imagem_original:
                imagem = imagem_original.convert("RGB")
                modulo_resampling = getattr(Image, "Resampling", Image)
                imagem.thumbnail((336, 336), modulo_resampling.LANCZOS)
                embedding = modelo.encode(imagem, show_progress_bar=False)
            embeddings.append(embedding)
            validos.append(arquivo)
        except Exception as erro:
            print(f"   ⚠️ Ignorando {arquivo.name}: {erro}")

    if not embeddings:
        return np.empty((0, 0)), validos
    return np.asarray(embeddings), validos


def _texto_npz(dados, chave, padrao=""):
    if chave not in dados.files:
        return padrao
    valor = dados[chave]
    if getattr(valor, "shape", None) == ():
        return str(valor.item())
    return str(valor)


def treinar_classificador(modelo, pasta_exemplos):
    from sklearn.neighbors import KNeighborsClassifier
    from sklearn.preprocessing import normalize

    pasta_exemplos = Path(pasta_exemplos)
    cache = Path(CACHE_EMBEDDINGS)

    if cache.exists():
        print(f"\n📦 Cache encontrado: {cache}")
        try:
            dados = np.load(cache, allow_pickle=True)
            modelo_cache = _texto_npz(dados, "modelo_clip")

            # Cache antigo do script original não guardava o nome do modelo.
            cache_legado_compativel = not modelo_cache and MODELO_CLIP == "clip-ViT-B-32"
            cache_compativel = modelo_cache == MODELO_CLIP or cache_legado_compativel

            if cache_compativel:
                resposta = input("   Usar embeddings em cache? (S/n): ").strip().lower()
                if resposta != "n":
                    X = dados["X"]
                    y = dados["y"]
                    categorias_cache = list(dados["categorias"])
                    print(f"   ✅ Cache carregado: {len(X)} imagens")
                    if cache_legado_compativel:
                        print("   ℹ️ Cache antigo aceito como CLIP ViT-B/32.")
                    classificador = KNeighborsClassifier(
                        n_neighbors=7,
                        metric="cosine",
                        weights="distance",
                    )
                    classificador.fit(normalize(X), y)
                    return classificador, categorias_cache
            else:
                print(
                    "   ⚠️ Cache criado por outro modelo CLIP. "
                    "Ele será reconstruído."
                )
        except Exception as erro:
            print(f"   ⚠️ Não foi possível usar o cache: {erro}")

    print(f"\n📚 Lendo imagens de exemplo em: {pasta_exemplos}")
    X_todos = []
    y_todos = []
    categorias_encontradas = []

    for categoria in CATEGORIAS:
        pasta_categoria = pasta_exemplos / categoria
        if not pasta_categoria.exists():
            print(f"   ⚠️ Pasta ausente: {pasta_categoria}")
            continue

        imagens = listar_imagens(pasta_categoria)
        if not imagens:
            print(f"   ⚠️ Nenhuma imagem em: {pasta_categoria}")
            continue

        embeddings, validos = calcular_embeddings(
            modelo,
            imagens,
            desc=f"   {categoria}",
        )
        if len(embeddings):
            X_todos.append(embeddings)
            y_todos.extend([categoria] * len(validos))
            categorias_encontradas.append(categoria)

    if not X_todos:
        print("\n❌ Nenhuma imagem de exemplo encontrada.")
        sys.exit(1)

    X = np.vstack(X_todos)
    y = np.asarray(y_todos)
    np.savez(
        cache,
        X=X,
        y=y,
        categorias=np.asarray(categorias_encontradas),
        modelo_clip=np.asarray(MODELO_CLIP),
        versao_cache=np.asarray(2),
    )
    print(f"   💾 Novo cache salvo: {cache} ({len(X)} imagens)")

    classificador = KNeighborsClassifier(
        n_neighbors=7,
        metric="cosine",
        weights="distance",
    )
    classificador.fit(normalize(X), y)
    return classificador, categorias_encontradas


def criar_prototipos_cenas(modelo):
    """Transforma os prompts de cenas em pequenos protótipos CLIP."""
    from sklearn.preprocessing import normalize

    print("\n🧠 Preparando vocabulário de cenas de hotelaria...")
    prototipos = {}

    for categoria, cenas in CENAS_CLIP.items():
        prototipos[categoria] = []
        for descricao, prompts in cenas:
            embeddings = modelo.encode(prompts, show_progress_bar=False)
            embeddings = normalize(np.asarray(embeddings))
            prototipo = normalize(embeddings.mean(axis=0, keepdims=True))[0]
            prototipos[categoria].append((descricao, prototipo))

    total = sum(len(cenas) for cenas in prototipos.values())
    print(f"✅ {total} cenas prontas para comparação zero-shot.")
    return prototipos


def classificar_cena_clip(embedding_normalizado, categoria, prototipos):
    """Escolhe a cena textual mais semelhante dentro da categoria geral."""
    candidatos = prototipos.get(categoria, [])
    if not candidatos:
        return None, 0.0, 0.0

    pontuacoes = np.asarray(
        [float(np.dot(embedding_normalizado, proto)) for _, proto in candidatos]
    )
    ordem = np.argsort(pontuacoes)[::-1]
    melhor_indice = int(ordem[0])
    melhor_score = float(pontuacoes[melhor_indice])
    segundo_score = float(pontuacoes[ordem[1]]) if len(ordem) > 1 else -1.0
    margem = melhor_score - segundo_score

    if (
        melhor_score >= SIMILARIDADE_CENA_MINIMA
        and margem >= MARGEM_CENA_MINIMA
    ):
        return candidatos[melhor_indice][0], melhor_score, margem

    return None, melhor_score, margem


# =============================================================================
# YOLO: PESSOAS E OBJETOS DO OPEN IMAGES
# =============================================================================

def carregar_detectores():
    from ultralytics import YOLO

    detector_pessoas = None
    detector_objetos = None

    if REMOVER_FOTOS_COM_HUMANOS:
        try:
            print(f"\n🔄 Carregando detector de pessoas: {MODELO_YOLO_PESSOAS}")
            detector_pessoas = YOLO(MODELO_YOLO_PESSOAS)
            print("✅ Detector de pessoas carregado!")
        except Exception as erro:
            print(f"⚠️ Detector de pessoas indisponível: {erro}")

    if RECONHECER_CENAS_DETALHADAS:
        try:
            print(f"\n🔄 Carregando detector de objetos: {MODELO_YOLO_OBJETOS}")
            print("   Na primeira execução, os pesos serão baixados automaticamente.")
            detector_objetos = YOLO(MODELO_YOLO_OBJETOS)
            print("✅ Detector Open Images V7 carregado!")
        except Exception as erro:
            print(f"⚠️ Detector de objetos indisponível: {erro}")
            print("   O programa continuará usando CLIP zero-shot.")

    return detector_pessoas, detector_objetos


def parece_foto_com_humano(caminho_imagem, detector_yolo):
    if detector_yolo is None:
        return False

    try:
        resultados = detector_yolo(
            str(caminho_imagem),
            classes=[0],  # No modelo COCO, classe 0 = person.
            conf=CONFIANCA_YOLO_HUMANO,
            verbose=False,
        )
        for resultado in resultados:
            area_imagem = resultado.orig_shape[0] * resultado.orig_shape[1]
            for caixa in resultado.boxes:
                x1, y1, x2, y2 = caixa.xyxy[0].tolist()
                area_caixa = max(0, x2 - x1) * max(0, y2 - y1)
                if area_imagem and area_caixa / area_imagem >= TAMANHO_MINIMO_PESSOA:
                    return True
    except Exception as erro:
        print(f"   ⚠️ Erro no detector de pessoas ({Path(caminho_imagem).name}): {erro}")

    return False


def _nomes_modelo(detector):
    nomes = detector.names
    if isinstance(nomes, dict):
        return nomes
    return {indice: nome for indice, nome in enumerate(nomes)}


def obter_ids_objetos_relevantes(detector):
    desejados = {nome.casefold() for nome in OBJETOS_RELEVANTES}
    return [
        indice
        for indice, nome in _nomes_modelo(detector).items()
        if str(nome).casefold() in desejados
    ]


def detectar_objetos_hotel(caminho_imagem, detector, ids_relevantes):
    """Devolve {nome_do_objeto: maior_confiança} para uma imagem."""
    if detector is None:
        return {}

    parametros = {
        "source": str(caminho_imagem),
        "conf": CONFIANCA_YOLO_OBJETO,
        "verbose": False,
    }
    if ids_relevantes:
        parametros["classes"] = ids_relevantes

    objetos = {}
    nomes_permitidos = {nome.casefold() for nome in OBJETOS_RELEVANTES}
    try:
        resultados = detector.predict(**parametros)
        for resultado in resultados:
            area_imagem = resultado.orig_shape[0] * resultado.orig_shape[1]
            nomes = resultado.names

            for caixa in resultado.boxes:
                classe = int(caixa.cls[0].item())
                confianca = float(caixa.conf[0].item())
                x1, y1, x2, y2 = caixa.xyxy[0].tolist()
                area_caixa = max(0, x2 - x1) * max(0, y2 - y1)
                proporcao = area_caixa / area_imagem if area_imagem else 0

                if proporcao < TAMANHO_MINIMO_OBJETO:
                    continue

                nome = nomes[classe] if isinstance(nomes, dict) else nomes[classe]
                if str(nome).casefold() not in nomes_permitidos:
                    continue
                objetos[nome] = max(confianca, objetos.get(nome, 0.0))
    except Exception as erro:
        print(f"   ⚠️ Erro no detector de objetos ({Path(caminho_imagem).name}): {erro}")

    return objetos


def escolher_cena_por_objetos(categoria, objetos):
    """Aplica regras conservadoras usando a categoria como contexto."""
    detectados = {nome.casefold(): conf for nome, conf in objetos.items()}

    def melhor(*nomes):
        return max((detectados.get(nome.casefold(), 0.0) for nome in nomes), default=0.0)

    def existe(*nomes):
        return melhor(*nomes) > 0

    if categoria == "entretenimento":
        if existe("Swimming pool"):
            return "Piscina", melhor("Swimming pool"), "Swimming pool"
        if existe("Treadmill", "Dumbbell", "Stationary bicycle", "Training bench"):
            nomes = ["Treadmill", "Dumbbell", "Stationary bicycle", "Training bench"]
            encontrados = [nome for nome in nomes if existe(nome)]
            return "Academia", melhor(*nomes), ", ".join(encontrados)
        if existe("Billiard table", "Table tennis racket"):
            nomes = ["Billiard table", "Table tennis racket"]
            encontrados = [nome for nome in nomes if existe(nome)]
            return "Sala de jogos", melhor(*nomes), ", ".join(encontrados)
        if existe("Jacuzzi"):
            return "Spa com jacuzzi", melhor("Jacuzzi"), "Jacuzzi"

    elif categoria == "acomodacoes":
        if existe("Bathtub", "Jacuzzi"):
            nomes = ["Bathtub", "Jacuzzi"]
            encontrados = [nome for nome in nomes if existe(nome)]
            return "Banheiro com banheira", melhor(*nomes), ", ".join(encontrados)
        if existe("Shower", "Toilet", "Bidet"):
            nomes = ["Shower", "Toilet", "Bidet"]
            encontrados = [nome for nome in nomes if existe(nome)]
            return "Banheiro", melhor(*nomes), ", ".join(encontrados)
        if existe("Bed"):
            return "Quarto com cama", melhor("Bed"), "Bed"
        if existe("Sofa bed"):
            return "Acomodação com sofá-cama", melhor("Sofa bed"), "Sofa bed"

    elif categoria == "gastronomia":
        itens_cafe = [
            "Coffee",
            "Coffee cup",
            "Pancake",
            "Waffle",
            "Croissant",
            "Baked goods",
            "Bread",
        ]
        quantidade_cafe = sum(1 for nome in itens_cafe if existe(nome))
        if quantidade_cafe >= 2 or existe("Pancake", "Waffle", "Croissant"):
            encontrados = [nome for nome in itens_cafe if existe(nome)]
            return "Café da manhã", melhor(*itens_cafe), ", ".join(encontrados)

        itens_bar = ["Wine", "Wine glass", "Cocktail"]
        if existe(*itens_bar):
            encontrados = [nome for nome in itens_bar if existe(nome)]
            return "Bar", melhor(*itens_bar), ", ".join(encontrados)

        itens_prato = ["Food", "Dessert", "Salad", "Seafood", "Fast food"]
        if existe(*itens_prato):
            encontrados = [nome for nome in itens_prato if existe(nome)]
            return "Prato servido", melhor(*itens_prato), ", ".join(encontrados)

    elif categoria == "criancas":
        itens_brinquedoteca = ["Toy", "Doll", "Teddy bear"]
        if existe(*itens_brinquedoteca):
            encontrados = [nome for nome in itens_brinquedoteca if existe(nome)]
            return "Brinquedoteca", melhor(*itens_brinquedoteca), ", ".join(encontrados)
        if existe("Infant bed"):
            return "Espaço infantil", melhor("Infant bed"), "Infant bed"

    return None, 0.0, ""


# =============================================================================
# ORGANIZAÇÃO
# =============================================================================

COLUNAS_RELATORIO = [
    "hotel",
    "arquivo_original",
    "categoria",
    "descricao_criada",
    "metodo_detalhe",
    "confianca_categoria",
    "confianca_detalhe",
    "margem_clip",
    "objetos_detectados",
    "arquivo_destino",
    "modo",
    "status",
]


def linha_relatorio(
    hotel,
    origem,
    categoria,
    descricao,
    metodo,
    confianca_categoria,
    confianca_detalhe,
    margem_clip,
    objetos,
    destino,
    modo,
    status,
):
    objetos_texto = "; ".join(
        f"{nome} ({conf:.2f})"
        for nome, conf in sorted(objetos.items(), key=lambda item: item[1], reverse=True)
    )
    return {
        "hotel": hotel,
        "arquivo_original": str(origem),
        "categoria": categoria,
        "descricao_criada": descricao,
        "metodo_detalhe": metodo,
        "confianca_categoria": (
            f"{confianca_categoria:.4f}" if confianca_categoria is not None else ""
        ),
        "confianca_detalhe": (
            f"{confianca_detalhe:.4f}" if confianca_detalhe is not None else ""
        ),
        "margem_clip": f"{margem_clip:.4f}" if margem_clip is not None else "",
        "objetos_detectados": objetos_texto,
        "arquivo_destino": str(destino),
        "modo": modo,
        "status": status,
    }


def salvar_relatorio(pasta_hoteis, linhas, modo):
    if not GERAR_RELATORIO_CSV or not linhas:
        return None

    horario = datetime.now().strftime("%Y%m%d_%H%M%S")
    caminho = Path(pasta_hoteis) / f"relatorio_organizacao_{modo.lower()}_{horario}.csv"

    with caminho.open("w", newline="", encoding="utf-8-sig") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=COLUNAS_RELATORIO)
        escritor.writeheader()
        escritor.writerows(linhas)

    return caminho


def classificar_e_organizar(
    modelo,
    classificador,
    prototipos,
    detector_pessoas,
    detector_objetos,
    pasta_hoteis,
    modo="SIMULAR",
):
    from sklearn.preprocessing import normalize

    pasta_hoteis = Path(pasta_hoteis)
    pastas = [pasta for pasta in pasta_hoteis.iterdir() if pasta.is_dir()]

    if not pastas:
        print(f"\n❌ Nenhuma pasta de hotel encontrada em: {pasta_hoteis}")
        return

    ids_objetos = (
        obter_ids_objetos_relevantes(detector_objetos)
        if detector_objetos is not None
        else []
    )
    if detector_objetos is not None:
        print(f"   🔎 {len(ids_objetos)} classes relevantes do Open Images selecionadas.")

    print(f"\n🏨 {len(pastas)} hotel(is) encontrado(s)")
    print(f"🛡️ Modo ativo: {modo}")
    if modo == "SIMULAR":
        print("   Nenhuma imagem será copiada, movida ou renomeada.")

    stats_total = {
        "classificadas": 0,
        "detalhadas_objetos": 0,
        "detalhadas_clip": 0,
        "genericas": 0,
        "revisar": 0,
        "com_humanos": 0,
        "erros": 0,
    }
    linhas_relatorio = []
    reservados = set()

    for pasta_hotel in pastas:
        print(f"\n{'─' * 68}")

        nome_limpo = limpar_nome_hotel(pasta_hotel.name)
        print(f"🏨 Hotel: {nome_limpo}")
        if nome_limpo != pasta_hotel.name:
            print("   ℹ️ O nome será limpo nos arquivos, mas a pasta original não será renomeada.")

        preposicao = obter_preposicao_hotel(nome_limpo)
        imagens = listar_imagens(pasta_hotel)
        if not imagens:
            print("   ℹ️ Nenhuma imagem solta encontrada.")
            continue

        print(f"   📸 {len(imagens)} imagens para analisar")
        sem_humanos = []

        # Etapa 1: pessoas.
        if detector_pessoas is not None:
            print("   👤 Verificando presença de pessoas...")
            for arquivo in tqdm(imagens, desc="   Pessoas", unit="img"):
                if not parece_foto_com_humano(arquivo, detector_pessoas):
                    sem_humanos.append(arquivo)
                    continue

                pasta_destino = pasta_hotel / "_Com_Humanos"
                base = f"Pessoas {preposicao} {nome_limpo}"
                destino = proximo_destino(
                    pasta_destino,
                    base,
                    arquivo.suffix,
                    reservados,
                )

                try:
                    status = executar_operacao(arquivo, destino, modo)
                    stats_total["com_humanos"] += 1
                    linhas_relatorio.append(
                        linha_relatorio(
                            nome_limpo,
                            arquivo,
                            "_Com_Humanos",
                            "Pessoas",
                            "yolo_pessoas",
                            None,
                            None,
                            None,
                            {},
                            destino,
                            modo,
                            status,
                        )
                    )
                except Exception as erro:
                    print(f"   ❌ Erro ao processar {arquivo.name}: {erro}")
                    stats_total["erros"] += 1
                    sem_humanos.append(arquivo)
        else:
            sem_humanos = imagens

        if not sem_humanos:
            continue

        # Etapa 2: categoria geral.
        embeddings, validos = calcular_embeddings(
            modelo,
            sem_humanos,
            desc="   Categorias CLIP",
        )
        if not len(embeddings):
            continue

        embeddings_norm = normalize(embeddings)
        predicoes = classificador.predict(embeddings_norm)
        distancias, _ = classificador.kneighbors(embeddings_norm)
        confiancas = np.clip(1 - distancias.mean(axis=1) / 2, 0, 1)

        stats_hotel = {categoria: 0 for categoria in CATEGORIAS}
        stats_hotel["_Revisar"] = 0

        # Etapa 3: objetos + cena zero-shot.
        for arquivo, embedding, categoria, conf_categoria in zip(
            validos,
            embeddings_norm,
            predicoes,
            confiancas,
        ):
            objetos = {}
            margem_clip = None
            conf_detalhe = None

            if conf_categoria < CONFIANCA_MINIMA:
                pasta_categoria = "_Revisar"
                descricao = "Revisar"
                metodo = "baixa_confianca_categoria"
                stats_hotel["_Revisar"] += 1
                stats_total["revisar"] += 1
            else:
                pasta_categoria = categoria
                stats_hotel[categoria] = stats_hotel.get(categoria, 0) + 1
                stats_total["classificadas"] += 1

                if detector_objetos is not None:
                    objetos = detectar_objetos_hotel(
                        arquivo,
                        detector_objetos,
                        ids_objetos,
                    )

                descricao, conf_objeto, evidencia = escolher_cena_por_objetos(
                    categoria,
                    objetos,
                )

                if descricao:
                    metodo = f"yolo_objetos: {evidencia}"
                    conf_detalhe = conf_objeto
                    stats_total["detalhadas_objetos"] += 1
                else:
                    descricao, score_clip, margem_clip = classificar_cena_clip(
                        embedding,
                        categoria,
                        prototipos,
                    )
                    conf_detalhe = score_clip

                    if descricao:
                        metodo = "clip_zero_shot"
                        stats_total["detalhadas_clip"] += 1
                    else:
                        descricao = NOMES_GENERICOS.get(categoria, categoria.capitalize())
                        metodo = "nome_generico_seguro"
                        stats_total["genericas"] += 1

            pasta_destino = pasta_hotel / pasta_categoria
            base = f"{descricao} {preposicao} {nome_limpo}"
            destino = proximo_destino(
                pasta_destino,
                base,
                arquivo.suffix,
                reservados,
            )

            try:
                status = executar_operacao(arquivo, destino, modo)
            except Exception as erro:
                print(f"   ❌ Erro ao processar {arquivo.name}: {erro}")
                status = f"erro: {erro}"
                stats_total["erros"] += 1

            linhas_relatorio.append(
                linha_relatorio(
                    nome_limpo,
                    arquivo,
                    pasta_categoria,
                    descricao,
                    metodo,
                    float(conf_categoria),
                    conf_detalhe,
                    margem_clip,
                    objetos,
                    destino,
                    modo,
                    status,
                )
            )

        print("   ✅ Resultado:")
        emojis = {
            "entretenimento": "🎭",
            "gastronomia": "🍽️",
            "acomodacoes": "🛏️",
            "criancas": "🧒",
            "_Revisar": "⚠️",
        }
        for categoria, quantidade in stats_hotel.items():
            if quantidade:
                print(f"      {emojis.get(categoria, '📁')} {categoria}: {quantidade}")

    relatorio = None
    try:
        relatorio = salvar_relatorio(pasta_hoteis, linhas_relatorio, modo)
    except Exception as erro:
        print(f"\n⚠️ Não foi possível salvar o relatório CSV: {erro}")

    print(f"\n{'═' * 68}")
    print("🏁 CONCLUÍDO!")
    print(f"   ✅ Categorias aceitas:       {stats_total['classificadas']}")
    print(f"   🔎 Detalhadas por objetos:   {stats_total['detalhadas_objetos']}")
    print(f"   🧠 Detalhadas pelo CLIP:     {stats_total['detalhadas_clip']}")
    print(f"   🛡️ Mantidas como genéricas: {stats_total['genericas']}")
    print(f"   👤 Com humanos:              {stats_total['com_humanos']}")
    print(f"   ⚠️ Para revisar:             {stats_total['revisar']}")
    print(f"   ❌ Erros:                    {stats_total['erros']}")
    if relatorio:
        print(f"   📄 Relatório: {relatorio}")

    if modo == "SIMULAR":
        print("\n💡 Revise o CSV. Se estiver satisfeito, execute novamente em modo COPIAR.")


def escolher_modo():
    print("\nEscolha o modo de execução:")
    print("   S = SIMULAR (recomendado; não copia nem move imagens)")
    print("   C = COPIAR  (preserva os arquivos originais)")
    print("   M = MOVER   (remove os arquivos da posição original)")
    resposta = input("\nModo (S/C/M) [S]: ").strip().upper() or "S"

    if resposta == "C":
        return "COPIAR"

    if resposta == "M":
        confirmacao = input(
            "⚠️ Para confirmar a movimentação dos originais, digite MOVER: "
        ).strip().upper()
        if confirmacao != "MOVER":
            print("Operação cancelada. Nenhum arquivo foi alterado.")
            sys.exit(0)
        return "MOVER"

    return "SIMULAR"


def main():
    print("=" * 68)
    print("  ORGANIZADOR DE IMAGENS DE HOTÉIS — V2")
    print("  CLIP + KNN + YOLO Open Images + nomes preparados para alt text")
    print("=" * 68)

    verificar_dependencias()

    if not Path(PASTA_EXEMPLOS).exists():
        print(f"❌ Pasta de exemplos não encontrada: {PASTA_EXEMPLOS}")
        sys.exit(1)
    if not Path(PASTA_HOTEIS).exists():
        print(f"❌ Pasta de hotéis não encontrada: {PASTA_HOTEIS}")
        sys.exit(1)

    modo = escolher_modo()
    modelo = carregar_modelo_clip()
    classificador, _ = treinar_classificador(modelo, PASTA_EXEMPLOS)
    prototipos = criar_prototipos_cenas(modelo)
    detector_pessoas, detector_objetos = carregar_detectores()

    classificar_e_organizar(
        modelo=modelo,
        classificador=classificador,
        prototipos=prototipos,
        detector_pessoas=detector_pessoas,
        detector_objetos=detector_objetos,
        pasta_hoteis=PASTA_HOTEIS,
        modo=modo,
    )


if __name__ == "__main__":
    main()