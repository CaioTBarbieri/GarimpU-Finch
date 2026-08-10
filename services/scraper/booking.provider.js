const cheerio = require("cheerio");
const path = require("path");
const { OpenLocationCode } = require("open-location-code");
const {
  normalizarNomeHotel,
  criarNomePastaHotel,
  calcularDistanciaCarroKm,
  extrairDistanciaKm,
  formatarDistanciaAeroporto,
  normalizarNota,
  identificarRegime,
  detectarBeiraMar,
  escolherMelhorCandidato,
  detectarDesafioAntibot,
  baixarImagensParaPasta,
  lerPastaImagensRecursivo,
} = require("./scraper-utils");
const {
  ErroFonte,
  ErroEntrada,
  ErroArmazenamento,
  ErroProcessamento,
} = require("./scraper-errors");
const { avaliarFiltroDownload } = require("../filtro-download.service");

const olc = new OpenLocationCode();
const FONTE = "Booking";

function ehLinkBooking(texto) {
  return /^https:\/\/([a-z]{2,3}\.)?booking\.com\//i.test(String(texto || ""));
}

function normalizarLinkBooking(link) {
  const url = new URL(link);
  if (/\/hotel\/[^/]+\/[^/.]+\/?$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/$/, "") + ".pt-br.html";
  }
  return url.toString();
}

// Deriva um termo pesquisável a partir do slug de um link direto da Booking,
// para uso como fallback textual na Expedia. Retorna null quando não for
// possível derivar algo confiável (o chamador não deve inventar uma pesquisa).
function derivarTermoDeLinkBooking(link) {
  let url;
  try {
    url = new URL(link);
  } catch {
    return null;
  }

  const match = url.pathname.match(/\/hotel\/[^/]+\/([^/.]+)/i);
  if (!match) return null;

  const slug = match[1];
  if (!slug || slug.length < 3) return null;

  const termo = slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!termo || /^[0-9\s]+$/.test(termo)) return null;

  return termo;
}

function bloqueadorDeMidiaHandler(req) {
  if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) {
    req.abort();
  } else {
    req.continue();
  }
}

async function ativarBloqueioDeMidia(page) {
  await page.setRequestInterception(true);
  page.on("request", bloqueadorDeMidiaHandler);
}

async function desativarBloqueioDeMidia(page) {
  page.off("request", bloqueadorDeMidiaHandler);
  await page.setRequestInterception(false).catch(() => {});
}

async function pesquisarCardsBooking(page, entrada) {
  const termoFormatado = encodeURIComponent(entrada);
  const urlBusca = `https://www.booking.com/searchresults.pt-br.html?ss=${termoFormatado}`;
  const totalTentativas = 3;
  let ultimoErroBusca = null;

  for (let tentativa = 1; tentativa <= totalTentativas; tentativa++) {
    try {
      console.log(`[Booking] Tentativa ${tentativa}/${totalTentativas}: ${entrada}`);
      await page.goto(urlBusca, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-testid="property-card"]', {
        timeout: 15000 + (tentativa - 1) * 10000,
      });
      return await extrairCandidatosDaPagina(page);
    } catch (erroBusca) {
      ultimoErroBusca = erroBusca;
      console.warn(
        `[Booking] Falha: ${erroBusca.message}`,
      );

      if (await detectarDesafioAntibot(page)) {
        console.warn("[Booking] Desafio antibot detectado, interrompendo tentativas.");
        throw new ErroFonte(
          "A Booking pediu uma verificação de segurança (CAPTCHA) e bloqueou o acesso automático no momento. Tente novamente mais tarde.",
          { fonte: FONTE },
        );
      }

      if (tentativa < totalTentativas) {
        await new Promise((resolve) => setTimeout(resolve, tentativa * 2000));
      }
    }
  }

  throw new ErroFonte(
    `A Booking não exibiu resultados após ${totalTentativas} tentativas. ` +
      (ultimoErroBusca?.message || "Hotel não encontrado."),
    { fonte: FONTE },
  );
}

async function extrairCandidatosDaPagina(page) {
  return page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll('[data-testid="property-card"]'),
    ).slice(0, 5);

    return cards
      .map((card) => {
        const anchor = card.querySelector("a");
        const link = anchor ? anchor.href : "";
        const nome =
          card.querySelector('[data-testid="title"]')?.innerText?.trim() || "";
        if (!link || !nome) return null;

        const enderecoBasico =
          card.querySelector('[data-testid="address"]')?.innerText?.trim() ||
          "";

        const elementoNota = card.querySelector('[data-testid="review-score"]');
        let nota = "Sem nota";
        if (elementoNota) {
          const match = elementoNota.innerText.match(/(?:10|[0-9])[.,][0-9]\b/);
          nota = match ? match[0] : "Sem nota";
        }

        let regimeExtraido = "Não informado";
        const textoCard = card.innerText.toLowerCase();

        if (
          textoCard.includes("all inclusive") ||
          textoCard.includes("tudo incluído")
        )
          regimeExtraido = "All Inclusive";
        else if (
          textoCard.includes("pensão completa") ||
          textoCard.includes("full board")
        )
          regimeExtraido = "Pensão completa";
        else if (
          textoCard.includes("meia pensão") ||
          textoCard.includes("half board")
        )
          regimeExtraido = "Meia pensão";
        else if (
          textoCard.includes("café da manhã incluído") ||
          textoCard.includes("pequeno-almoço incluído")
        )
          regimeExtraido = "Café da manhã incluído";
        else if (textoCard.includes("café da manhã"))
          regimeExtraido = "Café da manhã disponível";

        return {
          link,
          nome,
          enderecoBasico,
          nota,
          regimePesquisa: regimeExtraido,
        };
      })
      .filter(Boolean);
  });
}

async function pesquisarBooking(page, opcoes) {
  try {
    return await executarPesquisaBooking(page, opcoes);
  } catch (erro) {
    if (
      erro instanceof ErroFonte ||
      erro instanceof ErroEntrada ||
      erro instanceof ErroArmazenamento ||
      erro instanceof ErroProcessamento
    ) {
      throw erro;
    }
    // Qualquer outra falha ao interagir com a página da Booking (navegação,
    // timeout, bloqueio, parsing) é tratada como falha da fonte, acionando
    // o fallback para a Expedia.
    throw new ErroFonte(`Falha ao processar dados da Booking: ${erro.message}`, {
      fonte: FONTE,
      causa: erro,
    });
  } finally {
    await desativarBloqueioDeMidia(page).catch(() => {});
  }
}

async function executarPesquisaBooking(page, opcoes) {
  const {
    entrada,
    ehLink,
    latitudeReferencia,
    longitudeReferencia,
    baixarImagens,
    pastaImagensBase,
    pastaImagensDestino = pastaImagensBase,
    filtroDownload,
  } = opcoes;

  const linkBookingDireto = ehLink ? normalizarLinkBooking(entrada) : null;

  await ativarBloqueioDeMidia(page);

  let dadosPesquisa;

  try {
    if (linkBookingDireto) {
      dadosPesquisa = {
        link: linkBookingDireto,
        nome: "",
        enderecoBasico: "",
        nota: "Sem nota",
        regimePesquisa: "Não informado",
      };
    } else {
      const candidatos = await pesquisarCardsBooking(page, entrada);

      if (candidatos.length === 0) {
        throw new ErroFonte("Hotel não encontrado na pesquisa da Booking.", {
          fonte: FONTE,
        });
      }

      const melhorCandidato = escolherMelhorCandidato(
        entrada,
        candidatos,
        (candidato) => candidato.nome,
      );

      if (!melhorCandidato) {
        throw new ErroFonte(
          "Nenhum resultado da Booking corresponde de forma confiável ao hotel pesquisado.",
          { fonte: FONTE },
        );
      }

      dadosPesquisa = melhorCandidato;
    }

    // ==========================================
    // FASE 2: PÁGINA INTERNA E GPS
    // ==========================================
    await page.goto(dadosPesquisa.link, { waitUntil: "domcontentloaded" });
    await page
      .waitForSelector('[data-testid="title"], h1, h2.pp-header__title', {
        timeout: 15000,
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));

    if (await detectarDesafioAntibot(page)) {
      throw new ErroFonte(
        "A Booking pediu uma verificação de segurança (CAPTCHA) e bloqueou o acesso automático no momento. Tente novamente mais tarde.",
        { fonte: FONTE },
      );
    }

    const html = await page.content();

    await desativarBloqueioDeMidia(page);

    const $ = cheerio.load(html);
    let nomeOficial =
      dadosPesquisa.nome ||
      $('[data-testid="title"], h1, h2.pp-header__title')
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim() ||
      entrada;

    let enderecoInterno = $('[data-testid="address"], .hp_address_subtitle')
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    let lat = "";
    let lng = "";

    if (dadosPesquisa.nota === "Sem nota") {
      const textoNota = $(
        '[data-testid="review-score-right-component"], [data-testid="review-score-component"]',
      )
        .first()
        .text();
      const matchNota = textoNota.match(/(?:10|[0-9])[.,][0-9]\b/);
      if (matchNota) dadosPesquisa.nota = matchNota[0];
    }

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const jsonData = JSON.parse($(el).html());
        const obj = Array.isArray(jsonData)
          ? jsonData.find((j) => j.address || j.geo)
          : jsonData;
        if (obj) {
          if (!dadosPesquisa.nome && obj.name) nomeOficial = obj.name;
          if (
            dadosPesquisa.nota === "Sem nota" &&
            obj.aggregateRating?.ratingValue
          ) {
            dadosPesquisa.nota = String(obj.aggregateRating.ratingValue);
          }
          if (obj.address) {
            const rua = obj.address.streetAddress || "";
            const cidade = obj.address.addressLocality || "";
            const estado = obj.address.addressRegion || "";
            const enderecoCompleto = [rua, cidade, estado]
              .filter(Boolean)
              .join(", ");
            if (enderecoCompleto) enderecoInterno = enderecoCompleto;
          }
          if (obj.geo && obj.geo.latitude && obj.geo.longitude) {
            lat = obj.geo.latitude;
            lng = obj.geo.longitude;
          }
        }
      } catch (e) {}
    });

    const notaNormalizada = normalizarNota(dadosPesquisa.nota);

    if (linkBookingDireto && nomeOficial === entrada) {
      throw new ErroFonte(
        "A Booking não carregou os dados desse link. Confira se ele abre a página do hotel e tente novamente.",
        { fonte: FONTE },
      );
    }

    nomeOficial = normalizarNomeHotel(nomeOficial);
    if (!nomeOficial) {
      throw new ErroFonte(
        "A Booking não informou um nome válido para o hotel.",
        { fonte: FONTE },
      );
    }

    if (!lat || !lng) {
      const mapLink = $("a[data-atlas-latlng]").attr("data-atlas-latlng");
      if (mapLink) {
        const parts = mapLink.split(",");
        if (parts.length === 2) {
          lat = parts[0].trim();
          lng = parts[1].trim();
        }
      }
    }

    let enderecoBruto =
      enderecoInterno ||
      dadosPesquisa.enderecoBasico ||
      "Morada não localizada";
    let partesEnd = enderecoBruto.split(",").map((p) => p.trim());
    let partesUnicas = [];
    partesEnd.forEach((p) => {
      if (
        p &&
        !partesUnicas.some((pu) => pu.toLowerCase() === p.toLowerCase())
      ) {
        partesUnicas.push(p);
      }
    });
    let enderecoFinal = partesUnicas.join(", ");
    let coordenadas = lat && lng ? `${lat}, ${lng}` : "GPS não disponível";

    const nomeLower = nomeOficial.toLowerCase();
    const tipoHotel = nomeLower.includes("pousada")
      ? "Pousada"
      : nomeLower.includes("resort")
        ? "Resort"
        : "Hotel";

    const partesEndereco = enderecoBruto
      .split(",")
      .map((parte) => parte.trim())
      .filter(Boolean);
    const indiceCep = partesEndereco.findIndex((parte) =>
      /\bcep\b|\b\d{5}-?\d{3}\b/i.test(parte),
    );
    let bairro = indiceCep > 0 ? partesEndereco[indiceCep - 1] : "";

    if (!bairro) {
      bairro =
        [...partesEndereco].reverse().find((parte, indiceReverso) => {
          const indiceOriginal = partesEndereco.length - 1 - indiceReverso;
          return (
            indiceOriginal > 0 &&
            !/\b(?:cep|brasil|brazil|pernambuco|primeiro andar|andar|apto|apartamento)\b/i.test(
              parte,
            ) &&
            !/^\s*(?:pe|br)\s*$/i.test(parte) &&
            !/^(?:n[º°.]?\s*)?\d+/i.test(parte)
          );
        }) ||
        partesEndereco[1] ||
        "Não informado";
    }

    let descricaoHotel = $(
      '[data-testid="property-description"], #property_description_content, .hp-description',
    )
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const procurarDescricaoNoJson = (valor, chavePai = "") => {
      if (!valor || typeof valor !== "object") return "";

      if (
        typeof valor.description === "string" &&
        (valor.__typename === "HotelTranslation" ||
          chavePai === "HotelTranslation")
      ) {
        return valor.description;
      }

      for (const [chave, filho] of Object.entries(valor)) {
        const encontrada = procurarDescricaoNoJson(filho, chave);
        if (encontrada) return encontrada;
      }
      return "";
    };

    if (!descricaoHotel) {
      $("script").each((_, el) => {
        if (descricaoHotel) return false;
        const conteudo = $(el).html()?.trim();
        if (
          !conteudo ||
          (!conteudo.startsWith("{") && !conteudo.startsWith("["))
        )
          return;

        try {
          descricaoHotel = procurarDescricaoNoJson(JSON.parse(conteudo));
        } catch (e) {}
      });
    }

    const textoComodidades = $(
      '[data-testid="property-most-popular-facilities-wrapper"], [data-testid="facility-group-container"]',
    ).text();
    const beiraMar = detectarBeiraMar([nomeOficial, descricaoHotel, textoComodidades]);

    // --- AEROPORTO ---
    let aeroportoFinal = "Não informado";
    const textoPagina = $("body").text().replace(/\s+/g, " ");

    $('li, div.bui-list__item, div[data-testid="location-poi"]').each(
      (_, el) => {
        if (aeroportoFinal !== "Não informado") return;
        const txt = $(el).text().replace(/\s+/g, " ").trim();
        if (txt.toLowerCase().includes("aeroporto") && txt.length < 150) {
          const distancia = extrairDistanciaKm(txt);
          if (distancia) aeroportoFinal = formatarDistanciaAeroporto(distancia, FONTE);
        }
      },
    );

    if (aeroportoFinal === "Não informado") {
      const matchAero = textoPagina.match(
        /aeroporto[a-zA-ZÀ-ÿ\s\-\/]{0,80}\d+(?:[.,]\d+)?\s*km/i,
      );
      const distancia = matchAero ? extrairDistanciaKm(matchAero[0]) : null;
      if (distancia) aeroportoFinal = formatarDistanciaAeroporto(distancia, FONTE);
    }

    if (
      aeroportoFinal === "Não informado" &&
      lat &&
      lng &&
      lat !== "GPS não disponível"
    ) {
      const distCalculada = calcularDistanciaCarroKm(
        parseFloat(lat),
        parseFloat(lng),
        latitudeReferencia,
        longitudeReferencia,
      );
      aeroportoFinal = formatarDistanciaAeroporto(`${distCalculada} km`, "calculado pela equação");
    }

    // --- REGIME ---
    const regimeDaDescricao = identificarRegime(descricaoHotel);
    const regimeFinal =
      regimeDaDescricao !== "Não informado"
        ? regimeDaDescricao
        : dadosPesquisa.regimePesquisa;

    // --- PLUS CODE ---
    let plusCode = "Não localizado";
    if (lat && lng && lat !== "GPS não disponível") {
      try {
        plusCode = olc.encode(parseFloat(lat), parseFloat(lng));
      } catch (error) {}
    }

    // ==========================================
    // IMAGENS
    // ==========================================
    const codigoFonteLimpo = html.replace(/\\\//g, "/");
    const regexFotos =
      /https:\/\/cf\.bstatic\.com[a-zA-Z0-9_\-\/]*?\/images\/hotel[a-zA-Z0-9_\-\/]*?\.jpg[a-zA-Z0-9_\-\/\?\.\=\&\;]*/gi;
    const matches = codigoFonteLimpo.match(regexFotos) || [];

    const urlsImagens = new Map();
    matches.forEach((url) => {
      const urlSemQuery = url.split("?")[0];
      const idImagem = urlSemQuery.split("/").pop();
      let prioridade = url.includes("max1280")
        ? 4
        : url.includes("max1024")
          ? 3
          : url.includes("max500")
            ? 2
            : 1;

      if (
        !urlsImagens.has(idImagem) ||
        prioridade > urlsImagens.get(idImagem).prioridade
      ) {
        urlsImagens.set(idImagem, { url, prioridade });
      }
    });

    const imagensArray = Array.from(urlsImagens.values())
      .filter((item) => item.prioridade >= 3)
      .map((item) => item.url);

    const nomeLimpo = criarNomePastaHotel(nomeOficial);
    const pastaHotel = path.resolve(pastaImagensDestino, nomeLimpo);

    let caminhosImagensLocais = [];
    let altTexts = {};
    const avaliacaoFiltroDownload = avaliarFiltroDownload({
      filtro: filtroDownload,
      endereco: enderecoFinal,
      coordenadas,
      latitudeReferencia,
      longitudeReferencia,
    });
    const deveBaixarImagens = baixarImagens && avaliacaoFiltroDownload.aprovado;

    if (deveBaixarImagens) {
      caminhosImagensLocais = await baixarImagensParaPasta({
        page,
        imagensUrls: imagensArray,
        pastaHotel,
      });

      console.log(`\n[+] Download concluído. Imagens salvas na pasta do hotel.`);
      const resultadoLeitura = lerPastaImagensRecursivo(pastaHotel, pastaImagensBase);
      caminhosImagensLocais = resultadoLeitura.imagens;
      altTexts = resultadoLeitura.altTexts;
    } else {
      caminhosImagensLocais = imagensArray;
      if (baixarImagens && !avaliacaoFiltroDownload.aprovado) {
        console.log(`[-] Download ignorado pelo filtro: ${avaliacaoFiltroDownload.motivo}.`);
      }
    }

    return {
      sucesso: true,
      nome: nomeOficial,
      endereco: enderecoFinal,
      bairro: bairro,
      tipoHotel: tipoHotel,
      beiraMar: beiraMar,
      coordenadas: coordenadas,
      plusCode: plusCode,
      nota: notaNormalizada,
      regime: regimeFinal,
      aeroporto: aeroportoFinal,
      imagens: caminhosImagensLocais,
      altTexts,
      baixouLocal: deveBaixarImagens,
      filtroDownload: baixarImagens ? avaliacaoFiltroDownload : undefined,
      fonte: FONTE,
      urlFonte: dadosPesquisa.link,
    };
  } finally {
    await desativarBloqueioDeMidia(page);
  }
}

module.exports = {
  pesquisarBooking,
  ehLinkBooking,
  normalizarLinkBooking,
  derivarTermoDeLinkBooking,
};
