"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const CODIGO_TEMA = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "tema.js"),
  "utf8",
);

class FalsoLocalStorage {
  constructor({ lancarErro = false } = {}) {
    this._dados = new Map();
    this._lancarErro = lancarErro;
  }

  getItem(chave) {
    if (this._lancarErro) throw new Error("localStorage indisponível");
    return this._dados.has(chave) ? this._dados.get(chave) : null;
  }

  setItem(chave, valor) {
    if (this._lancarErro) throw new Error("localStorage indisponível");
    this._dados.set(chave, valor);
  }
}

function criarElemento({ tipo, valor, atributo, valorAtributo }) {
  return {
    checked: false,
    value: valor,
    type: tipo,
    dataset: atributo ? { [atributo]: valorAtributo } : {},
  };
}

const TODAS_PALETAS = [
  "dourado",
  "ametista",
  "artico",
  "esmeralda",
  "galaxia",
  "sakura",
  "titanio",
  "vulcanico",
  "boreal",
  "singularidade",
  "aurora",
  "tempestade",
  "dimensao",
  "pulsar",
  "supernova",
  "noir",
  "oceano",
  "cyberpunk",
  "tempo",
];
const PALETAS_ESTATICAS = ["dourado", "ametista", "esmeralda", "boreal"];

function criarAmbiente({ localStorageComErro = false, paletaSalva = null } = {}) {
  const radiosPaleta = TODAS_PALETAS.map((valor) =>
    criarElemento({ tipo: "radio", valor }),
  );
  const opcoesPaleta = TODAS_PALETAS.map((valor) => ({
    dataset: {
      paletteValue: valor,
      paletteCategoria: PALETAS_ESTATICAS.includes(valor) ? "estatica" : "animada",
      selected: "false",
    },
    hidden: true,
  }));

  const radiosFonte = ["classico", "moderno", "tecnologico", "editorial"]
    .map((valor) => criarElemento({ tipo: "radio", valor }));
  const opcoesFonte = ["classico", "moderno", "tecnologico", "editorial"]
    .map((valor) => ({ dataset: { fontValue: valor, selected: "false" } }));

  const documentElement = { dataset: {} };

  const eventListeners = new Map();

  const window = {
    addEventListener() {},
    dispatchEvent(evento) {
      window.eventosDisparados.push(evento);
    },
    eventosDisparados: [],
  };

  function criarBotaoFiltro() {
    return {
      _atributos: { "aria-pressed": "false" },
      setAttribute(nome, valor) {
        this._atributos[nome] = valor;
      },
      getAttribute(nome) {
        return Object.prototype.hasOwnProperty.call(this._atributos, nome)
          ? this._atributos[nome]
          : null;
      },
    };
  }

  const botaoFiltroAnimada = criarBotaoFiltro();
  const botaoFiltroEstatica = criarBotaoFiltro();

  const document = {
    readyState: "complete",
    documentElement,
    addEventListener(nome, callback) {
      eventListeners.set(nome, callback);
    },
    getElementById(id) {
      if (id === "btnFiltroPaletaAnimada") return botaoFiltroAnimada;
      if (id === "btnFiltroPaletaEstatica") return botaoFiltroEstatica;
      return null;
    },
    querySelectorAll(seletor) {
      if (seletor === 'input[name="paletaAplicacao"]') return radiosPaleta;
      if (seletor === "[data-palette-value]") return opcoesPaleta;
      if (seletor === "[data-palette-categoria]") return opcoesPaleta;
      if (seletor === 'input[name="fonteAplicacao"]') return radiosFonte;
      if (seletor === "[data-font-value]") return opcoesFonte;
      return [];
    },
  };

  const localStorage = new FalsoLocalStorage({ lancarErro: localStorageComErro });
  if (paletaSalva) localStorage.setItem("garimpu-paleta", paletaSalva);

  class CustomEvent {
    constructor(nome, { detail } = {}) {
      this.type = nome;
      this.detail = detail;
    }
  }

  const sandbox = { window, document, localStorage, CustomEvent };
  vm.createContext(sandbox);
  vm.runInContext(CODIGO_TEMA, sandbox);

  return {
    sandbox,
    radiosPaleta,
    opcoesPaleta,
    radiosFonte,
    opcoesFonte,
    documentElement,
    localStorage,
    botaoFiltroAnimada,
    botaoFiltroEstatica,
  };
}

test("paleta válida existente é aplicada", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.garimpuTema.aplicarPaleta("ametista"), "ametista");
});

test("nova paleta galaxia é aceita", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarPaleta("galaxia"), "galaxia");
  assert.equal(sandbox.document.documentElement.dataset.palette, "galaxia");
});

test("nova paleta sakura é aceita", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarPaleta("sakura"), "sakura");
});

test("nova paleta titanio é aceita", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarPaleta("titanio"), "titanio");
});

test("nova paleta vulcanico é aceita", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarPaleta("vulcanico"), "vulcanico");
});

test("nova paleta boreal é aceita", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarPaleta("boreal"), "boreal");
});

test("nova paleta singularidade é aceita", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarPaleta("singularidade"), "singularidade");
});

test("paleta inválida retorna o padrão dourado", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarPaleta("inexistente"), "dourado");
});

test("fonte classico é aceita", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarFonte("classico"), "classico");
});

test("fonte moderno é aceita", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarFonte("moderno"), "moderno");
});

test("fonte tecnologico é aceita", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarFonte("tecnologico"), "tecnologico");
});

test("fonte editorial é aceita", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarFonte("editorial"), "editorial");
});

test("fonte inválida retorna o padrão classico", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(sandbox.window.selecionarFonte("bogus"), "classico");
});

test("paleta escolhida persiste no localStorage", () => {
  const { sandbox, localStorage } = criarAmbiente();
  sandbox.window.selecionarPaleta("esmeralda");
  assert.equal(localStorage.getItem("garimpu-paleta"), "esmeralda");
});

test("fonte escolhida persiste no localStorage", () => {
  const { sandbox, localStorage } = criarAmbiente();
  sandbox.window.selecionarFonte("editorial");
  assert.equal(localStorage.getItem("garimpu-fonte"), "editorial");
});

test("trocar a fonte não altera a paleta selecionada", () => {
  const { sandbox } = criarAmbiente();
  sandbox.window.selecionarPaleta("artico");
  sandbox.window.selecionarFonte("tecnologico");
  assert.equal(sandbox.document.documentElement.dataset.palette, "artico");
  assert.equal(sandbox.document.documentElement.dataset.font, "tecnologico");
});

test("trocar a paleta não altera a fonte selecionada", () => {
  const { sandbox } = criarAmbiente();
  sandbox.window.selecionarFonte("moderno");
  sandbox.window.selecionarPaleta("galaxia");
  assert.equal(sandbox.document.documentElement.dataset.font, "moderno");
  assert.equal(sandbox.document.documentElement.dataset.palette, "galaxia");
});

test("restaurar paleta padrão mantém a fonte atual", () => {
  const { sandbox } = criarAmbiente();
  sandbox.window.selecionarPaleta("sakura");
  sandbox.window.selecionarFonte("editorial");
  sandbox.window.restaurarPaletaPadrao();
  assert.equal(sandbox.document.documentElement.dataset.palette, "dourado");
  assert.equal(sandbox.document.documentElement.dataset.font, "editorial");
});

test("restaurar fonte padrão mantém a paleta atual", () => {
  const { sandbox } = criarAmbiente();
  sandbox.window.selecionarPaleta("titanio");
  sandbox.window.selecionarFonte("moderno");
  sandbox.window.restaurarFontePadrao();
  assert.equal(sandbox.document.documentElement.dataset.font, "classico");
  assert.equal(sandbox.document.documentElement.dataset.palette, "titanio");
});

test("restaurar toda a aparência volta para dourado e classico", () => {
  const { sandbox } = criarAmbiente();
  sandbox.window.selecionarPaleta("galaxia");
  sandbox.window.selecionarFonte("editorial");
  const resultado = sandbox.window.restaurarAparenciaPadrao();
  assert.equal(resultado.paleta, "dourado");
  assert.equal(resultado.fonte, "classico");
  assert.equal(sandbox.document.documentElement.dataset.palette, "dourado");
  assert.equal(sandbox.document.documentElement.dataset.font, "classico");
});

test("continua funcionando quando localStorage lança erro", () => {
  const { sandbox } = criarAmbiente({ localStorageComErro: true });
  assert.equal(sandbox.window.selecionarPaleta("ametista"), "ametista");
  assert.equal(sandbox.window.selecionarFonte("moderno"), "moderno");
  assert.equal(sandbox.window.garimpuTema.lerPaletaSalva(), "dourado");
  assert.equal(sandbox.window.garimpuTema.lerFonteSalva(), "classico");
});

test("radios de paleta e fonte são atualizados corretamente", () => {
  const { sandbox, radiosPaleta, opcoesPaleta, radiosFonte, opcoesFonte } = criarAmbiente();
  sandbox.window.selecionarPaleta("artico");
  sandbox.window.selecionarFonte("tecnologico");

  const radioPaletaMarcado = radiosPaleta.find((radio) => radio.checked);
  const opcaoPaletaMarcada = opcoesPaleta.find((opcao) => opcao.dataset.selected === "true");
  assert.equal(radioPaletaMarcado.value, "artico");
  assert.equal(opcaoPaletaMarcada.dataset.paletteValue, "artico");

  const radioFonteMarcado = radiosFonte.find((radio) => radio.checked);
  const opcaoFonteMarcada = opcoesFonte.find((opcao) => opcao.dataset.selected === "true");
  assert.equal(radioFonteMarcado.value, "tecnologico");
  assert.equal(opcaoFonteMarcada.dataset.fontValue, "tecnologico");
});

test("preserva as APIs globais existentes", () => {
  const { sandbox } = criarAmbiente();
  assert.equal(typeof sandbox.window.selecionarPaleta, "function");
  assert.equal(typeof sandbox.window.restaurarPaletaPadrao, "function");
  assert.equal(typeof sandbox.window.selecionarFonte, "function");
  assert.equal(typeof sandbox.window.restaurarFontePadrao, "function");
  assert.equal(typeof sandbox.window.restaurarAparenciaPadrao, "function");
  assert.ok(Array.isArray(sandbox.window.garimpuTema.paletasValidas));
  assert.ok(Array.isArray(sandbox.window.garimpuTema.fontesValidas));
  assert.equal(sandbox.window.garimpuTema.paletaPadrao, "dourado");
  assert.equal(sandbox.window.garimpuTema.fontePadrao, "classico");
});

test("paleta estática salva abre o filtro de temas estáticos", () => {
  const { opcoesPaleta, botaoFiltroAnimada, botaoFiltroEstatica } = criarAmbiente();
  assert.ok(opcoesPaleta
    .filter((opcao) => opcao.dataset.paletteCategoria === "estatica")
    .every((opcao) => opcao.hidden === false));
  assert.ok(opcoesPaleta
    .filter((opcao) => opcao.dataset.paletteCategoria === "animada")
    .every((opcao) => opcao.hidden === true));
  assert.equal(botaoFiltroAnimada.getAttribute("aria-pressed"), "false");
  assert.equal(botaoFiltroEstatica.getAttribute("aria-pressed"), "true");
});

test("paleta animada salva abre o filtro de temas animados", () => {
  const { opcoesPaleta, botaoFiltroAnimada, botaoFiltroEstatica } = criarAmbiente({
    paletaSalva: "sakura",
  });
  assert.ok(opcoesPaleta
    .filter((opcao) => opcao.dataset.paletteCategoria === "animada")
    .every((opcao) => opcao.hidden === false));
  assert.ok(opcoesPaleta
    .filter((opcao) => opcao.dataset.paletteCategoria === "estatica")
    .every((opcao) => opcao.hidden === true));
  assert.equal(botaoFiltroAnimada.getAttribute("aria-pressed"), "true");
  assert.equal(botaoFiltroEstatica.getAttribute("aria-pressed"), "false");
});

test("definirFiltroPaletas alterna a categoria visível", () => {
  const { sandbox, opcoesPaleta } = criarAmbiente();
  sandbox.window.garimpuTema.definirFiltroPaletas("animada");
  assert.ok(opcoesPaleta
    .filter((opcao) => opcao.dataset.paletteCategoria === "animada")
    .every((opcao) => opcao.hidden === false));
  assert.ok(opcoesPaleta
    .filter((opcao) => opcao.dataset.paletteCategoria === "estatica")
    .every((opcao) => opcao.hidden === true));
});
