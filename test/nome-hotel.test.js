const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizarNomeHotel,
  criarNomePastaHotel,
} = require("../services/scraper.service");

test("normaliza nome em maiúsculas preservando acentuação e espaços", () => {
  assert.equal(
    normalizarNomeHotel("Hotel*_Sombra__e_Água_Fresca"),
    "HOTEL SOMBRA E ÁGUA FRESCA",
  );
});

test("preserva pontuação válida no nome e protege o caminho da pasta", () => {
  assert.equal(
    normalizarNomeHotel("Pousada d'Água (Centro)"),
    "POUSADA D'ÁGUA (CENTRO)",
  );
  assert.equal(
    criarNomePastaHotel('Hotel: Sol/Mar? "Premium"'),
    "HOTEL SOL MAR PREMIUM",
  );
});
