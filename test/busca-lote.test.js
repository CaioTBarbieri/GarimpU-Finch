const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizarEntradasLote,
  parsearEntradasLote,
  prepararEntradasLotePesquisa,
} = require("../public/js/busca");

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

// 1. Parser de linha simples (sem ID)
test("parsearEntradasLote: linha simples sem ID", () => {
  const entradas = parsearEntradasLote("Pousada Pedra da Pipa");
  assert.deepEqual(entradas, [
    {
      idWix: "",
      consulta: "Pousada Pedra da Pipa",
      textoOriginal: "Pousada Pedra da Pipa",
      numeroLinha: 1,
    },
  ]);
});

// 2. Parser de "ID | consulta"
test("parsearEntradasLote: linha com ID e separador", () => {
  const entradas = parsearEntradasLote(
    "620f86a1-aaaa-bbbb-cccc-123456789000 | Pousada Pedra da Pipa",
  );
  assert.deepEqual(entradas, [
    {
      idWix: "620f86a1-aaaa-bbbb-cccc-123456789000",
      consulta: "Pousada Pedra da Pipa",
      textoOriginal:
        "620f86a1-aaaa-bbbb-cccc-123456789000 | Pousada Pedra da Pipa",
      numeroLinha: 1,
    },
  ]);
});

// 3. Espaços ao redor do separador são removidos, mas o ID não é alterado
test("parsearEntradasLote: espaços extras ao redor do separador", () => {
  const entradas = parsearEntradasLote("  abc123   |   Hotel Exemplo   ");
  assert.deepEqual(entradas[0].idWix, "abc123");
  assert.deepEqual(entradas[0].consulta, "Hotel Exemplo");
});

// 4. Linha vazia é ignorada
test("parsearEntradasLote: linhas vazias são ignoradas", () => {
  const entradas = parsearEntradasLote("Hotel A\n\n\nHotel B");
  assert.deepEqual(
    entradas.map((e) => e.consulta),
    ["Hotel A", "Hotel B"],
  );
});

// 5. ID vazio antes do separador é inválido
test("parsearEntradasLote: rejeita ID vazio antes do separador", () => {
  assert.throws(
    () => parsearEntradasLote("| Hotel Exemplo"),
    /Linha 1 inválida/,
  );
});

// 6. Consulta vazia depois do separador é inválida
test("parsearEntradasLote: rejeita consulta vazia depois do separador", () => {
  assert.throws(() => parsearEntradasLote("abc123 |"), /Linha 1 inválida/);
  assert.throws(() => parsearEntradasLote("abc123 |    "), /Linha 1 inválida/);
});

// 7. Mesmo ID e mesma consulta são deduplicados
test("prepararEntradasLotePesquisa: deduplica mesmo ID com mesma consulta", () => {
  const resultado = prepararEntradasLotePesquisa(
    "abc123 | Hotel Exemplo\nabc123 | Hotel Exemplo",
  );
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].idWix, "abc123");
});

// 8. Mesmo ID com consultas diferentes gera conflito e interrompe antes de pesquisar
test("prepararEntradasLotePesquisa: mesmo ID com consultas diferentes gera erro", () => {
  assert.throws(
    () =>
      prepararEntradasLotePesquisa("abc123 | Hotel Um\nabc123 | Hotel Dois"),
    /Conflito de ID/,
  );
});

// 9. Mesmo nome associado a IDs diferentes: ambas as linhas são mantidas
test("prepararEntradasLotePesquisa: dois IDs diferentes podem pesquisar o mesmo nome", () => {
  const resultado = prepararEntradasLotePesquisa(
    "id1 | Hotel Exemplo\nid2 | Hotel Exemplo",
  );
  assert.equal(resultado.length, 2);
  assert.deepEqual(
    resultado.map((e) => e.idWix).sort(),
    ["id1", "id2"],
  );
});

// 10. URL da Booking como consulta é tratada como texto normal pelo parser
test("parsearEntradasLote: aceita URL da Booking como consulta", () => {
  const entradas = parsearEntradasLote(
    "abc123 | https://www.booking.com/hotel/br/exemplo.pt-br.html",
  );
  assert.equal(
    entradas[0].consulta,
    "https://www.booking.com/hotel/br/exemplo.pt-br.html",
  );
});

// 11. URL da Expedia como consulta é tratada como texto normal pelo parser
test("parsearEntradasLote: aceita URL da Expedia como consulta", () => {
  const entradas = parsearEntradasLote(
    "https://www.expedia.com.br/Hotel-Exemplo.h123.Hotel-Information",
  );
  assert.equal(entradas[0].idWix, "");
  assert.equal(
    entradas[0].consulta,
    "https://www.expedia.com.br/Hotel-Exemplo.h123.Hotel-Information",
  );
});
