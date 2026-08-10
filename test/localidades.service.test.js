const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizarUf,
  listarMunicipiosPorUf,
  limparCacheMunicipios,
} = require("../services/localidades.service");

test.beforeEach(() => limparCacheMunicipios());

test("normaliza e valida a UF", () => {
  assert.equal(normalizarUf(" ce "), "CE");
  assert.throws(() => normalizarUf("XX"), /UF válida/);
});

test("lista municípios do IBGE em ordem e remove duplicados", async () => {
  const requisicoes = [];
  const municipios = await listarMunicipiosPorUf("CE", {
    fetchImpl: async (url) => {
      requisicoes.push(url);
      return {
        ok: true,
        async json() {
          return [
            { nome: "Fortaleza" },
            { nome: "Aquiraz" },
            { nome: "Fortaleza" },
          ];
        },
      };
    },
    agora: 1000,
  });

  assert.deepEqual(municipios, ["Aquiraz", "Fortaleza"]);
  assert.match(requisicoes[0], /estados\/CE\/municipios/);
});

test("reutiliza o cache da UF sem consultar novamente", async () => {
  let chamadas = 0;
  const fetchImpl = async () => {
    chamadas += 1;
    return { ok: true, json: async () => [{ nome: "Fortaleza" }] };
  };

  await listarMunicipiosPorUf("CE", { fetchImpl, agora: 1000 });
  await listarMunicipiosPorUf("CE", { fetchImpl, agora: 2000 });
  assert.equal(chamadas, 1);
});

test("converte falha externa em mensagem estável", async () => {
  await assert.rejects(
    listarMunicipiosPorUf("SP", {
      fetchImpl: async () => { throw new Error("rede indisponível"); },
    }),
    /Não foi possível consultar os municípios no IBGE/,
  );
});
