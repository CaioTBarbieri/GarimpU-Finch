# Build para Windows

O GarimpU Finch usa Electron para iniciar o servidor Express local, aguardar a
rota de saúde responder e abrir a interface na porta realmente escolhida. A
distribuição inclui Node.js/Electron, Chromium, as bibliotecas Python, os
modelos CLIP/Florence e YOLO, exemplos de treinamento e arquivos estáticos do
frontend. O computador de destino não precisa de Node.js, npm, Python ou
Chrome.

## Arquivos principais

Criados para a distribuição:

- `electron/main.js`: ciclo de vida do aplicativo, porta livre, janela,
  downloads, logs e encerramento;
- `assets/tailwind-input.css` e `tailwind.config.js`: CSS local da interface;
- `scripts/copy-vendor.js`: copia JSZip e Papa Parse para o frontend;
- `scripts/prepare-models.ps1`: prepara os modelos Hugging Face incluídos;
- `scripts/build-python.ps1` e `organizar_hoteis.spec`: geram o organizador com
  PyInstaller;
- `requirements-windows.txt`: versões Python usadas no binário validado;
- `BUILD_WINDOWS.md`: este documento.

Arquivos ajustados:

- `package.json` e `package-lock.json`;
- `.gitignore`;
- `scraper.js`;
- `config/index.js`;
- `services/scraper.service.js`;
- `services/python-runtime.service.js`;
- `services/organizador-python.service.js`;
- `organizar_hoteis.py`;
- `python_organizador/config.py`;
- `public/index.html`.

## Desenvolvimento

Instale as dependências e mantenha o cache do Chromium dentro do projeto:

```powershell
$env:PUPPETEER_CACHE_DIR = Join-Path (Get-Location) "resources\chromium"
npm install
```

Execute o aplicativo Electron:

```powershell
npm run dev
```

Execute somente o servidor web, se necessário:

```powershell
npm start
```

O servidor prefere a porta `3000`. No Electron, se ela estiver ocupada, a
primeira porta livre entre `3000` e `3049` é selecionada automaticamente.

## Build

Os comandos abaixo recriam os recursos locais, o organizador Python e os
artefatos Electron:

```powershell
npm run build:win
npm run build:portable
npm run dist
```

`npm run dist` gera os dois formatos. Os resultados ficam em:

```text
dist\GarimpU-Finch-Setup-1.1.0-x64.exe
dist\GarimpU-Finch-Portable-1.1.0-x64.exe
dist\win-unpacked\
```

O build Python usa `venv\Scripts\python.exe`. O ambiente de build precisa conter
as dependências do organizador e `PyInstaller`. Isso é necessário apenas na
máquina que gera a distribuição, não na máquina do usuário final.

Para recriar esse ambiente:

```powershell
py -3.12 -m venv venv
venv\Scripts\python.exe -m pip install -r requirements-windows.txt
```

## Ícone

Não há um `.ico` definitivo no repositório, portanto o build usa
temporariamente o ícone padrão do Electron. Para trocar:

1. coloque um ícone multirresolução em `build\icon.ico`;
2. adicione `"icon": "build/icon.ico"` dentro de `build.win` no `package.json`;
3. execute novamente `npm run dist`.

## Dados do usuário

O aplicativo não grava dentro de `app.asar` nem na pasta de instalação.

```text
Documentos\GarimpU Finch\Imagens\
Documentos\GarimpU Finch\Exportacoes\
Documentos\GarimpU Finch\Logs Florence\
%APPDATA%\garimpu-finch\logs\garimpu-finch.log
%APPDATA%\garimpu-finch\modelos\
```

As imagens pesquisadas ficam em `Imagens`. CSVs, ZIPs e logs baixados pela
interface ficam em `Exportacoes`. O cache de embeddings gravável fica em
`modelos`.

## O que enviar

Para uma instalação convencional, envie apenas:

```text
GarimpU-Finch-Setup-1.1.0-x64.exe
```

Para uso sem instalação, envie apenas:

```text
GarimpU-Finch-Portable-1.1.0-x64.exe
```

Como alternativa para diagnóstico, compacte e envie a pasta `win-unpacked`
inteira. Não envie apenas o executável interno dessa pasta, pois ele depende dos
arquivos e recursos ao redor.

O portátil de arquivo único precisa descompactar aproximadamente 3,1 GB em uma
pasta temporária a cada abertura. No computador de validação, a primeira
abertura levou cerca de 25 minutos. Por isso, o instalador é a opção recomendada;
para uso realmente portátil e abertura rápida, envie a pasta `win-unpacked`
inteira em um ZIP.

## Limitações

- A consulta depende da internet, da estrutura atual da Booking.com e pode ser
  afetada por CAPTCHA, bloqueios, mudanças de seletores ou limites do serviço.
- Traduções geradas pelo organizador usam um serviço externo e também dependem
  da internet.
- CLIP, Florence e YOLO são modelos pesados. A primeira inicialização da
  organização pode demorar e o processamento em CPU pode levar bastante tempo.
- A classificação e as inferências do scraper devem ser revisadas por uma
  pessoa.
- A distribuição não é assinada digitalmente; o Windows SmartScreen pode
  solicitar confirmação ao executá-la.
