const express = require("express");
const { PASTA_IMAGENS } = require("../config");
const { normalizarFiltroDownload } = require("../services/filtro-download.service");
const { listarMunicipiosPorUf } = require("../services/localidades.service");
const { resolverPastaMaeDownload } = require("../services/pasta-download.service");
const { listarPastasMaeFlorence } = require("../services/pastas-florence.service");

function criarBuscarRouter({
  rasparDadosHotel,
  latitudePadrao,
  longitudePadrao,
  pastaImagensBase = PASTA_IMAGENS,
}) {
  const router = express.Router();

  router.get("/api/pastas-mae-download", (_req, res) => {
    try {
      res.json({ pastasMae: listarPastasMaeFlorence(pastaImagensBase) });
    } catch (_) {
      res.status(500).json({ erro: "Não foi possível listar as pastas-mãe." });
    }
  });

  router.get("/api/localidades/estados/:uf/municipios", async (req, res) => {
    try {
      const municipios = await listarMunicipiosPorUf(req.params.uf);
      res.json({ uf: String(req.params.uf).toUpperCase(), municipios });
    } catch (erro) {
      const status = erro instanceof TypeError ? 400 : 502;
      res.status(status).json({ erro: erro.message });
    }
  });

  router.post("/api/buscar", async (req, res) => {
    req.setTimeout(900000);
    res.setTimeout(900000);

    const {
      nome,
      baixarImagens,
      latitudeReferencia,
      longitudeReferencia,
      filtroDownload,
      pastaMaeDownload,
    } = req.body;

    const nomeNormalizado =
      typeof nome === "string" ? nome.replace(/\s+/g, " ").trim() : "";

    if (!nomeNormalizado) {
      return res.status(400).json({
        erro: "O nome do hotel é obrigatório",
      });
    }

    const deveBaixar = baixarImagens !== undefined ? baixarImagens : true;
    let destinoDownload;
    try {
      destinoDownload = resolverPastaMaeDownload(
        pastaImagensBase,
        deveBaixar ? pastaMaeDownload : "",
      );
    } catch (erro) {
      return res.status(400).json({ erro: erro.message });
    }
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
      destinoDownload.caminho,
    );

    if (resultado.sucesso) {
      res.json({
        ...resultado,
        pastaMaeDownload: destinoDownload.nome || null,
      });
    } else {
      res.status(500).json({ erro: resultado.erro });
    }
  });

  return router;
}

module.exports = criarBuscarRouter;
