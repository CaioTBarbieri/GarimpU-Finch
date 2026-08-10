const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  listarPastasMaeFlorence,
  resolverPastaMaeFlorence,
} = require("../services/pastas-florence.service");

function criarArquivo(caminho) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, "");
}

test("lista somente pastas mães e ignora hotéis na raiz", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "pastas-mae-florence-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));

  criarArquivo(path.join(raiz, "Jericoacoara", "Hotel Duna", "foto.jpg"));
  criarArquivo(path.join(raiz, "Itacaré", "Hotel Praia", "acomodacoes", "foto.jpg"));
  criarArquivo(path.join(raiz, "Hotel Raiz", "foto.jpg"));
  criarArquivo(path.join(raiz, "Hotel Organizado", "gastronomia", "foto.jpg"));

  assert.deepEqual(listarPastasMaeFlorence(raiz), ["Itacaré", "Jericoacoara"]);
});

test("resolve somente uma pasta mãe reconhecida dentro da raiz", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "resolver-mae-florence-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  criarArquivo(path.join(raiz, "Bahia", "Hotel Costa", "foto.jpg"));

  assert.equal(
    resolverPastaMaeFlorence(raiz, "Bahia"),
    path.resolve(raiz, "Bahia"),
  );
  assert.equal(resolverPastaMaeFlorence(raiz, ""), path.resolve(raiz));
  assert.throws(
    () => resolverPastaMaeFlorence(raiz, "../fora"),
    /pasta-mãe válida/,
  );
  assert.throws(
    () => resolverPastaMaeFlorence(raiz, "Hotel inexistente"),
    /não foi encontrada/,
  );
});
