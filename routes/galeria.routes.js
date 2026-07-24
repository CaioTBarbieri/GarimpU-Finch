const express = require("express");
const {
  excluirFoto,
  excluirPastaHotel,
  listarGaleriaHoteis,
  renomearFoto,
} = require("../services/galeria.service");
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

router.patch("/api/galeria/foto", (req, res) => {
  try {
    const foto = renomearFoto(
      PASTA_IMAGENS,
      req.body?.caminho,
      req.body?.novoNome,
    );
    res.json({ mensagem: "Foto renomeada com sucesso.", foto });
  } catch (erro) {
    console.error("Erro ao renomear foto:", erro);
    res.status(400).json({ erro: erro.message });
  }
});

router.delete("/api/galeria/foto", (req, res) => {
  try {
    excluirFoto(PASTA_IMAGENS, req.body?.caminho);
    res.json({ mensagem: "Foto excluída com sucesso." });
  } catch (erro) {
    console.error("Erro ao excluir foto:", erro);
    res.status(400).json({ erro: erro.message });
  }
});

router.delete("/api/galeria/hotel", (req, res) => {
  try {
    excluirPastaHotel(PASTA_IMAGENS, req.body?.pasta);
    res.json({ mensagem: "Pasta e fotos excluídas com sucesso." });
  } catch (erro) {
    console.error("Erro ao excluir pasta de hotel:", erro);
    res.status(400).json({ erro: erro.message });
  }
});

module.exports = router;
