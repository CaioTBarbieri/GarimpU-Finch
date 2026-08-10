const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  PASTA_FLORENCE,
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
const {
  listarPastasMaeFlorence,
  resolverPastaMaeFlorence,
} = require("../services/pastas-florence.service");

const router = express.Router();

router.post("/api/organizar-tudo", (req, res) => {
  const reorganizar =
    req.body?.reorganizar === true ||
    req.body?.reorganizar === "true";
  let pastasSelecionadas = [PASTA_FLORENCE];
  let pastasMae = [];
  if (reorganizar) {
    try {
      const recebidas = Array.isArray(req.body?.pastasMae)
        ? req.body.pastasMae
        : req.body?.pastaMae
          ? [req.body.pastaMae]
          : [];
      pastasMae = [...new Set(recebidas.map((nome) => String(nome).trim()))]
        .filter(Boolean);
      if (pastasMae.length === 0) {
        return res.status(400).json({
          erro: "Selecione ao menos uma pasta-mãe para reorganizar.",
        });
      }
      pastasSelecionadas = pastasMae.map((pastaMae) =>
        resolverPastaMaeFlorence(PASTA_FLORENCE, pastaMae),
      );
    } catch (erro) {
      return res.status(400).json({ erro: erro.message });
    }
  }
  if (
    estaExecutando() ||
    !iniciarOrganizacao({ reorganizar, pastasImagens: pastasSelecionadas })
  ) {
    return res.status(409).json({
      erro: "Já existe uma organização de imagens em andamento.",
    });
  }

  return res.status(202).json({
    sucesso: true,
    reorganizar,
    pastasMae,
    mensagem: "Organização iniciada.",
  });
});

router.get("/api/pastas-mae-florence", (_req, res) => {
  try {
    res.json({ pastasMae: listarPastasMaeFlorence(PASTA_FLORENCE) });
  } catch (erro) {
    res.status(500).json({ erro: "Não foi possível listar as pastas-mãe." });
  }
});

router.get("/api/status-organizacao", (req, res) => {
  res.json(obterEstado());
});

router.get("/api/estimativa-florence", (req, res) => {
  try {
    const reorganizar = req.query?.reorganizar === "true";
    const nomesRecebidos = Array.isArray(req.query?.pastaMae)
      ? req.query.pastaMae
      : req.query?.pastaMae
        ? [req.query.pastaMae]
        : [];
    const pastasSelecionadas = reorganizar && nomesRecebidos.length > 0
      ? [...new Set(nomesRecebidos)].map((pastaMae) =>
          resolverPastaMaeFlorence(PASTA_FLORENCE, pastaMae),
        )
      : [PASTA_FLORENCE];
    res.json(
      calcularEstimativaFlorence({
        pastasImagens: pastasSelecionadas,
        pastaLogs: PASTA_LOGS_FLORENCE,
        reorganizar,
      }),
    );
  } catch (erro) {
    if (erro instanceof TypeError) {
      return res.status(400).json({ erro: erro.message });
    }
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
