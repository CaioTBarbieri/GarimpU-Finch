const express = require("express");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const criarBuscarRouter = require("./routes/buscar.routes");
const organizacaoRouter = require("./routes/organizacao.routes");

// Algoritmo offline para geração de Plus Codes
const { OpenLocationCode } = require("open-location-code");
const olc = new OpenLocationCode();

puppeteer.use(StealthPlugin());
const app = express();
const PORT = 3000;
const PASTA_IMAGENS =
  "C:\\Users\\User\\Downloads\\Trabaio\\Software\\DOWNLOADS HOTEIS";

app.use(express.json());
app.use("/img", express.static(PASTA_IMAGENS));

// ==========================================
// FUNÇÃO MATEMÁTICA CORRIGIDA (Com Fator de Sinuosidade)
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

const LAT_RECIFE = -14.815;
const LNG_RECIFE = -39.0333;

async function rasparDadosHotel(
  nomeHotel,
  baixarImagens = true,
  latitudeReferencia = LAT_RECIFE,
  longitudeReferencia = LNG_RECIFE,
) {
  const entrada = nomeHotel.trim();

  latitudeReferencia = Number(latitudeReferencia);
  longitudeReferencia = Number(longitudeReferencia);

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
  const ehLink = /^https?:\/\//i.test(entrada);
  const ehLinkBooking = /^https?:\/\/([a-z]{2,3}\.)?booking\.com\//i.test(
    entrada,
  );
  let linkBookingNormalizado = entrada;

  if (ehLinkBooking) {
    const url = new URL(entrada);
    if (/\/hotel\/[^/]+\/[^/.]+\/?$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/$/, "") + ".pt-br.html";
    }
    linkBookingNormalizado = url.toString();
  }

  const termoFormatado = encodeURIComponent(entrada);
  const urlBusca = `https://www.booking.com/searchresults.pt-br.html?ss=${termoFormatado}`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--disable-web-security", "--no-sandbox"],
  });
  const page = await browser.newPage();

  // Aumentando o timeout da página para aguentar o download em massa
  page.setDefaultNavigationTimeout(120000);

  try {
    if (ehLink && !ehLinkBooking) {
      throw new Error("Cole um link válido da Booking.com.");
    }

    const bloqueadorDeMidia = (req) => {
      if (["image", "stylesheet", "font", "media"].includes(req.resourceType()))
        req.abort();
      else req.continue();
    };

    await page.setRequestInterception(true);
    page.on("request", bloqueadorDeMidia);

    // ==========================================
    // FASE 1: PESQUISA BÁSICA
    // ==========================================
    let dadosPesquisa;

    if (ehLinkBooking) {
      dadosPesquisa = {
        link: linkBookingNormalizado,
        nome: "",
        enderecoBasico: "",
        nota: "Sem nota",
        regimePesquisa: "Não informado",
      };
    } else {
      const totalTentativas = 3;
      let encontrouCard = false;
      let ultimoErroBusca = null;

      for (let tentativa = 1; tentativa <= totalTentativas; tentativa++) {
        try {
          console.log(
            `[Busca] Tentativa ${tentativa}/${totalTentativas}: ${entrada}`,
          );
          await page.goto(urlBusca, { waitUntil: "domcontentloaded" });
          await page.waitForSelector('[data-testid="property-card"]', {
            timeout: 15000 + (tentativa - 1) * 10000,
          });
          encontrouCard = true;
          break;
        } catch (erroBusca) {
          ultimoErroBusca = erroBusca;
          console.warn(
            `[Busca] A tentativa ${tentativa}/${totalTentativas} falhou: ${erroBusca.message}`,
          );

          if (tentativa < totalTentativas) {
            await new Promise((resolve) =>
              setTimeout(resolve, tentativa * 2000),
            );
          }
        }
      }

      if (!encontrouCard) {
        throw new Error(
          `A Booking não exibiu resultados após ${totalTentativas} tentativas. ` +
            (ultimoErroBusca?.message || "Hotel não encontrado."),
        );
      }

      dadosPesquisa = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="property-card"]');
        if (!card) return null;

        const link = card.querySelector("a").href;
        const nome =
          card.querySelector('[data-testid="title"]')?.innerText?.trim() || "";
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
      });
    }

    if (!dadosPesquisa) throw new Error("Hotel não encontrado na pesquisa.");

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
    const html = await page.content();

    page.off("request", bloqueadorDeMidia);
    await page.setRequestInterception(false);

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
      if (matchNota) dadosPesquisa.nota = matchNota[0].replace(".", ",");
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
            const valorNota = Number(
              String(obj.aggregateRating.ratingValue).replace(",", "."),
            );
            if (valorNota >= 0 && valorNota <= 10) {
              dadosPesquisa.nota = valorNota.toFixed(1).replace(".", ",");
            }
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

    if (dadosPesquisa.nota !== "Sem nota") {
      const notaNumerica = Number(String(dadosPesquisa.nota).replace(",", "."));
      if (
        !Number.isFinite(notaNumerica) ||
        notaNumerica < 0 ||
        notaNumerica > 10
      ) {
        dadosPesquisa.nota = "Sem nota";
      }
    }

    if (ehLinkBooking && nomeOficial === entrada) {
      throw new Error(
        "A Booking não carregou os dados desse link. Confira se ele abre a página do hotel e tente novamente.",
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

    const textoPagina = $("body").text().replace(/\s+/g, " ");

    // Busca somente a descrição específica do hotel. Evita capturar textos de
    // filtros, menus e sugestões de outros hotéis espalhados pelo <body>.
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
    const textoBeiraMar = [nomeOficial, descricaoHotel, textoComodidades]
      .join(" ")
      .toLowerCase();
    const beiraMar =
      /\bbeira[- ]mar\b|à beira[- ]mar|de frente para o mar|praia privativa|beachfront|private beach/i.test(
        textoBeiraMar,
      )
        ? "Sim"
        : "Não";

    // --- AEROPORTO ---
    let aeroportoFinal = "Não informado";

    const extrairDistanciaKm = (texto) => {
      const match = texto.match(/(\d+(?:[.,]\d+)?)\s*(km|m)\b/i);
      if (!match) return null;

      const distancia = Number(match[1].replace(",", "."));
      const distanciaKm =
        match[2].toLowerCase() === "m" ? distancia / 1000 : distancia;
      const valorFormatado = Number.isInteger(distanciaKm)
        ? String(distanciaKm)
        : distanciaKm.toFixed(1);

      return `${valorFormatado} km`;
    };

    $('li, div.bui-list__item, div[data-testid="location-poi"]').each(
      (_, el) => {
        if (aeroportoFinal !== "Não informado") return;
        const txt = $(el).text().replace(/\s+/g, " ").trim();
        if (txt.toLowerCase().includes("aeroporto") && txt.length < 150) {
          const distancia = extrairDistanciaKm(txt);
          if (distancia) aeroportoFinal = `${distancia} (Booking)`;
        }
      },
    );

    if (aeroportoFinal === "Não informado") {
      const matchAero = textoPagina.match(
        /aeroporto[a-zA-ZÀ-ÿ\s\-\/]{0,80}\d+(?:[.,]\d+)?\s*km/i,
      );
      const distancia = matchAero ? extrairDistanciaKm(matchAero[0]) : null;
      if (distancia) aeroportoFinal = `${distancia} (Booking)`;
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
      aeroportoFinal = `${distCalculada} km (calculado pela equação)`;
    }

    // --- REGIME ---
    const identificarRegime = (texto) => {
      const textoLower = texto.toLowerCase();
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
        textoLower.includes("pequeno-almoço");
      const cafeIncluso =
        /(?:café da manhã|pequeno-almoço)[^.]{0,100}(?:incluíd[oa]|grátis|gratuito|cortesia)/i.test(
          texto,
        );
      if (mencionaCafe && cafeIncluso) return "Café da manhã incluído";
      if (mencionaCafe) return "Café da manhã disponível";
      return "Não informado";
    };

    const regimeDaDescricao = identificarRegime(descricaoHotel);
    const regimeFinal =
      regimeDaDescricao !== "Não informado"
        ? regimeDaDescricao
        : dadosPesquisa.regimePesquisa;

    // --- FASE 3: PLUS CODE ---
    let plusCode = "Não localizado";
    if (lat && lng && lat !== "GPS não disponível") {
      try {
        plusCode = olc.encode(parseFloat(lat), parseFloat(lng));
      } catch (error) {}
    }

    // ==========================================
    // FASE 4: IMAGENS (SEM LIMITE + SUPORTE À IA)
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

    const nomeLimpo = nomeOficial.replace(/[^a-zA-Z0-9]/g, "_");
    const pastaBase = PASTA_IMAGENS;
    const pastaHotel = path.resolve(pastaBase, nomeLimpo);

    const caminhosImagensLocais = [];

    if (baixarImagens) {
      // Rotina pesada do Viny
      if (!fs.existsSync(pastaHotel))
        fs.mkdirSync(pastaHotel, { recursive: true });

      for (let i = 0; i < imagensArray.length; i++) {
        const url = imagensArray[i];
        const nomeArquivo = `foto_HD_${i + 1}`;
        const caminhoCompleto = path.resolve(pastaHotel, `${nomeArquivo}.jpg`);

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

        if (resultado.sucesso) {
          fs.writeFileSync(
            caminhoCompleto,
            Buffer.from(resultado.base64, "base64"),
          );
          caminhosImagensLocais.push(
            `/img/${encodeURIComponent(nomeLimpo)}/${nomeArquivo}.jpg`,
          );
        }
      }
    } else {
      // Rotina rápida
      caminhosImagensLocais.push(...imagensArray);
    }

    await browser.close();

    // ========================================================
    // IMAGENS LOCAIS E LEGENDAS GERADAS PELA IA
    // ========================================================
    // Sempre existe, mesmo antes de organizar as imagens com a IA.
    // Isso evita o erro: "altTexts is not defined".
    let altTexts = {};

    if (baixarImagens && fs.existsSync(pastaHotel)) {
      console.log(
        `\n[+] Download concluído. Imagens salvas na pasta do hotel.`,
      );

      // Refaz a lista a partir do disco para incluir imagens que já tenham
      // sido movidas para subpastas pelo organizar_hoteis.py.
      caminhosImagensLocais.length = 0;

      const lerPastaRecursivo = (diretorio) => {
        let imagensEncontradas = [];

        for (const arquivo of fs.readdirSync(diretorio)) {
          const caminhoAbsoluto = path.join(diretorio, arquivo);
          const stat = fs.statSync(caminhoAbsoluto);

          if (stat.isDirectory()) {
            imagensEncontradas = imagensEncontradas.concat(
              lerPastaRecursivo(caminhoAbsoluto),
            );
            continue;
          }

          if (/\.(?:jpg|jpeg|png|webp)$/i.test(arquivo)) {
            const caminhoRelativo = path
              .relative(PASTA_IMAGENS, caminhoAbsoluto)
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

      caminhosImagensLocais.push(...lerPastaRecursivo(pastaHotel));
    }
    // ========================================================

    return {
      sucesso: true,
      nome: nomeOficial,
      endereco: enderecoFinal,
      bairro: bairro,
      tipoHotel: tipoHotel,
      beiraMar: beiraMar,
      coordenadas: coordenadas,
      plusCode: plusCode,
      nota: dadosPesquisa.nota,
      regime: regimeFinal,
      aeroporto: aeroportoFinal,
      imagens: caminhosImagensLocais,
      altTexts,
      baixouLocal: baixarImagens,
    };
  } catch (error) {
    if (browser) await browser.close();
    return { sucesso: false, erro: error.message };
  }
}

app.use(organizacaoRouter);
app.use(
  criarBuscarRouter({
    rasparDadosHotel,
    latitudePadrao: LAT_RECIFE,
    longitudePadrao: LNG_RECIFE,
  }),
);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`\n[+] Servidor da Interface Gráfica iniciado com sucesso!`);
  console.log(`[+] Aceda no seu navegador: http://localhost:${PORT}\n`);
});
