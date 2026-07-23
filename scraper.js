const express = require("express");
const path = require("path");
const criarBuscarRouter = require("./routes/buscar.routes");
const organizacaoRouter = require("./routes/organizacao.routes");
const { rasparDadosHotel } = require("./services/scraper.service");

const app = express();
const PORT = 3000;
const PASTA_IMAGENS =
  "C:\\Users\\User\\Downloads\\Trabaio\\Software\\DOWNLOADS HOTEIS";
const LAT_RECIFE = -14.815;
const LNG_RECIFE = -39.0333;

app.use(express.json());
app.use("/img", express.static(PASTA_IMAGENS));

app.use(organizacaoRouter);
app.use(
  criarBuscarRouter({
    rasparDadosHotel,
    latitudePadrao: LAT_RECIFE,
    longitudePadrao: LNG_RECIFE,
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