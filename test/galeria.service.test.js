const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { listarGaleriaHoteis } = require("../services/galeria.service");

function criarArquivo(caminho) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, "");
}

test("lista fotos por hotel, incluindo subpastas e sem arquivos auxiliares", (t) => {
  const pastaBase = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-hoteis-"));
  t.after(() => fs.rmSync(pastaBase, { recursive: true, force: true }));

  criarArquivo(path.join(pastaBase, "Hotel_Exemplo", "foto_HD_1.jpg"));
  criarArquivo(
    path.join(
      pastaBase,
      "Hotel_Exemplo",
      "acomodacoes",
      "quarto superior.webp",
    ),
  );
  criarArquivo(path.join(pastaBase, "Hotel_Exemplo", "alt_texts.json"));
  criarArquivo(path.join(pastaBase, "Hotel_Vazio", "leia-me.txt"));

  const resultado = listarGaleriaHoteis(pastaBase);

  assert.equal(resultado.totalHoteis, 1);
  assert.equal(resultado.totalImagens, 2);
  assert.equal(resultado.hoteis[0].nome, "Hotel Exemplo");
  assert.equal(resultado.hoteis[0].totalImagens, 2);
  assert.deepEqual(
    resultado.hoteis[0].imagens.map((imagem) => imagem.categoria),
    ["acomodacoes", "Sem categoria"],
  );
  assert.match(
    resultado.hoteis[0].imagens[0].url,
    /^\/img\/Hotel_Exemplo\/acomodacoes\/quarto%20superior\.webp$/,
  );
});

test("agrupa imagens soltas e aceita as extensões do organizador", (t) => {
  const pastaBase = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-soltas-"));
  t.after(() => fs.rmSync(pastaBase, { recursive: true, force: true }));

  criarArquivo(path.join(pastaBase, "entrada.tiff"));
  criarArquivo(path.join(pastaBase, "ignorar.json"));

  const resultado = listarGaleriaHoteis(pastaBase);

  assert.equal(resultado.totalHoteis, 1);
  assert.equal(resultado.totalImagens, 1);
  assert.equal(resultado.hoteis[0].nome, "Imagens soltas");
  assert.equal(resultado.hoteis[0].imagens[0].url, "/img/entrada.tiff");
});
