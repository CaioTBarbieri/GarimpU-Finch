const express = require("express");
const { normalizarFiltroDownload } = require("../services/filtro-download.service");

function criarBuscarRouter({
  rasparDadosHotel,
  latitudePadrao,
  longitudePadrao,
}) {
  const router = express.Router();

  router.post("/api/buscar", async (req, res) => {
    req.setTimeout(900000);
    res.setTimeout(900000);

    const {
      nome,
      baixarImagens,
      latitudeReferencia,
      longitudeReferencia,
      filtroDownload,
    } = req.body;

    const nomeNormalizado =
      typeof nome === "string" ? nome.replace(/\s+/g, " ").trim() : "";

    if (!nomeNormalizado) {
      return res.status(400).json({
        erro: "O nome do hotel é obrigatório",
      });
    }

    const deveBaixar = baixarImagens !== undefined ? baixarImagens : true;
    let filtroDownloadFinal;
    try {
      filtroDownloadFinal = normalizarFiltroDownload(filtroDownload);
    } catch (erro) {
      return res.status(400).json({ erro: erro.message });
    }

    const latitudeFinal =
      latitudeReferencia !== undefined && latitudeReferencia !== ""
        ? Number(latitudeReferencia)
        : latitudePadrao;

    const longitudeFinal =
      longitudeReferencia !== undefined && longitudeReferencia !== ""
        ? Number(longitudeReferencia)
        : longitudePadrao;

    if (
      !Number.isFinite(latitudeFinal) ||
      latitudeFinal < -90 ||
      latitudeFinal > 90
    ) {
      return res.status(400).json({
        erro: "Digite uma latitude válida, entre -90 e 90.",
      });
    }

    if (
      !Number.isFinite(longitudeFinal) ||
      longitudeFinal < -180 ||
      longitudeFinal > 180
    ) {
      return res.status(400).json({
        erro: "Digite uma longitude válida, entre -180 e 180.",
      });
    }

    const resultado = await rasparDadosHotel(
      nomeNormalizado,
      deveBaixar,
      latitudeFinal,
      longitudeFinal,
      filtroDownloadFinal,
    );

    if (resultado.sucesso) {
      res.json(resultado);
    } else {
      res.status(500).json({ erro: resultado.erro });
    }
  });

  return router;
}

module.exports = criarBuscarRouter;
