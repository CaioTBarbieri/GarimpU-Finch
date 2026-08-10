const { calcularDistanciaCarroKm } = require("./scraper/scraper-utils");

const MODOS_FILTRO_DOWNLOAD = new Set(["nenhum", "estado", "ambos"]);
const ESTADOS_BRASILEIROS = {
  AC: "acre",
  AL: "alagoas",
  AP: "amapa",
  AM: "amazonas",
  BA: "bahia",
  CE: "ceara",
  DF: "distrito federal",
  ES: "espirito santo",
  GO: "goias",
  MA: "maranhao",
  MT: "mato grosso",
  MS: "mato grosso do sul",
  MG: "minas gerais",
  PA: "para",
  PB: "paraiba",
  PR: "parana",
  PE: "pernambuco",
  PI: "piaui",
  RJ: "rio de janeiro",
  RN: "rio grande do norte",
  RS: "rio grande do sul",
  RO: "rondonia",
  RR: "roraima",
  SC: "santa catarina",
  SP: "sao paulo",
  SE: "sergipe",
  TO: "tocantins",
};

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

  const exigeRaio = modo === "ambos";
  const exigeCidade = modo === "ambos";
  const exigeEstado = modo === "estado" || modo === "ambos";
  const raioKm = exigeRaio ? Number(filtro.raioKm) : null;
  const cidade = exigeCidade ? String(filtro.cidade || "").trim() : "";
  const estado = exigeEstado ? String(filtro.estado || "").trim().toUpperCase() : "";

  if (exigeRaio && (!Number.isFinite(raioKm) || raioKm <= 0 || raioKm > 20000)) {
    throw new TypeError("Informe um raio válido, maior que 0 e de até 20.000 km.");
  }
  if (exigeCidade && cidade.length < 2) {
    throw new TypeError("Informe a cidade usada no filtro de download.");
  }
  if (exigeEstado && !Object.hasOwn(ESTADOS_BRASILEIROS, estado)) {
    throw new TypeError("Selecione um estado válido para o filtro de download.");
  }

  return { modo, raioKm, cidade, estado };
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

function extrairUfEndereco(endereco) {
  const partesOriginais = String(endereco || "").split(/[,;]/);

  for (const parteOriginal of partesOriginais) {
    const sigla = parteOriginal.trim().toUpperCase().match(/(?:^|\s-\s)([A-Z]{2})$/)?.[1];
    if (sigla && Object.hasOwn(ESTADOS_BRASILEIROS, sigla)) return sigla;
  }

  const partesLocalidade = partesOriginais
    .map(normalizarTextoLocalizacao)
    .filter(Boolean)
    .filter((parte) => !/^(?:rua|avenida|av\.?|rodovia|estrada|travessa|alameda|praca)\b/.test(parte));

  return Object.entries(ESTADOS_BRASILEIROS).find(([, nome]) =>
    partesLocalidade.some((parte) =>
      parte === nome ||
      parte === `estado de ${nome}` ||
      parte.startsWith(`${nome} -`),
    ),
  )?.[0] || "";
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
      atendeEstado: true,
      ufEncontrada: "",
      distanciaKm: null,
      motivo: "Sem filtro de download.",
    };
  }

  const exigeRaio = configuracao.modo === "ambos";
  const exigeCidade = configuracao.modo === "ambos";
  const exigeEstado = configuracao.modo === "estado" || configuracao.modo === "ambos";
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
  const ufEncontrada = exigeEstado ? extrairUfEndereco(endereco) : "";
  const atendeEstado = !exigeEstado || ufEncontrada === configuracao.estado;
  const aprovado = atendeRaio && atendeCidade && atendeEstado;

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
    if (!atendeEstado) {
      falhas.push(ufEncontrada
        ? `endereço pertence ao estado ${ufEncontrada}, não ${configuracao.estado}`
        : `não foi possível confirmar o estado ${configuracao.estado} no endereço`);
    }
    motivo = falhas.join(" e ");
  }

  return {
    ...configuracao,
    ativo: true,
    aprovado,
    atendeRaio,
    atendeCidade,
    atendeEstado,
    ufEncontrada,
    distanciaKm,
    motivo,
  };
}

module.exports = {
  MODOS_FILTRO_DOWNLOAD,
  ESTADOS_BRASILEIROS,
  normalizarTextoLocalizacao,
  enderecoCorrespondeCidade,
  extrairUfEndereco,
  normalizarFiltroDownload,
  avaliarFiltroDownload,
};
