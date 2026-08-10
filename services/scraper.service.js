const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const {
  PASTA_IMAGENS,
  LATITUDE_PADRAO,
  LONGITUDE_PADRAO,
  PUPPETEER_EXECUTABLE_PATH,
} = require("../config");
const {
  pesquisarBooking,
  ehLinkBooking,
  normalizarLinkBooking,
  derivarTermoDeLinkBooking,
} = require("./scraper/booking.provider");
const { pesquisarExpedia, ehLinkExpedia } = require("./scraper/expedia.provider");
const {
  normalizarNomeHotel,
  criarNomePastaHotel,
  calcularDistanciaCarroKm,
  validarUrlPermitida,
} = require("./scraper/scraper-utils");
const { ErroEntrada, ehErroQueAcionaFallback } = require("./scraper/scraper-errors");
const { normalizarFiltroDownload } = require("./filtro-download.service");

puppeteer.use(StealthPlugin());

// ==========================================
// CLASSIFICAÇÃO DA ENTRADA
// ==========================================
function classificarEntrada(entrada) {
  const ehUrl = /^https?:\/\//i.test(entrada);
  if (!ehUrl) return { tipo: "texto", valor: entrada };

  if (ehLinkBooking(entrada)) {
    validarUrlPermitida(entrada, ["booking.com"]);
    return { tipo: "booking", valor: normalizarLinkBooking(entrada) };
  }

  if (ehLinkExpedia(entrada)) {
    validarUrlPermitida(entrada, ["expedia.com", "expedia.com.br"]);
    return { tipo: "expedia", valor: entrada };
  }

  throw new ErroEntrada(
    "Digite o nome do hotel ou cole um link válido da Booking ou Expedia.",
  );
}

function truncarMensagem(texto, tamanhoMaximo) {
  const valor = String(texto || "falha desconhecida");
  return valor.length > tamanhoMaximo
    ? valor.slice(0, tamanhoMaximo - 1) + "…"
    : valor;
}

function montarMensagemFalhaCombinada(erroBooking, erroExpedia) {
  const mensagemBooking = truncarMensagem(erroBooking?.message, 220);
  const mensagemExpedia = truncarMensagem(erroExpedia?.message, 220);
  return (
    "Não foi possível localizar o hotel. " +
    `Booking: ${mensagemBooking} ` +
    `Expedia: ${mensagemExpedia}`
  );
}

// ==========================================
// SANIDADE DE LOCALIZAÇÃO (evita aceitar em silêncio um hotel de outra
// região/país que só bateu pelo nome — ver candidatoCompativel/
// escolherMelhorCandidato, que comparam apenas texto)
// ==========================================
// A correspondência por nome às vezes encontra um hotel homônimo em outra
// cidade ou até outro país. Como o usuário já informa (ou aceita o padrão de)
// um ponto de referência por busca — latitudeReferencia/longitudeReferencia,
// pensado originalmente para o cálculo de distância ao aeroporto —, esse
// mesmo ponto serve como âncora do "entorno" esperado da busca. Um raio bem
// generoso, pensado para pegar apenas discrepâncias grosseiras (outro país/
// continente) sem incomodar buscas legítimas dentro do Brasil.
const RAIO_ALERTA_LOCALIZACAO_KM = 300;

function avaliarLocalizacaoForaDaArea(
  resultado,
  latitudeReferencia,
  longitudeReferencia,
) {
  const [latTexto, lngTexto] = String(resultado.coordenadas || "")
    .split(",")
    .map((parte) => parte.trim());
  const lat = Number(latTexto);
  const lng = Number(lngTexto);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    resultado.distanciaReferenciaKm = null;
    resultado.localizacaoForaDaArea = false;
    return resultado;
  }

  const distanciaKm = Number(
    calcularDistanciaCarroKm(lat, lng, latitudeReferencia, longitudeReferencia),
  );
  resultado.distanciaReferenciaKm = distanciaKm;
  resultado.localizacaoForaDaArea = distanciaKm > RAIO_ALERTA_LOCALIZACAO_KM;
  return resultado;
}

// ==========================================
// COORDENADOR (fábrica testável: recebe as fontes e o lançador do browser
// por injeção, para permitir testes sem Puppeteer/rede real)
// ==========================================
function criarCoordenadorScraper({
  buscarNaBooking,
  buscarNaExpedia,
  lancarBrowser,
  pastaImagensBase,
  latitudePadrao,
  longitudePadrao,
}) {
  const navegadoresAtivos = new Set();

  async function fecharNavegadoresAtivos() {
    const navegadores = Array.from(navegadoresAtivos);
    await Promise.allSettled(
      navegadores.map(async (browser) => {
        try {
          await browser.close();
        } finally {
          navegadoresAtivos.delete(browser);
        }
      }),
    );
  }

  async function rasparDadosHotel(
    nomeHotel,
    baixarImagens = true,
    latitudeReferencia = latitudePadrao,
    longitudeReferencia = longitudePadrao,
    filtroDownload = { modo: "nenhum" },
  ) {
    const entrada =
      typeof nomeHotel === "string"
        ? nomeHotel.replace(/\s+/g, " ").trim()
        : "";

    if (!entrada) {
      return { sucesso: false, erro: "O nome do hotel é obrigatório." };
    }

    latitudeReferencia = Number(latitudeReferencia);
    longitudeReferencia = Number(longitudeReferencia);
    filtroDownload = normalizarFiltroDownload(filtroDownload);

    if (
      !Number.isFinite(latitudeReferencia) ||
      latitudeReferencia < -90 ||
      latitudeReferencia > 90
    ) {
      throw new Error("Latitude de referência inválida.");
    }

    if (
      !Number.isFinite(longitudeReferencia) ||
      longitudeReferencia < -180 ||
      longitudeReferencia > 180
    ) {
      throw new Error("Longitude de referência inválida.");
    }

    let classificacao;
    try {
      classificacao = classificarEntrada(entrada);
    } catch (erro) {
      if (erro instanceof ErroEntrada) {
        return { sucesso: false, erro: erro.message };
      }
      throw erro;
    }

    let browser = null;
    let page = null;

    const fecharBrowser = async () => {
      if (!browser) return;
      const browserAtual = browser;
      browser = null;
      page = null;

      try {
        await browserAtual.close();
      } catch (erroFechamento) {
        console.warn(
          `[-] Não foi possível fechar o navegador: ${erroFechamento.message}`,
        );
      } finally {
        navegadoresAtivos.delete(browserAtual);
      }
    };

    try {
      browser = await lancarBrowser();
      navegadoresAtivos.add(browser);
      page = await browser.newPage();
      if (typeof page.setDefaultNavigationTimeout === "function") {
        page.setDefaultNavigationTimeout(120000);
      }

      const opcoesComuns = {
        latitudeReferencia,
        longitudeReferencia,
        baixarImagens,
        pastaImagensBase,
        filtroDownload,
      };

      let resultado;

      if (classificacao.tipo === "expedia") {
        resultado = await buscarNaExpedia(page, {
          entrada: classificacao.valor,
          ehLink: true,
          ...opcoesComuns,
        });
      } else {
        try {
          resultado = await buscarNaBooking(page, {
            entrada: classificacao.valor,
            ehLink: classificacao.tipo === "booking",
            ...opcoesComuns,
          });
        } catch (erroBooking) {
          if (!ehErroQueAcionaFallback(erroBooking)) throw erroBooking;

          let termoFallback = null;
          if (classificacao.tipo === "booking") {
            termoFallback = derivarTermoDeLinkBooking(classificacao.valor);
            if (!termoFallback) {
              // Não é possível derivar um termo confiável: retorna o erro da
              // Booking em vez de arriscar buscar um hotel aleatório.
              throw erroBooking;
            }
          } else {
            termoFallback = classificacao.valor;
          }

          console.log("[Fallback] Iniciando pesquisa na Expedia");

          // Nova página para garantir que listeners e estado da Booking não
          // vazem para a tentativa na Expedia, reutilizando o mesmo browser.
          try {
            await page.close();
          } catch (erroFechamentoPagina) {
            console.warn(
              `[-] Não foi possível fechar a página anterior: ${erroFechamentoPagina.message}`,
            );
          }
          page = await browser.newPage();
          if (typeof page.setDefaultNavigationTimeout === "function") {
            page.setDefaultNavigationTimeout(120000);
          }

          try {
            resultado = await buscarNaExpedia(page, {
              entrada: termoFallback,
              ehLink: false,
              ...opcoesComuns,
            });
          } catch (erroExpedia) {
            if (erroExpedia instanceof ErroEntrada) throw erroExpedia;
            throw new Error(
              montarMensagemFalhaCombinada(erroBooking, erroExpedia),
            );
          }
        }
      }

      avaliarLocalizacaoForaDaArea(
        resultado,
        latitudeReferencia,
        longitudeReferencia,
      );

      console.log(`[Scraper] Fonte utilizada: ${resultado.fonte}`);
      return resultado;
    } catch (erro) {
      if (erro instanceof ErroEntrada) {
        return { sucesso: false, erro: erro.message };
      }
      console.error("[Scraper] Erro:", erro);
      return { sucesso: false, erro: truncarMensagem(erro.message, 500) };
    } finally {
      await fecharBrowser();
    }
  }

  return { rasparDadosHotel, fecharNavegadoresAtivos };
}

const coordenadorPadrao = criarCoordenadorScraper({
  buscarNaBooking: pesquisarBooking,
  buscarNaExpedia: pesquisarExpedia,
  lancarBrowser: () =>
    puppeteer.launch({
      headless: "new",
      executablePath: PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--disable-blink-features=AutomationControlled"],
    }),
  pastaImagensBase: PASTA_IMAGENS,
  latitudePadrao: LATITUDE_PADRAO,
  longitudePadrao: LONGITUDE_PADRAO,
});

module.exports = {
  rasparDadosHotel: coordenadorPadrao.rasparDadosHotel,
  fecharNavegadoresAtivos: coordenadorPadrao.fecharNavegadoresAtivos,
  calcularDistanciaCarroKm,
  normalizarNomeHotel,
  criarNomePastaHotel,
  // Exportado apenas para permitir testes unitários do fallback
  // Booking -> Expedia sem depender de Puppeteer ou rede real.
  criarCoordenadorScraper,
};
