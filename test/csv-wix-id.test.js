const test = require("node:test");
const assert = require("node:assert/strict");
const {
  localizarItemWixPorId,
  __definirCsvWixParaTestes,
} = require("../public/js/interface");

test.afterEach(() => {
  __definirCsvWixParaTestes(null);
});

// 12. Busca direta por ID no CSV
test("localizarItemWixPorId: encontra o item com correspondência exata de ID", () => {
  __definirCsvWixParaTestes({
    meta: { fields: ["ID", "Nome_Hotel"] },
    data: [
      { ID: "abc123", Nome_Hotel: "Hotel Exemplo" },
      { ID: "def456", Nome_Hotel: "Outro Hotel" },
    ],
  });

  const item = localizarItemWixPorId("abc123");
  assert.ok(item);
  assert.equal(item.Nome_Hotel, "Hotel Exemplo");
});

test("localizarItemWixPorId: não faz correspondência parcial nem ignora hífens", () => {
  __definirCsvWixParaTestes({
    meta: { fields: ["ID", "Nome_Hotel"] },
    data: [{ ID: "620f86a1-aaaa-bbbb-cccc-123456789000", Nome_Hotel: "Hotel A" }],
  });

  assert.equal(localizarItemWixPorId("620f86a1"), null);
  assert.equal(
    localizarItemWixPorId("620f86a1aaaabbbbcccc123456789000"),
    null,
  );
  assert.ok(
    localizarItemWixPorId("  620f86a1-aaaa-bbbb-cccc-123456789000  "),
  );
});

// 13. ID inexistente no CSV
test("localizarItemWixPorId: retorna null quando o ID não existe no CSV", () => {
  __definirCsvWixParaTestes({
    meta: { fields: ["ID", "Nome_Hotel"] },
    data: [{ ID: "abc123", Nome_Hotel: "Hotel Exemplo" }],
  });

  assert.equal(localizarItemWixPorId("id-que-nao-existe"), null);
});

// 14. Entrada com ID sem CSV carregado
test("localizarItemWixPorId: retorna null quando não há CSV carregado", () => {
  __definirCsvWixParaTestes(null);
  assert.equal(localizarItemWixPorId("abc123"), null);
});
