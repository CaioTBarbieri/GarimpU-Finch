🛠 Pré-requisitos
Certifique-se de ter instalado na sua máquina:

Node.js (LTS recomendado).

Python (versão 3.8 ou superior).

Git (para versionamento).

⚙️ Configuração do Ambiente
1. Clonar e Navegar até a pasta

git clone <url-do-seu-repositorio>
cd GarimpU-Finch

2. Configuração do Ambiente Python (Isolado)
Para garantir que a IA não interfira com outros projetos:

# Criar ambiente virtual
python -m venv venv

# Ativar o ambiente virtual (Windows)

venv\Scripts\activate

3. Instalação de Dependências
Do Python (dentro do venv ativo):

pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install sentence-transformers Pillow numpy scikit-learn tqdm ultralytics

Do Node.js:

npm install express puppeteer-extra puppeteer-extra-plugin-stealth cheerio open-location-code

🚀 Como Executar

Sempre que desejar iniciar o sistema, siga estes passos no terminal:

Ative o ambiente Python:

venv\Scripts\activate

Inicie o servidor Node.js:

node scraper.js

Acesse a interface:
Abra o seu navegador e vá para: http://localhost:3000

📂 Estrutura de Pastas Esperada
scraper.js: Servidor principal e lógica de raspagem.

organizar_hoteis.py: Script de IA para categorização automática.

yolov8n.pt: Modelo de detecção de pessoas.

cache_embeddings_treino.npz: Cache de treinamento da IA (gerado automaticamente).

venv/: Pasta isolada do Python (ignorada pelo Git).

node_modules/: Pastas de dependências do Node (ignorada pelo Git).

⚠️ Notas Importantes
Caminhos das Pastas:

Verifique se a constante PASTA_IMAGENS no ficheiro scraper.js está apontando para o caminho correto na sua máquina.

Verifique também no organizar_hoteis.py os caminhos PASTA_EXEMPLOS (Pasta usada como fonte de conhecimento para organizar) e PASTA_HOTEIS (Pasta onde serão salvas as imagens).

Os caminhos PASTA_HOTEIS e PASTA_IMAGENS devem ser os mesmos.

Git: A pasta venv/ e node_modules/ não devem ser comitadas. Use o ficheiro .gitignore fornecido para garantir que o repositório se mantenha limpo.

Dica para o Git:
Se você ainda não criou o ficheiro .gitignore com as regras corretas, crie um agora com este conteúdo:

Plaintext
node_modules
venv/
