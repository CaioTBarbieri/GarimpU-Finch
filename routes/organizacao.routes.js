const express = require("express");
const {
  iniciarOrganizacao,
  estaExecutando,
} = require("../services/organizador-python.service");
const {
  obterEstado,
} = require("../state/status-organizacao");

const router = express.Router();

router.post("/api/organizar-tudo", (req, res) => {
  const reorganizar = req.body?.reorganizar === true;
  if (estaExecutando() || !iniciarOrganizacao({ reorganizar })) {
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

module.exports = router;
