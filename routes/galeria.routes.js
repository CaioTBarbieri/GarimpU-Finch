const express = require("express");
const { listarGaleriaHoteis } = require("../services/galeria.service");
const { PASTA_IMAGENS } = require("../config");

const router = express.Router();

router.get("/api/galeria-hoteis", (req, res) => {
  try {
    res.json(listarGaleriaHoteis(PASTA_IMAGENS));
  } catch (erro) {
    console.error("Erro ao listar a galeria local:", erro);
    res.status(500).json({
      erro: "Não foi possível listar as fotos salvas.",
    });
  }
});

module.exports = router;
