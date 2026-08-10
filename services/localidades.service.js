const { ESTADOS_BRASILEIROS } = require("./filtro-download.service");

const TEMPO_CACHE_MUNICIPIOS_MS = 24 * 60 * 60 * 1000;
const cacheMunicipios = new Map();

function normalizarUf(uf) {
  const valor = String(uf || "").trim().toUpperCase();
  if (!Object.hasOwn(ESTADOS_BRASILEIROS, valor)) {
    throw new TypeError("Informe uma UF válida para listar os municípios.");
  }
  return valor;
}

async function listarMunicipiosPorUf(
  uf,
  { fetchImpl = globalThis.fetch, agora = Date.now() } = {},
) {
  const ufNormalizada = normalizarUf(uf);
  const armazenado = cacheMunicipios.get(ufNormalizada);
  if (armazenado && agora - armazenado.criadoEm < TEMPO_CACHE_MUNICIPIOS_MS) {
    return armazenado.municipios.slice();
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("O recurso de consulta de municípios não está disponível.");
  }

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 10000);
  let resposta;
  try {
    resposta = await fetchImpl(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufNormalizada}/municipios?orderBy=nome`,
      { signal: controlador.signal },
    );
  } catch (erro) {
    throw new Error(
      erro?.name === "AbortError"
        ? "A consulta de municípios ao IBGE excedeu o tempo limite."
        : "Não foi possível consultar os municípios no IBGE.",
    );
  } finally {
    clearTimeout(temporizador);
  }

  if (!resposta.ok) {
    throw new Error(`O IBGE respondeu com status ${resposta.status}.`);
  }
  const dados = await resposta.json();
  const municipios = Array.from(new Set(
    (Array.isArray(dados) ? dados : [])
      .map((municipio) => String(municipio?.nome || "").trim())
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, "pt-BR"));

  if (municipios.length === 0) {
    throw new Error("O IBGE não retornou municípios para a UF informada.");
  }

  cacheMunicipios.set(ufNormalizada, { criadoEm: agora, municipios });
  return municipios.slice();
}

function limparCacheMunicipios() {
  cacheMunicipios.clear();
}

module.exports = {
  TEMPO_CACHE_MUNICIPIOS_MS,
  normalizarUf,
  listarMunicipiosPorUf,
  limparCacheMunicipios,
};
