"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  criarRepositorioConfiguracoes,
  validarDiretorio,
} = require("../electron/configuracoes");

test("usa a pasta de imagens como padrão do Florence", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "garimpu-config-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  const pastaDocumentos = path.join(raiz, "Documentos", "GarimpU Finch");
  const repositorio = criarRepositorioConfiguracoes({
    arquivoConfiguracoes: path.join(raiz, "dados", "configuracoes.json"),
    pastaDocumentos,
  });

  const configuracoes = repositorio.carregar();
  assert.equal(
    configuracoes.pastaImagens,
    path.join(pastaDocumentos, "Imagens"),
  );
  assert.equal(configuracoes.pastaFlorence, configuracoes.pastaImagens);
});

test("salva, cria e recupera diretórios independentes", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "garimpu-config-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  const arquivoConfiguracoes = path.join(
    raiz,
    "dados",
    "configuracoes.json",
  );
  const pastaImagens = path.join(raiz, "Fotos baixadas");
  const pastaFlorence = path.join(raiz, "Entrada Florence");
  const repositorio = criarRepositorioConfiguracoes({
    arquivoConfiguracoes,
    pastaDocumentos: path.join(raiz, "Documentos"),
  });

  const salvas = repositorio.salvar({
    pastaImagens,
    pastaFlorence,
  });

  assert.deepEqual(salvas, { pastaImagens, pastaFlorence });
  assert.equal(fs.statSync(pastaImagens).isDirectory(), true);
  assert.equal(fs.statSync(pastaFlorence).isDirectory(), true);
  assert.deepEqual(repositorio.carregar(), salvas);
});

test("rejeita diretório relativo ou vazio", () => {
  assert.throws(
    () => validarDiretorio("Pasta", "imagens"),
    /caminho absoluto/,
  );
  assert.throws(() => validarDiretorio("Pasta", "  "), /não pode ficar vazio/);
});
