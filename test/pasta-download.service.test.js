const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  normalizarNomePastaMaeDownload,
  resolverPastaMaeDownload,
} = require("../services/pasta-download.service");

test("normaliza o nome opcional da pasta mãe do download", () => {
  assert.equal(normalizarNomePastaMaeDownload("  Ceará   2026  "), "Ceará 2026");
  assert.equal(normalizarNomePastaMaeDownload(""), "");
});

test("resolve a pasta mãe sempre como filha da pasta de imagens", () => {
  const base = path.resolve("img");
  assert.deepEqual(resolverPastaMaeDownload(base, "Bahia"), {
    nome: "Bahia",
    caminho: path.join(base, "Bahia"),
  });
  assert.equal(resolverPastaMaeDownload(base, "").caminho, base);
});

test("rejeita caminhos e nomes inválidos para a pasta mãe", () => {
  ["../fora", "cidade/hotel", "cidade\\hotel", "CON", "nome?"].forEach(
    (nome) => assert.throws(() => resolverPastaMaeDownload("img", nome)),
  );
});
