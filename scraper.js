const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  interceptarConsole,
} = require("./services/log-broadcaster.service");

// Precisa rodar antes de qualquer outro require que possa logar, para que
// nenhuma mensagem escape do espelhamento para a aba Terminal da interface.
interceptarConsole();

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
const logsRouter = require("./routes/logs.routes");
const {
  rasparDadosHotel,
  fecharNavegadoresAtivos,
} = require("./services/scraper.service");
const {
  encerrarOrganizacao,
} = require("./services/organizador-python.service");

let servidorAtivo = null;

function criarAplicacao() {
  fs.mkdirSync(PASTA_IMAGENS, { recursive: true });
  if (!fs.statSync(PASTA_IMAGENS).isDirectory()) {
    throw new Error(`PASTA_IMAGENS não é uma pasta: ${PASTA_IMAGENS}`);
  }
  fs.mkdirSync(PASTA_LOGS_FLORENCE, { recursive: true });

  const app = express();
  app.use(express.json());
  app.use("/img", express.static(PASTA_IMAGENS));
  app.use(organizacaoRouter);
  app.use(galeriaRouter);
  app.use(logsRouter);
  app.use(
    criarBuscarRouter({
      rasparDadosHotel,
      latitudePadrao: LATITUDE_PADRAO,
      longitudePadrao: LONGITUDE_PADRAO,
      pastaImagensBase: PASTA_IMAGENS,
    }),
  );

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });
  app.use(express.static(path.join(__dirname, "public")));

  return app;
}

function iniciarServidor({ porta = PORT, host = "127.0.0.1" } = {}) {
  if (servidorAtivo) {
    return Promise.reject(
      new Error("O servidor GarimpU Finch já está em execução."),
    );
  }

  const app = criarAplicacao();
  return new Promise((resolve, reject) => {
    const servidor = app.listen(porta, host);

    const falhar = (erro) => {
      servidor.removeListener("listening", pronto);
      reject(erro);
    };
    const pronto = () => {
      servidor.removeListener("error", falhar);
      servidorAtivo = servidor;
      const endereco = servidor.address();
      const portaReal =
        endereco && typeof endereco === "object" ? endereco.port : porta;
      console.log(`[+] Servidor iniciado em http://${host}:${portaReal}`);
      resolve({ app, servidor, porta: portaReal, host });
    };

    servidor.once("error", falhar);
    servidor.once("listening", pronto);
  });
}

async function encerrarServidor() {
  encerrarOrganizacao();
  await fecharNavegadoresAtivos();

  const servidor = servidorAtivo;
  servidorAtivo = null;
  if (!servidor) return;

  await new Promise((resolve) => {
    servidor.close(() => resolve());
    if (typeof servidor.closeAllConnections === "function") {
      servidor.closeAllConnections();
    }
  });
}

if (require.main === module) {
  iniciarServidor().catch((erro) => {
    console.error(`[-] Falha ao iniciar: ${erro.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  criarAplicacao,
  iniciarServidor,
  encerrarServidor,
};
