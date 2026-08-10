const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizarFiltroDownload,
  avaliarFiltroDownload,
} = require("../services/filtro-download.service");

const REFERENCIA_RIO = {
  latitudeReferencia: -22.9068,
  longitudeReferencia: -43.1729,
};

test("filtro combinado aprova hotel da cidade dentro do raio", () => {
  const proximo = avaliarFiltroDownload({
    filtro: { modo: "ambos", raioKm: 10, cidade: "Rio de Janeiro", estado: "RJ" },
    endereco: "Centro, Rio de Janeiro - RJ, Brasil",
    coordenadas: "-22.9068, -43.1729",
    ...REFERENCIA_RIO,
  });
  const distante = avaliarFiltroDownload({
    filtro: { modo: "ambos", raioKm: 10, cidade: "São Paulo", estado: "SP" },
    endereco: "São Paulo - SP, Brasil",
    coordenadas: "-23.5505, -46.6333",
    ...REFERENCIA_RIO,
  });

  assert.equal(proximo.aprovado, true);
  assert.equal(distante.aprovado, false);
  assert.match(distante.motivo, /fora do raio/);
});

test("filtro combinado compara cidade sem diferenciar acentos e maiúsculas", () => {
  const resultado = avaliarFiltroDownload({
    filtro: { modo: "ambos", cidade: "sao paulo", estado: "SP", raioKm: 500 },
    endereco: "Avenida Paulista, São Paulo - SP, Brasil",
    coordenadas: "-23.5505, -46.6333",
    ...REFERENCIA_RIO,
  });

  assert.equal(resultado.aprovado, true);
  assert.equal(resultado.atendeCidade, true);
});

test("filtro combinado não confunde o nome de uma rua com a cidade", () => {
  const resultado = avaliarFiltroDownload({
    filtro: { modo: "ambos", cidade: "São Paulo", estado: "RJ", raioKm: 20 },
    endereco: "Rua São Paulo, 120, Centro, Rio de Janeiro - RJ, Brasil",
    coordenadas: "-22.9068, -43.1729",
    ...REFERENCIA_RIO,
  });

  assert.equal(resultado.aprovado, false);
  assert.equal(resultado.atendeCidade, false);
});

test("filtro combinado exige raio e cidade ao mesmo tempo", () => {
  const resultado = avaliarFiltroDownload({
    filtro: { modo: "ambos", raioKm: 20, cidade: "Niterói", estado: "RJ" },
    endereco: "Centro, Rio de Janeiro - RJ, Brasil",
    coordenadas: "-22.9068, -43.1729",
    ...REFERENCIA_RIO,
  });

  assert.equal(resultado.atendeRaio, true);
  assert.equal(resultado.atendeCidade, false);
  assert.equal(resultado.aprovado, false);
});

test("filtro combinado rejeita hotel sem coordenadas", () => {
  const resultado = avaliarFiltroDownload({
    filtro: { modo: "ambos", raioKm: 50, cidade: "Rio de Janeiro", estado: "RJ" },
    endereco: "Rio de Janeiro - RJ, Brasil",
    coordenadas: "GPS não disponível",
    ...REFERENCIA_RIO,
  });

  assert.equal(resultado.aprovado, false);
  assert.match(resultado.motivo, /sem coordenadas/);
});

test("filtro por estado reconhece sigla e nome completo no endereço", () => {
  const porSigla = avaliarFiltroDownload({
    filtro: { modo: "estado", estado: "RJ" },
    endereco: "Centro, Rio de Janeiro - RJ, Brasil",
    coordenadas: "GPS não disponível",
    ...REFERENCIA_RIO,
  });
  const porNome = avaliarFiltroDownload({
    filtro: { modo: "estado", estado: "CE" },
    endereco: "Jericoacoara, Jijoca de Jericoacoara, Ceará, Brasil",
    coordenadas: "GPS não disponível",
    ...REFERENCIA_RIO,
  });

  assert.equal(porSigla.aprovado, true);
  assert.equal(porSigla.ufEncontrada, "RJ");
  assert.equal(porNome.aprovado, true);
  assert.equal(porNome.ufEncontrada, "CE");
});

test("filtro por estado rejeita uma UF diferente", () => {
  const resultado = avaliarFiltroDownload({
    filtro: { modo: "estado", estado: "SP" },
    endereco: "Centro, Rio de Janeiro - RJ, Brasil",
    coordenadas: "GPS não disponível",
    ...REFERENCIA_RIO,
  });

  assert.equal(resultado.aprovado, false);
  assert.match(resultado.motivo, /estado RJ, não SP/);
});

test("filtro combinado também exige o estado correto", () => {
  const resultado = avaliarFiltroDownload({
    filtro: {
      modo: "ambos",
      cidade: "Rio de Janeiro",
      estado: "SP",
      raioKm: 20,
    },
    endereco: "Centro, Rio de Janeiro - RJ, Brasil",
    coordenadas: "-22.9068, -43.1729",
    ...REFERENCIA_RIO,
  });

  assert.equal(resultado.atendeCidade, true);
  assert.equal(resultado.atendeRaio, true);
  assert.equal(resultado.atendeEstado, false);
  assert.equal(resultado.aprovado, false);
});

test("valida os campos exigidos por cada modo", () => {
  assert.throws(
    () => normalizarFiltroDownload({ modo: "ambos", raioKm: 0, cidade: "Rio", estado: "RJ" }),
    /raio válido/,
  );
  assert.throws(
    () => normalizarFiltroDownload({ modo: "ambos", raioKm: 10, cidade: "", estado: "RJ" }),
    /Informe a cidade/,
  );
  assert.throws(
    () => normalizarFiltroDownload({ modo: "estado", estado: "XX" }),
    /estado válido/,
  );
  assert.deepEqual(normalizarFiltroDownload(), {
    modo: "nenhum",
    raioKm: null,
    cidade: "",
    estado: "",
  });
});
