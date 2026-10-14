const test = require("node:test");
const assert = require("node:assert/strict");
const { resolverExecutavelNavegador } = require("../services/navegador.service");

const semAviso = () => {};

test("usa o caminho configurado quando ele existe", () => {
  const resultado = resolverExecutavelNavegador({
    configurado: "C:/brave.exe",
    existe: (p) => p === "C:/brave.exe",
    chromiumPuppeteer: () => "C:/chromium.exe",
    candidatos: () => [],
    aviso: semAviso,
  });
  assert.equal(resultado, "C:/brave.exe");
});

test("caminho configurado inexistente cai para o Chromium do Puppeteer", () => {
  const avisos = [];
  const resultado = resolverExecutavelNavegador({
    configurado: "C:/errado.exe",
    existe: (p) => p === "C:/chromium.exe",
    chromiumPuppeteer: () => "C:/chromium.exe",
    candidatos: () => [],
    aviso: (m) => avisos.push(m),
  });
  assert.equal(resultado, "C:/chromium.exe");
  assert.equal(avisos.length, 1);
});

test("sem Chromium do Puppeteer usa um navegador instalado", () => {
  const resultado = resolverExecutavelNavegador({
    configurado: "",
    existe: (p) => p === "C:/edge.exe",
    chromiumPuppeteer: () => null,
    candidatos: () => ["C:/chrome.exe", "C:/edge.exe"],
    aviso: semAviso,
  });
  assert.equal(resultado, "C:/edge.exe");
});

test("retorna undefined quando nenhum navegador é encontrado", () => {
  const resultado = resolverExecutavelNavegador({
    configurado: "",
    existe: () => false,
    chromiumPuppeteer: () => null,
    candidatos: () => ["C:/chrome.exe"],
    aviso: semAviso,
  });
  assert.equal(resultado, undefined);
});
