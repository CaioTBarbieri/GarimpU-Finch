const { calcularDistanciaCarroKm } = require("./scraper/scraper-utils");

const MODOS_FILTRO_DOWNLOAD = new Set(["nenhum", "raio", "cidade", "ambos"]);

function normalizarTextoLocalizacao(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function normalizarFiltroDownload(filtro = {}) {
  const modo = String(filtro?.modo || "nenhum").trim().toLowerCase();
  if (!MODOS_FILTRO_DOWNLOAD.has(modo)) {
    throw new TypeError("Selecione um filtro de download válido.");
  }

  const exigeRaio = modo === "raio" || modo === "ambos";
  const exigeCidade = modo === "cidade" || modo === "ambos";
  const raioKm = exigeRaio ? Number(filtro.raioKm) : null;
  const cidade = exigeCidade ? String(filtro.cidade || "").trim() : "";

  if (exigeRaio && (!Number.isFinite(raioKm) || raioKm <= 0 || raioKm > 20000)) {
    throw new TypeError("Informe um raio válido, maior que 0 e de até 20.000 km.");
  }
  if (exigeCidade && cidade.length < 2) {
    throw new TypeError("Informe a cidade usada no filtro de download.");
  }

  return { modo, raioKm, cidade };
}

function extrairCoordenadas(coordenadas) {
  const [latitude, longitude] = String(coordenadas || "")
    .split(",")
    .map((parte) => Number(parte.trim()));
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function enderecoCorrespondeCidade(endereco, cidade) {
  const cidadeNormalizada = normalizarTextoLocalizacao(cidade);
  if (!cidadeNormalizada) return false;

  return String(endereco || "")
    .split(/[,;]/)
    .map(normalizarTextoLocalizacao)
    .filter(Boolean)
    .filter((parte) => !/^(?:rua|avenida|av\.?|rodovia|estrada|travessa|alameda|praca)\b/.test(parte))
    .filter((parte) => !/^\d+\b|\b\d{5}-?\d{3}\b/.test(parte))
    .some((parte) =>
      parte === cidadeNormalizada ||
      parte.startsWith(`${cidadeNormalizada} -`) ||
      parte.startsWith(`${cidadeNormalizada} /`),
    );
}

function avaliarFiltroDownload({
  filtro,
  endereco,
  coordenadas,
  latitudeReferencia,
  longitudeReferencia,
}) {
  const configuracao = normalizarFiltroDownload(filtro);
  if (configuracao.modo === "nenhum") {
    return {
      ...configuracao,
      ativo: false,
      aprovado: true,
      atendeRaio: true,
      atendeCidade: true,
      distanciaKm: null,
      motivo: "Sem filtro de download.",
    };
  }

  const exigeRaio = configuracao.modo === "raio" || configuracao.modo === "ambos";
  const exigeCidade = configuracao.modo === "cidade" || configuracao.modo === "ambos";
  const pontoHotel = extrairCoordenadas(coordenadas);
  const referenciaValida =
    Number.isFinite(Number(latitudeReferencia)) &&
    Number.isFinite(Number(longitudeReferencia));
  const distanciaKm = exigeRaio && pontoHotel && referenciaValida
    ? Number(calcularDistanciaCarroKm(
        pontoHotel.latitude,
        pontoHotel.longitude,
        Number(latitudeReferencia),
        Number(longitudeReferencia),
      ))
    : null;
  const atendeRaio = !exigeRaio || (
    Number.isFinite(distanciaKm) && distanciaKm <= configuracao.raioKm
  );
  const atendeCidade = !exigeCidade || enderecoCorrespondeCidade(
    endereco,
    configuracao.cidade,
  );
  const aprovado = atendeRaio && atendeCidade;

  let motivo = "Hotel aprovado pelo filtro.";
  if (!aprovado) {
    const falhas = [];
    if (!atendeRaio) {
      falhas.push(Number.isFinite(distanciaKm)
        ? `fora do raio de ${configuracao.raioKm} km (${distanciaKm.toFixed(1)} km)`
        : "sem coordenadas para validar o raio");
    }
    if (!atendeCidade) {
      falhas.push(`endereço não corresponde à cidade ${configuracao.cidade}`);
    }
    motivo = falhas.join(" e ");
  }

  return {
    ...configuracao,
    ativo: true,
    aprovado,
    atendeRaio,
    atendeCidade,
    distanciaKm,
    motivo,
  };
}

module.exports = {
  MODOS_FILTRO_DOWNLOAD,
  normalizarTextoLocalizacao,
  enderecoCorrespondeCidade,
  normalizarFiltroDownload,
  avaliarFiltroDownload,
};
