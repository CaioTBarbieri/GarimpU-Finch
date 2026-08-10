# Validação atual do GarimpU Finch

Documento de referência da branch `ambiente-testes` em 23/07/2026. Esta etapa
registra a estrutura e as verificações sintáticas existentes, sem validar o
resultado do scraping ou dos modelos de IA.

## Estrutura atual

```text
scraper.js                         Entrada do servidor Express e scraping
routes/
  buscar.routes.js                 Rota de busca de hotéis
  organizacao.routes.js            Rotas e estado da organização de imagens
public/
  index.html                       Interface web
  js/
    interface.js                   Estado da tela, CSV, Wix, galeria e ZIP
    organizacao.js                 Painel e acompanhamento da organização
    busca.js                       Busca individual e em lote
organizar_hoteis.py                Processo Python principal
Fotos exemplos/                    Base local de imagens classificadas
yolov8n.pt                         Modelo YOLO versionado
cache_embeddings_treino.npz        Cache de embeddings versionado
package.json                       Metadados e comandos npm
package-lock.json                  Lockfile atual
```

O processo Node.js é iniciado por `scraper.js`. Ele configura JSON, publica
`PASTA_IMAGENS` em `/img`, registra os routers, entrega `public/index.html` e
serve os arquivos estáticos de `public/`. A porta é fixa em `3000`.

O processo Python principal é `organizar_hoteis.py`. Ele é iniciado pela rota de
organização por meio de `spawn("python", ["-u", scriptPython])`.

## Rotas disponíveis

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/` | Entrega `public/index.html`. |
| `POST` | `/api/buscar` | Pesquisa um hotel, extrai dados e opcionalmente baixa imagens. |
| `POST` | `/api/organizar-tudo` | Inicia a organização local das imagens com Python. |
| `GET` | `/api/status-organizacao` | Retorna estado, progresso e estimativas da organização. |
| `GET` | `/img/*` | Publica as imagens armazenadas em `PASTA_IMAGENS`. |
| `GET` | arquivos de `public/` | Publica JavaScript e demais arquivos estáticos da interface. |

## Fluxo da busca de hotéis

1. A interface envia `nome`, `baixarImagens`, `latitudeReferencia` e
   `longitudeReferencia` para `POST /api/buscar`.
2. `routes/buscar.routes.js` valida nome e coordenadas e chama
   `rasparDadosHotel`, definida em `scraper.js`.
3. Quando a entrada é um nome, o Puppeteer consulta os resultados da
   Booking.com e tenta localizar um cartão de propriedade até três vezes.
   Quando é um link válido da Booking.com, abre diretamente a página do hotel.
4. Puppeteer e Cheerio extraem nome, endereço, avaliação, descrição,
   coordenadas e dados auxiliares.
5. O servidor infere bairro, tipo, beira-mar e regime alimentar, calcula o Plus
   Code e obtém ou estima a distância do aeroporto.
6. As URLs da galeria são coletadas. Com `baixarImagens: true`, os arquivos são
   gravados em `PASTA_IMAGENS`; caso contrário, são retornadas URLs remotas.
7. Imagens locais e `alt_texts.json` existentes são incorporados à resposta.
8. O navegador exibe o resultado e pode acumular os dados em CSV. O modo em
   lote executa buscas sequenciais sem baixar imagens.

## Fluxo da organização das imagens

1. A interface chama `POST /api/organizar-tudo`.
2. `routes/organizacao.routes.js` impede duas execuções simultâneas, inicializa
   o estado e executa `organizar_hoteis.py` sem buffering.
3. O Python verifica dependências, define a pasta alvo e carrega CLIP, o
   classificador treinado/cacheado, YOLOv8 e Florence-2.
4. Somente imagens soltas nas pastas dos hotéis entram na contagem global.
5. YOLO separa imagens com pessoas. CLIP/KNN classifica as demais em categorias;
   Florence-2 e o tradutor geram descrições usadas nos nomes e textos
   alternativos.
6. Os arquivos são movidos para subpastas como `acomodacoes`, `gastronomia`,
   `entretenimento`, `criancas`, `_Com_Humanos` ou `_Revisar`.
7. O Python emite linhas `STATUS_JSON`; o Node calcula tempo decorrido, média
   móvel e previsão, disponibilizados em `GET /api/status-organizacao`.
8. Cada hotel pode receber um `alt_texts.json` com as descrições geradas.

## Caminhos e configurações locais

Configurações atuais que dependem da máquina:

- `scraper.js`:
  - `PASTA_IMAGENS =
    C:\Users\User\Downloads\Trabaio\Software\DOWNLOADS HOTEIS`;
  - `PORT = 3000`;
  - latitude padrão `-14.815`;
  - longitude padrão `-39.0333`.
- `organizar_hoteis.py`:
  - `PASTA_EXEMPLOS =
    C:\Users\User\Downloads\Novo Garimpu\GarimpU-Finch\Fotos exemplos`;
  - `PASTA_HOTEIS =
    C:\Users\User\Downloads\Trabaio\Software\DOWNLOADS HOTEIS`;
  - cache `cache_embeddings_treino.npz`;
  - modelo local `yolov8n.pt`.

`PASTA_IMAGENS` e `PASTA_HOTEIS` precisam representar a mesma raiz para que a
interface encontre as imagens organizadas.

## Comandos

### Iniciar

```powershell
node scraper.js
```

Com o ambiente Python:

```powershell
venv\Scripts\Activate.ps1
node scraper.js
```

A interface fica disponível em <http://localhost:3000>.

### Validar

Todos os JavaScript próprios:

```powershell
npm run check
```

Python:

```powershell
npm run check:python
```

Todas as verificações:

```powershell
npm run validate
```

O comando Python executado pelo script é:

```powershell
python -m py_compile organizar_hoteis.py
```

## Resultado da linha de base

Antes das alterações desta etapa:

- `node --check` passou em `scraper.js`, nos dois routers e nos três JavaScript
  do navegador;
- `python -m py_compile organizar_hoteis.py` passou;
- a árvore de trabalho estava limpa.

Esses comandos verificam sintaxe. Eles não exercitam a Booking.com, downloads,
CSV, navegador, modelos ou movimentação real de imagens.

## Problemas encontrados

1. O campo `main` de `package.json` aponta para `extracao_melhorada.js`, arquivo
   que não existe na estrutura atual. A entrada real é `scraper.js`.
2. `package.json` e `package-lock.json` declaram apenas `express`, mas
   `scraper.js` também requer `puppeteer-extra`,
   `puppeteer-extra-plugin-stealth`, `cheerio` e `open-location-code`. Uma
   instalação limpa baseada somente no manifesto não reproduz o ambiente atual.
3. O script `npm test` sempre termina com erro porque ainda não há testes
   automatizados.
4. Não existem testes funcionais ou de contrato automatizados para as APIs,
   interface, CSV, scraping e organização de imagens.
5. Os caminhos de imagens e exemplos são absolutos e específicos desta máquina.
6. A porta e as coordenadas padrão são constantes fixas no código.
7. Tailwind CSS, JSZip e Papa Parse são carregados por CDN, portanto a interface
   depende de rede para essas bibliotecas.
8. `python -m py_compile` cria `__pycache__/`, que não está coberto pelo
   `.gitignore` atual.
9. O funcionamento completo depende da estrutura externa da Booking.com, da
   rede, dos modelos locais e das versões das bibliotecas instaladas.
