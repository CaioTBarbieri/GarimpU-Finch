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

test("filtro por raio aprova hotel próximo e rejeita hotel distante", () => {
  const proximo = avaliarFiltroDownload({
    filtro: { modo: "raio", raioKm: 10 },
    endereco: "Centro, Rio de Janeiro - RJ, Brasil",
    coordenadas: "-22.9068, -43.1729",
    ...REFERENCIA_RIO,
  });
  const distante = avaliarFiltroDownload({
    filtro: { modo: "raio", raioKm: 10 },
    endereco: "São Paulo - SP, Brasil",
    coordenadas: "-23.5505, -46.6333",
    ...REFERENCIA_RIO,
  });

  assert.equal(proximo.aprovado, true);
  assert.equal(distante.aprovado, false);
  assert.match(distante.motivo, /fora do raio/);
});

test("filtro por cidade ignora acentos e diferença entre maiúsculas", () => {
  const resultado = avaliarFiltroDownload({
    filtro: { modo: "cidade", cidade: "sao paulo" },
    endereco: "Avenida Paulista, São Paulo - SP, Brasil",
    coordenadas: "GPS não disponível",
    ...REFERENCIA_RIO,
  });

  assert.equal(resultado.aprovado, true);
  assert.equal(resultado.atendeCidade, true);
});

test("filtro por cidade não confunde o nome de uma rua com a cidade", () => {
  const resultado = avaliarFiltroDownload({
    filtro: { modo: "cidade", cidade: "São Paulo" },
    endereco: "Rua São Paulo, 120, Centro, Rio de Janeiro - RJ, Brasil",
    coordenadas: "-22.9068, -43.1729",
    ...REFERENCIA_RIO,
  });

  assert.equal(resultado.aprovado, false);
  assert.equal(resultado.atendeCidade, false);
});

test("filtro combinado exige raio e cidade ao mesmo tempo", () => {
  const resultado = avaliarFiltroDownload({
    filtro: { modo: "ambos", raioKm: 20, cidade: "Niterói" },
    endereco: "Centro, Rio de Janeiro - RJ, Brasil",
    coordenadas: "-22.9068, -43.1729",
    ...REFERENCIA_RIO,
  });

  assert.equal(resultado.atendeRaio, true);
  assert.equal(resultado.atendeCidade, false);
  assert.equal(resultado.aprovado, false);
});

test("filtro por raio rejeita hotel sem coordenadas", () => {
  const resultado = avaliarFiltroDownload({
    filtro: { modo: "raio", raioKm: 50 },
    endereco: "Rio de Janeiro - RJ, Brasil",
    coordenadas: "GPS não disponível",
    ...REFERENCIA_RIO,
  });

  assert.equal(resultado.aprovado, false);
  assert.match(resultado.motivo, /sem coordenadas/);
});

test("valida os campos exigidos por cada modo", () => {
  assert.throws(
    () => normalizarFiltroDownload({ modo: "raio", raioKm: 0 }),
    /raio válido/,
  );
  assert.throws(
    () => normalizarFiltroDownload({ modo: "cidade", cidade: "" }),
    /Informe a cidade/,
  );
  assert.deepEqual(normalizarFiltroDownload(), {
    modo: "nenhum",
    raioKm: null,
    cidade: "",
  });
});
