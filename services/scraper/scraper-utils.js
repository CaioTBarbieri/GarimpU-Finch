const fs = require("fs");
const path = require("path");
const { ErroEntrada, ErroArmazenamento } = require("./scraper-errors");

// ==========================================
// NOMES E PASTAS
// ==========================================
function normalizarNomeHotel(nome) {
  return String(nome || "")
    .replace(/\*/g, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function criarNomePastaHotel(nome) {
  return normalizarNomeHotel(nome)
    .replace(/[<>:"/\\|?\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/g, "")
    .trim();
}

// ==========================================
// DISTÂNCIA
// ==========================================
function calcularDistanciaCarroKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distanciaLinhaReta = R * c;
  const fatorCorrecaoRota = 1.23;
  const distanciaCarro = distanciaLinhaReta * fatorCorrecaoRota;

  return distanciaCarro.toFixed(1);
}

function extrairDistanciaKm(texto) {
  const match = String(texto || "").match(/(\d+(?:[.,]\d+)?)\s*(km|m)\b/i);
  if (!match) return null;

  const distancia = Number(match[1].replace(",", "."));
  const distanciaKm =
    match[2].toLowerCase() === "m" ? distancia / 1000 : distancia;
  const valorFormatado = Number.isInteger(distanciaKm)
    ? String(distanciaKm)
    : distanciaKm.toFixed(1);

  return `${valorFormatado} km`;
}

function formatarDistanciaAeroporto(distanciaKmTexto, fonteLabel) {
  return `${distanciaKmTexto} (${fonteLabel})`;
}

// ==========================================
// NOTA DOS HÓSPEDES
// ==========================================
function extrairNotaDeTexto(texto) {
  const match = String(texto || "").match(/(?:10|[0-9])[.,][0-9]\b/);
  return match ? match[0] : null;
}

function normalizarNota(valorBruto) {
  if (valorBruto === null || valorBruto === undefined) return "Sem nota";
  const texto = String(valorBruto).trim();
  if (!texto) return "Sem nota";

  const numero = Number(texto.replace(",", "."));
  if (!Number.isFinite(numero) || numero < 0 || numero > 10) return "Sem nota";

  return numero.toFixed(1).replace(".", ",");
}

// ==========================================
// REGIME ALIMENTAR
// ==========================================
function identificarRegime(texto) {
  const textoOriginal = String(texto || "");
  const textoLower = textoOriginal.toLowerCase();

  if (
    textoLower.includes("all inclusive") ||
    textoLower.includes("tudo incluído")
  )
    return "All Inclusive";
  if (
    textoLower.includes("pensão completa") ||
    textoLower.includes("full board")
  )
    return "Pensão completa";
  if (
    textoLower.includes("meia pensão") ||
    textoLower.includes("meia-pensão") ||
    textoLower.includes("half board")
  )
    return "Meia pensão";

  const mencionaCafe =
    textoLower.includes("café da manhã") ||
    textoLower.includes("pequeno-almoço") ||
    textoLower.includes("breakfast");
  const cafeIncluso =
    /(?:café da manhã|pequeno-almoço|breakfast)[^.]{0,100}(?:incluíd[oa]|grátis|gratuito|cortesia|included|free)/i.test(
      textoOriginal,
    );
  if (mencionaCafe && cafeIncluso) return "Café da manhã incluído";
  if (mencionaCafe) return "Café da manhã disponível";
  return "Não informado";
}

// ==========================================
// BEIRA-MAR
// ==========================================
function detectarBeiraMar(textos) {
  const textoCombinado = (Array.isArray(textos) ? textos : [textos])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\bbeira[- ]mar\b|à beira[- ]mar|de frente para o mar|praia privativa|beachfront|private beach|oceanfront|seafront/i.test(
    textoCombinado,
  )
    ? "Sim"
    : "Não";
}

// ==========================================
// CORRESPONDÊNCIA DE NOMES (evita escolher hotel errado)
// ==========================================
const PALAVRAS_GENERICAS = new Set([
  "hotel",
  "hoteis",
  "pousada",
  "resort",
  "hostel",
  "inn",
  "suites",
  "suite",
  "residence",
  "residencial",
]);

function normalizarTextoComparacao(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function palavrasRelevantes(texto) {
  return normalizarTextoComparacao(texto)
    .split(" ")
    .filter((palavra) => palavra && !PALAVRAS_GENERICAS.has(palavra));
}

function pontuarCorrespondenciaNome(consulta, candidato) {
  const palavrasConsulta = palavrasRelevantes(consulta);
  const palavrasCandidato = new Set(palavrasRelevantes(candidato));

  if (palavrasConsulta.length === 0) return 0;

  const encontradas = palavrasConsulta.filter((palavra) =>
    palavrasCandidato.has(palavra),
  ).length;

  return encontradas / palavrasConsulta.length;
}

function candidatoCompativel(consulta, candidato, limiar = 0.5) {
  if (!candidato) return false;

  const normalizadoConsulta = normalizarTextoComparacao(consulta);
  const normalizadoCandidato = normalizarTextoComparacao(candidato);
  if (!normalizadoConsulta || !normalizadoCandidato) return false;

  if (
    normalizadoConsulta === normalizadoCandidato ||
    normalizadoCandidato.includes(normalizadoConsulta) ||
    normalizadoConsulta.includes(normalizadoCandidato)
  ) {
    return true;
  }

  return pontuarCorrespondenciaNome(consulta, candidato) >= limiar;
}

function escolherMelhorCandidato(consulta, candidatos, obterNome) {
  let melhor = null;
  let melhorPontuacao = -1;

  for (const candidato of candidatos) {
    const nomeCandidato = obterNome(candidato);
    if (!candidatoCompativel(consulta, nomeCandidato)) continue;

    const pontuacao = pontuarCorrespondenciaNome(consulta, nomeCandidato);
    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhor = candidato;
    }
  }

  return melhor;
}

// ==========================================
// DESAFIO ANTIBOT (CAPTCHA / "verifique que você é humano")
// ==========================================
// Booking e Expedia às vezes respondem com uma página de verificação em vez
// do conteúdo pedido, quando desconfiam de tráfego automatizado. Sem essa
// checagem, isso aparece pro usuário como um erro técnico de "seletor não
// encontrado" depois de 3 tentativas, sem explicar o que realmente houve.
async function detectarDesafioAntibot(page) {
  try {
    const [titulo, temElementoDeCaptcha] = await Promise.all([
      page.title().catch(() => ""),
      page
        .evaluate(() =>
          Boolean(
            document.querySelector(
              'iframe[src*="captcha" i], iframe[src*="hcaptcha" i], iframe[title*="captcha" i], [class*="captcha" i], [id*="captcha" i]',
            ),
          ),
        )
        .catch(() => false),
    ]);

    const tituloNormalizado = String(titulo || "").toLowerCase();
    return (
      temElementoDeCaptcha ||
      /rob[oô]|captcha|are you a human|human verification|access denied|attention required|unusual traffic|verifica[cç][aã]o de seguran[cç]a/i.test(
        tituloNormalizado,
      )
    );
  } catch (e) {
    return false;
  }
}

// ==========================================
// VALIDAÇÃO DE DOMÍNIO (nunca navegar para URL arbitrária)
// ==========================================
function hostnamePertenceADominio(hostname, dominioBase) {
  const host = String(hostname || "").toLowerCase();
  const base = String(dominioBase || "").toLowerCase();
  return host === base || host.endsWith("." + base);
}

function validarUrlPermitida(urlTexto, dominiosPermitidos) {
  let url;
  try {
    url = new URL(urlTexto);
  } catch (erro) {
    throw new ErroEntrada("URL inválida.");
  }

  if (url.protocol !== "https:") {
    throw new ErroEntrada("Apenas links HTTPS são aceitos.");
  }

  const permitido = dominiosPermitidos.some((dominio) =>
    hostnamePertenceADominio(url.hostname, dominio),
  );

  if (!permitido) {
    throw new ErroEntrada(
      `Domínio não permitido para pesquisa: ${url.hostname}.`,
    );
  }

  return url;
}

// ==========================================
// IMAGENS
// ==========================================
async function baixarImagemComoArquivo(page, url, caminhoCompleto) {
  const resultado = await page.evaluate(async (imageUrl) => {
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) return { sucesso: false };
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () =>
          resolve({ sucesso: true, base64: reader.result.split(",")[1] });
        reader.readAsDataURL(blob);
      });
    } catch {
      return { sucesso: false };
    }
  }, url);

  if (!resultado || !resultado.sucesso) return false;

  try {
    fs.writeFileSync(
      caminhoCompleto,
      Buffer.from(resultado.base64, "base64"),
    );
    return true;
  } catch (erro) {
    throw new ErroArmazenamento(
      `Falha ao gravar imagem em disco: ${erro.message}`,
      { causa: erro },
    );
  }
}

async function baixarImagensParaPasta({
  page,
  imagensUrls,
  pastaHotel,
  prefixoArquivo = "foto_HD_",
}) {
  try {
    if (!fs.existsSync(pastaHotel)) {
      fs.mkdirSync(pastaHotel, { recursive: true });
    }
  } catch (erro) {
    throw new ErroArmazenamento(
      `Falha ao criar pasta de imagens: ${erro.message}`,
      { causa: erro },
    );
  }

  const caminhosLocais = [];
  const nomePasta = path.basename(pastaHotel);

  for (let i = 0; i < imagensUrls.length; i++) {
    const url = imagensUrls[i];
    const nomeArquivo = `${prefixoArquivo}${i + 1}`;
    const caminhoCompleto = path.resolve(pastaHotel, `${nomeArquivo}.jpg`);

    let baixouComSucesso = false;
    try {
      baixouComSucesso = await baixarImagemComoArquivo(
        page,
        url,
        caminhoCompleto,
      );
    } catch (erro) {
      // Falha individual de imagem não deve derrubar o hotel inteiro.
      console.warn(`[-] Falha ao baixar imagem ${i + 1}: ${erro.message}`);
      continue;
    }

    if (baixouComSucesso) {
      caminhosLocais.push(
        `/img/${encodeURIComponent(nomePasta)}/${nomeArquivo}.jpg`,
      );
    }
  }

  return caminhosLocais;
}

function lerPastaImagensRecursivo(pastaHotel, pastaImagensBase) {
  let altTexts = {};

  const lerRecursivo = (diretorio) => {
    let imagensEncontradas = [];

    for (const arquivo of fs.readdirSync(diretorio)) {
      const caminhoAbsoluto = path.join(diretorio, arquivo);
      const stat = fs.statSync(caminhoAbsoluto);

      if (stat.isDirectory()) {
        imagensEncontradas = imagensEncontradas.concat(
          lerRecursivo(caminhoAbsoluto),
        );
        continue;
      }

      if (/\.(?:jpg|jpeg|png|webp)$/i.test(arquivo)) {
        const caminhoRelativo = path
          .relative(pastaImagensBase, caminhoAbsoluto)
          .split(path.sep)
          .map(encodeURIComponent)
          .join("/");

        imagensEncontradas.push(`/img/${caminhoRelativo}`);
        continue;
      }

      if (arquivo.toLowerCase() === "alt_texts.json") {
        try {
          const conteudoAltTexts = JSON.parse(
            fs.readFileSync(caminhoAbsoluto, "utf8"),
          );

          if (conteudoAltTexts && typeof conteudoAltTexts === "object") {
            altTexts = { ...altTexts, ...conteudoAltTexts };
          }
        } catch (erroAltTexts) {
          console.warn(
            `[-] Não foi possível ler ${caminhoAbsoluto}: ${erroAltTexts.message}`,
          );
        }
      }
    }

    return imagensEncontradas;
  };

  const imagens = fs.existsSync(pastaHotel) ? lerRecursivo(pastaHotel) : [];
  return { imagens, altTexts };
}

module.exports = {
  normalizarNomeHotel,
  criarNomePastaHotel,
  calcularDistanciaCarroKm,
  extrairDistanciaKm,
  formatarDistanciaAeroporto,
  extrairNotaDeTexto,
  normalizarNota,
  identificarRegime,
  detectarBeiraMar,
  normalizarTextoComparacao,
  palavrasRelevantes,
  pontuarCorrespondenciaNome,
  candidatoCompativel,
  escolherMelhorCandidato,
  detectarDesafioAntibot,
  hostnamePertenceADominio,
  validarUrlPermitida,
  baixarImagemComoArquivo,
  baixarImagensParaPasta,
  lerPastaImagensRecursivo,
};
