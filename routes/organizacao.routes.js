const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  PASTA_IMAGENS,
  PASTA_LOGS_FLORENCE,
} = require("../config");
const {
  calcularEstimativaFlorence,
} = require("../services/estimativa-florence.service");
const {
  iniciarOrganizacao,
  estaExecutando,
} = require("../services/organizador-python.service");
const {
  obterEstado,
} = require("../state/status-organizacao");

const router = express.Router();

router.post("/api/organizar-tudo", (req, res) => {
  if (estaExecutando() || !iniciarOrganizacao()) {
    return res.status(409).json({
      erro: "Já existe uma organização de imagens em andamento.",
    });
  }

  return res.status(202).json({
    sucesso: true,
    mensagem: "Organização iniciada.",
  });
});

router.get("/api/status-organizacao", (req, res) => {
  res.json(obterEstado());
});

router.get("/api/estimativa-florence", (req, res) => {
  try {
    res.json(
      calcularEstimativaFlorence({
        pastaImagens: PASTA_IMAGENS,
        pastaLogs: PASTA_LOGS_FLORENCE,
      }),
    );
  } catch (erro) {
    console.error("Erro ao calcular estimativa Florence:", erro);
    res.status(500).json({
      erro: "Não foi possível calcular a estimativa do Florence.",
    });
  }
});

router.get("/api/log-florence", (req, res) => {
  const caminhoLog = path.resolve(
    PASTA_LOGS_FLORENCE,
    "log_classificacao_florence.csv",
  );

  if (!fs.existsSync(caminhoLog) || !fs.statSync(caminhoLog).isFile()) {
    return res.status(404).json({
      erro: "O log do Florence ainda não foi gerado. Execute a organização primeiro.",
    });
  }

  return res.download(
    caminhoLog,
    "log_classificacao_florence.csv",
    (erro) => {
      if (erro && !res.headersSent) {
        res.status(500).json({
          erro: "Não foi possível baixar o log do Florence.",
        });
      }
    },
  );
});

module.exports = router;
