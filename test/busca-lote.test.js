const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizarEntradasLote } = require("../public/js/busca");

test("ignora linhas vazias e espaços extras na pesquisa em lote", () => {
  const entradas = normalizarEntradasLote(`
    Hotel Areias Belas Maragogi


    Árvo   Boutique Hotel Maragogi
\t
    GRAND OCA MARAGOGI RESORT Maragogi
  `);

  assert.deepEqual(entradas, [
    "Hotel Areias Belas Maragogi",
    "Árvo Boutique Hotel Maragogi",
    "GRAND OCA MARAGOGI RESORT Maragogi",
  ]);
});

test("remove duplicados e normaliza espaços não separáveis", () => {
  const entradas = normalizarEntradasLote(
    "Hotel\u00a0Exemplo\r\nHotel Exemplo\r\nOutro Hotel",
  );

  assert.deepEqual(entradas, ["Hotel Exemplo", "Outro Hotel"]);
});
