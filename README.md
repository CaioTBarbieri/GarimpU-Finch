# 🐦 GarimpU Finch

Ferramenta de garimpagem (scraping) de dados de hotéis no **Booking.com**, com interface web própria. A partir do nome de um hotel, o Finch busca o resultado, extrai informações estruturadas (endereço, coordenadas, Plus Code, nota, regime de alimentação, distância até o aeroporto) e baixa toda a galeria de fotos em alta resolução — tudo pronto para exportar em CSV ou ZIP.

## ✨ Funcionalidades

- 🔍 **Busca automática** do hotel no Booking.com a partir do nome digitado.
- 📍 **Extração de endereço e GPS**, com fallback entre dados estruturados (JSON-LD) e o link do mapa da página.
- 🧭 **Cálculo de distância até o aeroporto**: tenta extrair a distância informada pelo próprio Booking e, se não encontrar, calcula com base nas coordenadas (fórmula de Haversine com fator de correção de rota).
- 🗺️ **Geração de Plus Code** (Open Location Code) offline, a partir da latitude/longitude.
- 🍽️ **Identificação do regime de alimentação** (café da manhã, meia pensão, pensão completa, all inclusive) via análise de texto da página.
- 🖼️ **Download em massa de fotos em alta resolução**, salvas localmente e servidas via rota estática.
- 📊 **Exportação de dados em CSV** (com campo editável de ID interno).
- 📦 **Download de toda a galeria em um arquivo .ZIP**, gerado no navegador com JSZip.
- 🥷 **Puppeteer com Stealth Plugin**, bloqueando carregamento de imagens/estilos/fontes durante a navegação para acelerar o scraping.

## 🛠️ Tecnologias

- [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/)
- [puppeteer-extra](https://github.com/berstend/puppeteer-extra) + [puppeteer-extra-plugin-stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)
- [cheerio](https://cheerio.js.org/) (parsing de HTML)
- [open-location-code](https://www.npmjs.com/package/open-location-code) (geração de Plus Codes)
- [JSZip](https://stuk.github.io/jszip/) (via CDN, no front-end)
- [Tailwind CSS](https://tailwindcss.com/) (via CDN, no front-end)

## 📋 Pré-requisitos

- [Node.js](https://nodejs.org/) 18 ou superior
- npm

## 🚀 Instalação

O repositório contém apenas o `scraper.js` — o `package.json` não está versionado (está no `.gitignore`). Para rodar o projeto:

```bash
git clone https://github.com/CaioTBarbieri/GarimpU-Finch.git
cd GarimpU-Finch

npm init -y
npm install express puppeteer-extra puppeteer-extra-plugin-stealth cheerio open-location-code
```

### ⚠️ Configuração obrigatória

O caminho onde as fotos são salvas está fixo no código-fonte (`scraper.js`), na constante `PASTA_IMAGENS`:

```js
const PASTA_IMAGENS = 'C:\\Users\\Resorts Online\\Downloads\\Trabaio\\Software\\DOWNLOADS HOTEIS';
```

Antes de rodar o projeto, edite esse caminho para uma pasta existente na sua máquina (ou torne-o configurável via variável de ambiente).

## ▶️ Uso

Inicie o servidor:

```bash
node scraper.js
```

Acesse no navegador:

```
http://localhost:3000
```

Digite o nome do hotel, clique em **Pesquisar** e aguarde a extração — o processo pode levar de 1 a 3 minutos, dependendo da quantidade de fotos do hotel. Ao final, você pode:

- Exportar os dados extraídos em **CSV**
- Baixar toda a galeria em **ZIP**
- Baixar fotos individualmente

## 🔌 API

### `POST /api/buscar`

Busca um hotel e retorna os dados extraídos.

**Body:**
```json
{ "nome": "Nome do hotel ou resort" }
```

**Resposta (sucesso):**
```json
{
  "sucesso": true,
  "nome": "Nome do hotel",
  "endereco": "Rua, Cidade, Estado",
  "coordenadas": "-8.1311546, -34.9261358",
  "plusCode": "58QM+2H Recife, PE",
  "nota": "8,5",
  "regime": "Café da manhã incluído",
  "aeroporto": "12,3 km (Booking)",
  "imagens": ["/img/Nome_Do_Hotel/foto_HD_1.jpg", "..."]
}
```

### `GET /img/:pasta/:arquivo`

Serve as imagens baixadas localmente.

## ⚖️ Aviso legal

Este projeto realiza *web scraping* do site Booking.com. O uso é de responsabilidade de quem executa a ferramenta — verifique os [Termos de Uso](https://www.booking.com/content/terms.html) do site antes de utilizá-la, respeite limites de requisições e utilize os dados de forma ética e apenas para fins pessoais/internos.

## 📄 Licença

Nenhuma licença definida até o momento. Adicione um arquivo `LICENSE` caso deseje tornar o projeto open source.
