# GarimpU-Nexo

Aplicação local para pesquisar hotéis na Booking.com, extrair e revisar dados úteis
para cadastro, baixar galerias de fotos e preparar arquivos CSV compatíveis com uma
coleção de hotéis exportada do Wix.

O sistema reúne um servidor Node.js, uma interface web estática em `public/` e
um organizador opcional de imagens em Python.

## Funcionalidades

### Pesquisa e extração

A pesquisa aceita:

- o nome de um hotel, usado para consultar a página de resultados da Booking.com
  e selecionar o primeiro resultado; ou
- um link direto de hotel da Booking.com. Links de outros domínios são rejeitados.

Para cada hotel, o sistema tenta extrair ou inferir:

- nome oficial;
- endereço;
- bairro;
- tipo de hospedagem (`Hotel`, `Pousada` ou `Resort`), inferido pelo nome;
- indicação de beira-mar (`Sim` ou `Não`), inferida da descrição e das
  comodidades;
- coordenadas (latitude e longitude);
- Plus Code completo, calculado localmente a partir das coordenadas;
- nota de avaliação;
- regime alimentar;
- distância do aeroporto.

O regime alimentar pode ser identificado como All Inclusive, pensão completa,
meia pensão, café da manhã incluído ou café da manhã disponível. Quando a
informação não é encontrada, o valor retornado é `Não informado`.

A distância do aeroporto é obtida da Booking.com quando disponível. Caso
contrário, é estimada entre as coordenadas do hotel e as coordenadas de referência
informadas na interface/API, usando distância geodésica multiplicada pelo fator
fixo `1,23`. Portanto, o resultado calculado é apenas uma aproximação de trajeto,
não uma rota real.

### Imagens e galeria

Cada pesquisa pode ser executada:

- **com download de imagens**: as fotos encontradas são gravadas localmente, em
  uma subpasta do hotel dentro de `PASTA_IMAGENS`, e servidas pela rota `/img`;
- **sem download de imagens**: nenhuma foto é gravada e a galeria usa diretamente
  as URLs remotas encontradas na Booking.com.

Quando há armazenamento local, a aplicação também encontra imagens já existentes
nas subpastas do hotel e lê arquivos `alt_texts.json` gerados pelo organizador. A
interface exibe a galeria, permite abrir/baixar imagens individualmente e oferece
o download de toda a galeria em um arquivo
`<Nome_do_Hotel>_galeria_HD_COMPLETA.zip`. A compactação é feita no navegador.

### CSV e integração com Wix

A interface permite acumular vários hotéis pesquisados antes da exportação.
Campos editáveis, como ID Wix, bairro, tipo, beira-mar e regime alimentar, podem
ser revisados antes de adicionar o hotel ao conjunto.

Também é possível informar uma lista com um hotel ou link da Booking.com por
linha. A pesquisa em lote é executada sequencialmente, sem baixar imagens, e
adiciona automaticamente ao acumulador os hotéis processados com sucesso.

Há dois fluxos:

1. **Sem CSV do Wix**: cada hotel é acumulado em memória no navegador. Se o campo
   ID estiver vazio, a aplicação gera um UUID com `crypto.randomUUID()`. O
   resultado é exportado como `Hoteis_Dados_Acumulados.csv`.
2. **Com CSV completo exportado do Wix**: o arquivo precisa conter, no mínimo, as
   colunas `ID` e `Nome_Hotel`. Todas as colunas originais são preservadas. Um
   hotel existente é atualizado pela correspondência exata do ID; se um ID
   informado não existir, a inclusão é recusada para evitar atualizar o registro
   errado. Sem ID, um UUID é gerado e uma nova linha é cadastrada. O resultado é
   exportado como `Hoteis_texto_atualizado.csv`.

Ao carregar o CSV do Wix, a interface também tenta preencher automaticamente o
ID quando encontra uma correspondência única de `Nome_Hotel`, ignorando
maiúsculas, acentos, pontuação, ordem das palavras e complementos inequívocos.
No modo em lote, hotéis ausentes, repetidos ou ambíguos no CSV são ignorados; a
atualização efetiva da linha continua usando o ID do Wix.

Os nomes das colunas de exportação podem ser personalizados na tela inicial. Os
campos `ID` e `Nome_Hotel` permanecem fixos para preservar a integração.

Os dados acumulados existem apenas na memória da página. Recarregar ou fechar a
aba descarta a lista ainda não exportada.

### Organização opcional das imagens

O script `organizar_hoteis.py` classifica imagens locais nas categorias
`entretenimento`, `gastronomia`, `acomodacoes` e `criancas`. Ele usa embeddings
CLIP, exemplos do diretório `Fotos exemplos`, KNN e YOLOv8 para detectar fotos
com pessoas. Também pode gerar `alt_texts.json`. Esse processamento é separado da
extração principal e pode ser demorado, especialmente em CPU.

## Tecnologias

- Node.js e Express;
- Puppeteer Extra com plugin Stealth;
- Cheerio;
- Open Location Code;
- HTML e JavaScript no navegador;
- Tailwind CSS, JSZip e Papa Parse carregados por CDN;
- Python;
- PyTorch, Sentence Transformers/CLIP, Transformers, Pillow, NumPy,
  scikit-learn, tqdm, Ultralytics/YOLOv8 e deep-translator.

## Estrutura principal

```text
scraper.js
routes/
  buscar.routes.js
  organizacao.routes.js
public/
  index.html
  js/
    busca.js
    interface.js
    organizacao.js
organizar_hoteis.py
```

- `scraper.js`: configuração do Express e lógica de extração da Booking.com;
- `routes/buscar.routes.js`: rota `POST /api/buscar`;
- `routes/organizacao.routes.js`: rotas de início e status da organização;
- `public/index.html`: estrutura visual servida pelo Express;
- `public/js/`: lógica executada no navegador;
- `organizar_hoteis.py`: classificação, organização e descrição das imagens.

## Pré-requisitos

- Node.js com npm;
- Google Chrome/Chromium compatível com Puppeteer;
- acesso à internet para consultar a Booking.com, obter bibliotecas de frontend
  por CDN e, no primeiro uso, baixar modelos/dependências necessários;
- permissão de leitura e escrita no diretório configurado em `PASTA_IMAGENS`;
- Python **3.12.x** para o organizador de imagens. Outras versões do Python não
  são suportadas pela integração atual com o modelo Florence-2;
- ambiente virtual recomendado e espaço suficiente para modelos, cache e
  imagens.

Confirme a versão instalada antes de criar o ambiente virtual:

```powershell
python --version
```

A saída deve indicar uma versão `3.12.x`, por exemplo `Python 3.12.10`.

## Instalação

### Dependências Node.js

> **Estado do `package.json`:** a afirmação de que o `package.json` não está
> versionado não corresponde ao estado atual da branch `ambiente-testes`: o
> arquivo e o `package-lock.json` estão versionados. Entretanto, o manifesto
> atual está incompleto e declara somente `express`, embora `scraper.js` exija
> outros pacotes. Por isso, apenas `npm install` pode não preparar uma instalação
> nova corretamente.

Instale explicitamente as dependências usadas pelo servidor:

```powershell
npm install express puppeteer-extra puppeteer-extra-plugin-stealth cheerio open-location-code
```

### Dependências Python (opcionais)

O Python só é necessário para organizar/classificar as imagens:

```powershell
python -m venv venv
venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install sentence-transformers Pillow numpy scikit-learn tqdm ultralytics transformers accelerate deep-translator
```

## Configuração em uma nova máquina

As opções ficam centralizadas em `config/index.js`, sem `dotenv` ou dependências
adicionais. Cada valor é obtido nesta ordem:

1. variável de ambiente;
2. `config/local.js`, se o arquivo existir;
3. valor padrão portátil.

Copie o exemplo para criar uma configuração exclusiva da máquina:

```powershell
Copy-Item config/local.example.js config/local.js
```

`config/local.js` é ignorado pelo Git. Ajuste-o, por exemplo:

```js
const path = require("path");

module.exports = {
  PORT: 3000,
  PASTA_IMAGENS: path.resolve("D:\\", "Imagens de hotéis"),
  LATITUDE_PADRAO: -14.815,
  LONGITUDE_PADRAO: -39.0333,
  PYTHON_EXECUTABLE: path.resolve(".venv", "Scripts", "python.exe"),
  PYTHON_VERSION_ESPERADA: "3.12",
};
```

Opções disponíveis:

| Opção | Padrão | Regra |
| --- | --- | --- |
| `PORT` | `3000` | Inteiro entre 1 e 65535. |
| `PASTA_IMAGENS` | pasta `img` do projeto | Deve ser uma pasta existente. |
| `LATITUDE_PADRAO` | `-14.815` | Número entre -90 e 90. |
| `LONGITUDE_PADRAO` | `-39.0333` | Número entre -180 e 180. |
| `PYTHON_EXECUTABLE` | descoberta automática | Comando ou caminho explícito do Python. |
| `PYTHON_VERSION_ESPERADA` | `3.12` | Versão principal/secundária aceita pelo organizador. |

Também é possível configurar a sessão atual por variáveis de ambiente:

```powershell
$env:PASTA_IMAGENS = "D:\Imagens de hotéis"
$env:PORT = "3000"
node scraper.js
```

Crie `PASTA_IMAGENS` antes de iniciar o servidor. Se ela não existir, o servidor
informa o caminho inválido e onde configurá-lo. A pasta de treinamento do
organizador continua sendo `Fotos exemplos`, resolvida relativamente à raiz do
projeto; a pasta a organizar é sempre a mesma `PASTA_IMAGENS` usada pelo Node.

## Execução

Inicie o servidor diretamente:

```powershell
node scraper.js
```

Se também for usar o organizador Python, configure `PYTHON_EXECUTABLE` ou ative
antes o ambiente virtual:

```powershell
venv\Scripts\Activate.ps1
node scraper.js
```

Abra:

<http://localhost:3000>

Por padrão o servidor usa a porta `3000`; ela pode ser alterada pela configuração.

## Validação local

O workflow `.github/workflows/validate.yml` executa as mesmas verificações em
todo `push` e `pull_request`. Para reproduzi-las localmente:

```powershell
if (Test-Path package-lock.json) { npm ci } else { npm install }
npm run check
npm test

python -m py_compile organizar_hoteis.py
python -m compileall python_organizador
python -m unittest discover
```

`npm test` é executado pelo workflow somente quando o script `test` existe no
`package.json`. As verificações Python usam apenas compilação sintática e testes
unitários leves: não instalam nem carregam PyTorch, Florence, CLIP ou YOLO e não
executam scraping ou processamento de imagens.

## API

### `POST /api/buscar`

Pesquisa um hotel e retorna os dados extraídos. O corpo deve ser JSON:

```json
{
  "nome": "Nome do hotel ou https://www.booking.com/hotel/...",
  "baixarImagens": true,
  "latitudeReferencia": -14.815,
  "longitudeReferencia": -39.0333
}
```

Parâmetros:

| Campo | Tipo | Obrigatório | Comportamento |
| --- | --- | --- | --- |
| `nome` | string | sim | Nome do hotel ou link direto válido da Booking.com. |
| `baixarImagens` | boolean | não | Padrão `true`. Em `true`, grava as fotos em `PASTA_IMAGENS` e retorna URLs locais; em `false`, não grava arquivos e retorna URLs remotas. |
| `latitudeReferencia` | number | não | Latitude usada no cálculo alternativo da distância do aeroporto. Deve estar entre -90 e 90. |
| `longitudeReferencia` | number | não | Longitude usada no cálculo alternativo da distância do aeroporto. Deve estar entre -180 e 180. |

Quando as coordenadas de referência não são enviadas, o código usa os valores
fixos `-14.8150` e `-39.0333`.

Exemplo com `curl`:

```powershell
curl.exe -X POST http://localhost:3000/api/buscar `
  -H "Content-Type: application/json" `
  -d '{"nome":"Nome do hotel","baixarImagens":false,"latitudeReferencia":-14.815,"longitudeReferencia":-39.0333}'
```

Resposta de sucesso (`200`):

```json
{
  "sucesso": true,
  "nome": "Nome oficial",
  "endereco": "Endereço completo",
  "bairro": "Bairro",
  "tipoHotel": "Hotel",
  "beiraMar": "Não",
  "coordenadas": "-8.123, -34.123",
  "plusCode": "6947VVGJ+RC",
  "nota": "8,7",
  "regime": "Café da manhã incluído",
  "aeroporto": "12,3 km (Booking)",
  "imagens": [
    "/img/Nome_do_hotel/foto_HD_1.jpg"
  ],
  "altTexts": {
    "foto_HD_1.jpg": "Descrição da imagem"
  },
  "baixouLocal": true
}
```

Com `baixarImagens: false`, `imagens` contém URLs remotas e `baixouLocal` é
`false`. Campos não encontrados podem assumir textos como `Não informado`,
`Sem nota`, `GPS não disponível` ou `Não localizado`.

Erros de entrada retornam `400`:

```json
{
  "erro": "O nome do hotel é obrigatório"
}
```

Falhas durante navegação ou extração retornam `500`:

```json
{
  "erro": "Descrição do erro"
}
```

O timeout da rota é de 15 minutos, pois a navegação e o download de galerias
podem ser demorados.

## Limitações técnicas

- A extração depende da estrutura HTML, textos, disponibilidade e respostas da
  Booking.com; mudanças no site podem quebrar seletores e expressões regulares.
- A pesquisa por nome utiliza apenas o primeiro cartão retornado, que pode não
  representar o hotel desejado.
- Páginas com CAPTCHA, bloqueio antiautomação, restrição regional, conteúdo
  dinâmico incompleto ou indisponibilidade podem falhar.
- Tipo de hospedagem, bairro, beira-mar e regime são inferidos por regras
  textuais e devem ser revisados.
- O Plus Code depende de coordenadas válidas.
- O cálculo alternativo da distância do aeroporto não consulta rotas nem escolhe
  automaticamente um aeroporto; usa as coordenadas de referência fornecidas.
- A captura de imagens procura URLs JPEG da CDN da Booking.com e prioriza
  variantes `max1024`/`max1280`; outros formatos ou padrões podem não aparecer.
- Não há banco de dados, autenticação, fila, persistência de pesquisas ou
  isolamento entre usuários.
- Tailwind CSS, JSZip e Papa Parse dependem de CDNs externas.
- Downloads grandes consomem tempo, memória, rede e espaço em disco. A criação
  do ZIP ocorre no navegador e pode falhar com galerias muito grandes.
- O organizador de imagens usa caminhos absolutos configurados no código e
  modelos probabilísticos; sua classificação exige revisão humana.

## Uso responsável e web scraping

Este projeto automatiza o acesso a páginas de terceiros. Use-o somente quando
tiver autorização e finalidade legítima. Respeite os Termos de Serviço da
Booking.com, direitos autorais das imagens e textos, regras aplicáveis de
proteção de dados, limites de requisição e eventuais instruções de acesso
automatizado. Não use o sistema para contornar controles, sobrecarregar serviços
ou republicar conteúdo sem a licença ou permissão necessária. A responsabilidade
pelo uso, armazenamento e distribuição dos dados extraídos é de quem executa a
ferramenta.
