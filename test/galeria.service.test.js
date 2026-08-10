const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  excluirFoto,
  excluirPastaHotel,
  listarGaleriaHoteis,
  renomearFoto,
  resolverCaminhoInterno,
} = require("../services/galeria.service");

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

test("encontra hotéis dentro de pastas mães sem agrupá-los pela cidade", (t) => {
  const pastaBase = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-cidades-"));
  t.after(() => fs.rmSync(pastaBase, { recursive: true, force: true }));

  criarArquivo(
    path.join(
      pastaBase,
      "Jericoacoara",
      "Hotel_Duna",
      "acomodacoes",
      "quarto.jpg",
    ),
  );
  criarArquivo(
    path.join(
      pastaBase,
      "Itacaré",
      "Hotel_Praia",
      "gastronomia",
      "cafe.jpg",
    ),
  );

  const resultado = listarGaleriaHoteis(pastaBase);

  assert.equal(resultado.totalHoteis, 2);
  assert.equal(resultado.totalImagens, 2);
  assert.deepEqual(
    resultado.hoteis.map((hotel) => hotel.nome).sort(),
    ["Hotel Duna", "Hotel Praia"],
  );
  assert.deepEqual(
    resultado.hoteis.map((hotel) => hotel.pasta).sort(),
    ["Itacaré/Hotel_Praia", "Jericoacoara/Hotel_Duna"],
  );
  assert.deepEqual(
    resultado.hoteis.map((hotel) => hotel.pastaMae).sort(),
    ["Itacaré", "Jericoacoara"],
  );
});

test("distingue hotéis sem pasta mãe dos hotéis aninhados", (t) => {
  const pastaBase = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-filtro-mae-"));
  t.after(() => fs.rmSync(pastaBase, { recursive: true, force: true }));

  criarArquivo(path.join(pastaBase, "Hotel_Raiz", "foto.jpg"));
  criarArquivo(path.join(pastaBase, "Bahia", "Hotel_Costa", "foto.jpg"));

  const resultado = listarGaleriaHoteis(pastaBase);
  const porNome = Object.fromEntries(
    resultado.hoteis.map((hotel) => [hotel.nome, hotel]),
  );

  assert.equal(porNome["Hotel Raiz"].pastaMae, null);
  assert.equal(porNome["Hotel Costa"].pastaMae, "Bahia");
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

test("renomeia foto preservando extensão e removendo caracteres inválidos", (t) => {
  const pastaBase = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-renomear-"));
  t.after(() => fs.rmSync(pastaBase, { recursive: true, force: true }));
  criarArquivo(path.join(pastaBase, "Hotel", "foto antiga.jpg"));

  const foto = renomearFoto(
    pastaBase,
    "Hotel/foto antiga.jpg",
    "Suíte: vista * mar",
  );

  assert.equal(foto.nome, "Suíte vista mar.jpg");
  assert.equal(foto.caminho, "Hotel/Suíte vista mar.jpg");
  assert.equal(foto.url, "/img/Hotel/Su%C3%ADte%20vista%20mar.jpg");
  assert.equal(fs.existsSync(path.join(pastaBase, ...foto.caminho.split("/"))), true);
});

test("exclui uma foto sem remover a pasta do hotel", (t) => {
  const pastaBase = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-excluir-"));
  t.after(() => fs.rmSync(pastaBase, { recursive: true, force: true }));
  const foto = path.join(pastaBase, "Hotel", "foto.jpg");
  criarArquivo(foto);

  excluirFoto(pastaBase, "Hotel/foto.jpg");

  assert.equal(fs.existsSync(foto), false);
  assert.equal(fs.existsSync(path.dirname(foto)), true);
});

test("exclui a pasta do hotel e todo o conteúdo", (t) => {
  const pastaBase = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-pasta-"));
  t.after(() => fs.rmSync(pastaBase, { recursive: true, force: true }));
  const pastaHotel = path.join(pastaBase, "Hotel");
  criarArquivo(path.join(pastaHotel, "categoria", "foto.jpg"));
  criarArquivo(path.join(pastaHotel, "alt_texts.json"));

  excluirPastaHotel(pastaBase, "Hotel");

  assert.equal(fs.existsSync(pastaHotel), false);
});

test("exclui hotel dentro de pasta mãe sem excluir a cidade", (t) => {
  const pastaBase = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-mae-"));
  t.after(() => fs.rmSync(pastaBase, { recursive: true, force: true }));
  const cidade = path.join(pastaBase, "Jericoacoara");
  const pastaHotel = path.join(cidade, "Hotel_Duna");
  criarArquivo(path.join(pastaHotel, "acomodacoes", "foto.jpg"));

  excluirPastaHotel(pastaBase, "Jericoacoara/Hotel_Duna");

  assert.equal(fs.existsSync(pastaHotel), false);
  assert.equal(fs.existsSync(cidade), true);
});

test("rejeita caminhos fora da pasta configurada", (t) => {
  const pastaBase = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-seguranca-"));
  t.after(() => fs.rmSync(pastaBase, { recursive: true, force: true }));

  assert.throws(
    () => resolverCaminhoInterno(pastaBase, "../arquivo.jpg"),
    /fora da pasta de imagens/,
  );
  assert.throws(
    () => excluirPastaHotel(pastaBase, "../outra-pasta"),
    /Pasta de hotel inválida/,
  );
});
