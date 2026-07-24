const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  PORT,
  PASTA_IMAGENS,
  PASTA_LOGS_FLORENCE,
  LATITUDE_PADRAO,
  LONGITUDE_PADRAO,
} = require("./config");
const criarBuscarRouter = require("./routes/buscar.routes");
const galeriaRouter = require("./routes/galeria.routes");
const organizacaoRouter = require("./routes/organizacao.routes");
const { rasparDadosHotel } = require("./services/scraper.service");

const app = express();
if (!fs.existsSync(PASTA_IMAGENS)) {
  throw new Error(
    `PASTA_IMAGENS não existe: ${PASTA_IMAGENS}\n` +
      "Configure-a pela variável de ambiente PASTA_IMAGENS ou em config/local.js.",
  );
}

if (!fs.statSync(PASTA_IMAGENS).isDirectory()) {
  throw new Error(
    `PASTA_IMAGENS não é uma pasta: ${PASTA_IMAGENS}\n` +
      "Configure-a pela variável de ambiente PASTA_IMAGENS ou em config/local.js.",
  );
}

fs.mkdirSync(PASTA_LOGS_FLORENCE, { recursive: true });

app.use(express.json());
app.use("/img", express.static(PASTA_IMAGENS));

app.use(organizacaoRouter);
app.use(galeriaRouter);
app.use(
  criarBuscarRouter({
    rasparDadosHotel,
    latitudePadrao: LATITUDE_PADRAO,
    longitudePadrao: LONGITUDE_PADRAO,
  }),
);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`\n[+] Servidor da Interface Gráfica iniciado com sucesso!`);
  console.log(`[+] Aceda no seu navegador: http://localhost:${PORT}\n`);
});
