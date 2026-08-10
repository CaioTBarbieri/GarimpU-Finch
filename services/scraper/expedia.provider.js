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
const FONTE = "Expedia";
const HOSTS_IMAGEM_PERMITIDOS = ["trvl-media.com", "expedia.com", "expedia.com.br"];

function ehLinkExpedia(texto) {
  return /^https:\/\/([a-z]{2,3}\.)?expedia\.(com|com\.br)\//i.test(
    String(texto || ""),
  );
}

function bloqueadorDeMidiaHandler(req) {
  if (["stylesheet", "font", "media"].includes(req.resourceType())) {
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

// Um link de hotel sem `chkin`/`chkout` faz a Expedia abrir um diálogo
// "escolha as datas" por cima da página e pular o carregamento dos dados do
// imóvel (endereço, coordenadas, galeria completa) até que uma data seja
// selecionada. Como o hotel pesquisado nem sempre tem esses parâmetros no
// link colado pelo usuário, garante datas padrão (arbitrárias, só para
// destravar o carregamento) antes de navegar.
function garantirDatasNaUrl(urlTexto) {
  try {
    const url = new URL(urlTexto);
    if (!url.searchParams.has("chkin") || !url.searchParams.has("chkout")) {
      const formatar = (data) => data.toISOString().slice(0, 10);
      const checkin = new Date();
      checkin.setDate(checkin.getDate() + 30);
      const checkout = new Date(checkin);
      checkout.setDate(checkout.getDate() + 1);
      url.searchParams.set("chkin", formatar(checkin));
      url.searchParams.set("chkout", formatar(checkout));
    }
    return url.toString();
  } catch (e) {
    return urlTexto;
  }
}

function montarUrlBuscaExpedia(entrada) {
  const termo = encodeURIComponent(entrada);
  return `https://www.expedia.com.br/Hotel-Search?destination=${termo}`;
}

const SELETORES_CARD =
  '[data-stid="property-listing"], [data-stid*="lodging-card-responsive"], li[data-stid="lodging-card"]';
const SELETORES_TITULO_CARD =
  '[data-stid="content-hotel-title"], h3, [data-test-id="listing-title"]';

async function pesquisarCardsExpedia(page, entrada) {
  const urlBusca = montarUrlBuscaExpedia(entrada);
  const totalTentativas = 3;
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= totalTentativas; tentativa++) {
    try {
      console.log(`[Expedia] Tentativa ${tentativa}/${totalTentativas}: ${entrada}`);
      await page.goto(urlBusca, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(SELETORES_CARD, {
        timeout: 15000 + (tentativa - 1) * 10000,
      });
      const candidatos = await page.evaluate(
        (seletorCard, seletorTitulo) => {
          const cards = Array.from(
            document.querySelectorAll(seletorCard),
          ).slice(0, 5);

          return cards
            .map((card) => {
              // Alguns cards têm um link "Faça login para acessar descontos
              // extras" antes do link real do hotel. Prioriza o link que
              // abre a página do hotel e nunca usa um link de login.
              const anchors = Array.from(card.querySelectorAll("a[href]"));
              const anchor =
                anchors.find(
                  (a) => a.getAttribute("data-stid") === "open-product-information",
                ) || anchors.find((a) => !/\/user\/signin/i.test(a.href));
              const link = anchor ? anchor.href : "";
              const nome =
                card.querySelector(seletorTitulo)?.textContent?.trim() || "";
              if (!link || !nome) return null;
              return { link, nome };
            })
            .filter(Boolean);
        },
        SELETORES_CARD,
        SELETORES_TITULO_CARD,
      );

      if (candidatos.length > 0) return candidatos;
      throw new Error("Página de pesquisa sem cards de hotéis.");
    } catch (erro) {
      ultimoErro = erro;
      console.warn(`[Expedia] Falha: ${erro.message}`);

      if (await detectarDesafioAntibot(page)) {
        console.warn("[Expedia] Desafio antibot detectado, interrompendo tentativas.");
        throw new ErroFonte(
          "A Expedia pediu uma verificação de segurança (CAPTCHA) e bloqueou o acesso automático no momento. Tente novamente mais tarde.",
          { fonte: FONTE },
        );
      }

      if (tentativa < totalTentativas) {
        await new Promise((resolve) => setTimeout(resolve, tentativa * 2000));
      }
    }
  }

  throw new ErroFonte(
    `A Expedia não exibiu resultados após ${totalTentativas} tentativas. ` +
      (ultimoErro?.message || "Hotel não encontrado."),
    { fonte: FONTE },
  );
}

// ==========================================
// EXTRAÇÃO ESTRUTURADA (JSON-LD > estado embutido > seletores visuais)
// ==========================================
function extrairJsonLdHotel($) {
  let encontrado = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (encontrado) return false;
    try {
      const conteudo = JSON.parse($(el).html());
      const lista = Array.isArray(conteudo) ? conteudo : [conteudo];
      const candidato = lista.find((item) => {
        const tipo = String(item?.["@type"] || "").toLowerCase();
        return (
          tipo.includes("hotel") ||
          tipo.includes("lodgingbusiness") ||
          (item && item.address && item.name)
        );
      });
      if (candidato) encontrado = candidato;
    } catch (e) {}
  });

  return encontrado;
}

// Busca genérica por um objeto que tenha, ao mesmo tempo, coordenadas e nome,
// dentro do JSON de estado embutido nos <script> da página (comum em SPAs).
function procurarObjetoComCoordenadas(valor, profundidade = 0) {
  if (!valor || typeof valor !== "object" || profundidade > 6) return null;

  const temCoordenadas =
    (typeof valor.latitude === "number" || typeof valor.lat === "number") &&
    (typeof valor.longitude === "number" || typeof valor.lng === "number");

  if (temCoordenadas) return valor;

  for (const chave of Object.keys(valor)) {
    const encontrado = procurarObjetoComCoordenadas(valor[chave], profundidade + 1);
    if (encontrado) return encontrado;
  }

  return null;
}

// A página de hotel da Expedia não expõe endereço/coordenadas em um
// <script type="application/ld+json"> de verdade (o único presente costuma
// ser um FAQPage). Os dados reais (schema.org Hotel) ficam como uma string
// JSON escapada dentro do estado da aplicação (`window.__PLUGIN_STATE__`),
// sob uma chave `seoStructuredData`. Só é possível ler isso executando no
// contexto da página, por isso usa page.evaluate em vez de cheerio.
async function obterDadosEstruturadosDoEstado(page) {
  try {
    const bruto = await page.evaluate(() => {
      function localizarSeoStructuredData(valor, profundidade, vistos) {
        if (!valor || typeof valor !== "object" || profundidade > 40) {
          return null;
        }
        if (vistos.has(valor)) return null;
        vistos.add(valor);

        if (typeof valor.seoStructuredData === "string") {
          return valor.seoStructuredData;
        }

        for (const chave of Object.keys(valor)) {
          const encontrado = localizarSeoStructuredData(
            valor[chave],
            profundidade + 1,
            vistos,
          );
          if (encontrado) return encontrado;
        }
        return null;
      }

      const estado = window.__PLUGIN_STATE__;
      return estado ? localizarSeoStructuredData(estado, 0, new Set()) : null;
    });

    if (!bruto) return null;
    return JSON.parse(bruto);
  } catch (e) {
    return null;
  }
}

function extrairEstadoEmbutido($) {
  let estado = null;

  $("script").each((_, el) => {
    if (estado) return false;
    const conteudo = $(el).html()?.trim();
    if (!conteudo || (!conteudo.startsWith("{") && !conteudo.startsWith("["))) {
      return;
    }
    if (conteudo.length > 3_000_000) return;

    try {
      const json = JSON.parse(conteudo);
      const coordenadas = procurarObjetoComCoordenadas(json);
      if (coordenadas) estado = { raiz: json, coordenadas };
    } catch (e) {}
  });

  return estado;
}

// A CDN da Expedia (trvl-media.com) identifica cada foto pelo caminho (um
// hash), e não por um sufixo de tamanho no nome do arquivo como a Booking.
// O tamanho vem só nos parâmetros de query (`rw=`/`w=`), então a prioridade
// precisa ser lida ali — testar o texto inteiro da URL contra números soltos
// (ex.: "1280") gera falso-positivo/negativo, já que o próprio ID do imóvel
// na URL é numérico e pode coincidir por acaso.
function obterLarguraImagem(url) {
  const match = url.match(/[?&](?:rw|w)=(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function extrairUrlsFotosDeTexto(texto) {
  const regexFotos =
    /https:\/\/[a-z0-9.-]*\.(?:trvl-media\.com|expedia\.com|expedia\.com\.br)\/[^\s"'\\]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'\\]*)?/gi;
  const matches = texto.match(regexFotos) || [];
  return matches.map((urlBruta) =>
    urlBruta.replace(/\\\//g, "/").replace(/&amp;/g, "&"),
  );
}

// Recebe URLs de várias origens (HTML renderizado, JSON-LD, estado da
// aplicação) e mantém apenas a melhor variante (maior largura) de cada foto,
// já filtrando hosts fora da lista permitida.
function finalizarListaImagens(urls) {
  const urlsImagens = new Map();
  urls.forEach((url) => {
    if (typeof url !== "string" || !/^https:\/\//i.test(url)) return;
    const semQuery = url.split("?")[0];
    const largura = obterLarguraImagem(url);

    const atual = urlsImagens.get(semQuery);
    if (!atual || largura > atual.largura) {
      urlsImagens.set(semQuery, { url, largura });
    }
  });

  return Array.from(urlsImagens.values())
    .map((item) => item.url)
    .filter((url) => {
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        return HOSTS_IMAGEM_PERMITIDOS.some(
          (host) => hostname === host || hostname.endsWith("." + host),
        );
      } catch {
        return false;
      }
    });
}

function extrairImagensDaPagina(html) {
  return finalizarListaImagens(extrairUrlsFotosDeTexto(html));
}

// A pré-visualização da galeria só renderiza um punhado de <img> no HTML
// inicial; a galeria completa (às vezes 100+ fotos) só existe como <img> no
// DOM depois que o usuário abre o modal "ver todas as fotos". Só que os
// dados de TODAS as fotos já chegam prontos no estado da aplicação (dentro
// de window.__PLUGIN_STATE__, em um array de objetos "ProductImageInfo"),
// mesmo sem a interação — evita depender de clicar em botões cujo texto/
// seletor muda com frequência. Às vezes a Expedia não inclui esse bloco na
// carga inicial (ex.: sob throttling/anti-bot); nesse caso a função retorna
// null e o chamador cai de volta para as fotos já visíveis no HTML.
async function obterJsonGaleriaCompletaDoEstado(page) {
  const tentarLocalizar = () =>
    page.evaluate(() => {
      function localizarGaleria(valor, profundidade, vistos) {
        if (!valor || typeof valor !== "object" || profundidade > 60) {
          return null;
        }
        if (vistos.has(valor)) return null;
        vistos.add(valor);

        if (
          Array.isArray(valor) &&
          valor.length > 0 &&
          valor[0] &&
          typeof valor[0] === "object" &&
          valor[0].__typename === "ProductImageInfo"
        ) {
          return valor;
        }

        for (const chave of Object.keys(valor)) {
          const encontrado = localizarGaleria(
            valor[chave],
            profundidade + 1,
            vistos,
          );
          if (encontrado) return encontrado;
        }
        return null;
      }

      const galeria = window.__PLUGIN_STATE__
        ? localizarGaleria(window.__PLUGIN_STATE__, 0, new Set())
        : null;
      return galeria ? JSON.stringify(galeria) : null;
    });

  try {
    let resultado = await tentarLocalizar();
    if (!resultado) {
      // O carregamento da galeria pode terminar um pouco depois do restante
      // da página; uma segunda tentativa cobre essa corrida sem atrasar
      // muito o caso comum em que ela nunca chega.
      await new Promise((r) => setTimeout(r, 1200));
      resultado = await tentarLocalizar();
    }
    return resultado;
  } catch (e) {
    return null;
  }
}

function extrairNotaEstruturada(jsonLd) {
  const aggregateRating = jsonLd?.aggregateRating;
  if (!aggregateRating || aggregateRating.ratingValue === undefined) return null;

  const valor = Number(String(aggregateRating.ratingValue).replace(",", "."));
  if (!Number.isFinite(valor)) return null;

  const melhorNota = Number(aggregateRating.bestRating);
  if (Number.isFinite(melhorNota) && melhorNota > 0 && melhorNota !== 10) {
    return (valor / melhorNota) * 10;
  }
  return valor;
}

async function extrairDadosHotelExpedia(page, opcoes) {
  const { latitudeReferencia, longitudeReferencia } = opcoes;
  const html = await page.content();
  const $ = cheerio.load(html);

  // O único <script type="application/ld+json"> da página costuma ser um
  // FAQPage, sem endereço/coordenadas. Os dados reais do hotel (schema.org
  // Hotel) ficam escondidos no estado da aplicação; são priorizados aqui
  // quando disponíveis.
  const jsonLdPagina = extrairJsonLdHotel($);
  const dadosEstado = await obterDadosEstruturadosDoEstado(page);
  const pareceHotel = (valor) =>
    Boolean(valor) && (valor.address || typeof valor.latitude === "number");
  const jsonLd = pareceHotel(dadosEstado)
    ? dadosEstado
    : pareceHotel(jsonLdPagina)
      ? jsonLdPagina
      : jsonLdPagina || dadosEstado;
  const estadoEmbutido = jsonLd ? null : extrairEstadoEmbutido($);

  let nomeOficial =
    jsonLd?.name ||
    estadoEmbutido?.coordenadas?.name ||
    $('[data-stid="content-hotel-title"], h1').first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    "";

  nomeOficial = normalizarNomeHotel(nomeOficial);
  if (!nomeOficial) {
    throw new ErroFonte("A Expedia não informou um nome válido para o hotel.", {
      fonte: FONTE,
    });
  }

  let lat = "";
  let lng = "";
  if (jsonLd?.geo?.latitude && jsonLd?.geo?.longitude) {
    lat = jsonLd.geo.latitude;
    lng = jsonLd.geo.longitude;
  } else if (
    typeof jsonLd?.latitude === "number" &&
    typeof jsonLd?.longitude === "number"
  ) {
    // O bloco estruturado embutido no estado da Expedia traz latitude e
    // longitude direto na raiz do objeto, sem o aninhamento `geo.*` do
    // schema.org "GeoCoordinates" usado por outras fontes.
    lat = jsonLd.latitude;
    lng = jsonLd.longitude;
  } else if (estadoEmbutido?.coordenadas) {
    const coord = estadoEmbutido.coordenadas;
    lat = coord.latitude ?? coord.lat ?? "";
    lng = coord.longitude ?? coord.lng ?? "";
  }

  let enderecoBruto = "";
  if (jsonLd?.address) {
    const endereco = jsonLd.address;
    if (typeof endereco === "string") {
      enderecoBruto = endereco;
    } else {
      enderecoBruto = [
        endereco.streetAddress,
        endereco.addressLocality,
        endereco.addressRegion,
        endereco.postalCode,
      ]
        .filter(Boolean)
        .join(", ");
    }
  }

  if (!enderecoBruto) {
    enderecoBruto =
      $('[data-stid="content-hotel-address"], [data-stid*="address"], .address, address')
        .first()
        .text()
        .trim() || "Morada não localizada";
  }

  const partesEndereco = enderecoBruto
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean);
  const partesUnicas = [];
  partesEndereco.forEach((parte) => {
    if (!partesUnicas.some((p) => p.toLowerCase() === parte.toLowerCase())) {
      partesUnicas.push(parte);
    }
  });
  const enderecoFinal = partesUnicas.join(", ") || "Morada não localizada";

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
          !/\b(?:cep|brasil|brazil)\b/i.test(parte) &&
          !/^(?:n[º°.]?\s*)?\d+/i.test(parte)
        );
      }) ||
      partesEndereco[1] ||
      "Não informado";
  }

  const coordenadas = lat && lng ? `${lat}, ${lng}` : "GPS não disponível";

  const nomeLower = nomeOficial.toLowerCase();
  const tipoHotel = nomeLower.includes("pousada")
    ? "Pousada"
    : nomeLower.includes("resort")
      ? "Resort"
      : "Hotel";

  const descricaoHotel =
    jsonLd?.description ||
    $('[data-stid="property-description"], .property-description').first().text().trim() ||
    $('meta[name="description"]').attr("content") ||
    "";

  const textoComodidades = $('[data-stid*="amenities"], [data-stid*="facility"]').text();
  // O widget de comodidades nem sempre está presente no HTML inicial (pode
  // depender de carregamento tardio); o texto completo da página serve de
  // rede de segurança para não perder a detecção por causa de um seletor
  // desatualizado.
  const textoPagina = $("body").text().replace(/\s+/g, " ");
  const beiraMar = detectarBeiraMar([
    nomeOficial,
    descricaoHotel,
    textoComodidades,
    textoPagina,
  ]);

  let aeroportoFinal = "Não informado";
  const matchAero = textoPagina.match(
    /aeroporto[a-zA-ZÀ-ÿ\s\-\/]{0,80}\d+(?:[.,]\d+)?\s*km/i,
  );
  const distanciaTexto = matchAero ? extrairDistanciaKm(matchAero[0]) : null;
  if (distanciaTexto) {
    aeroportoFinal = formatarDistanciaAeroporto(distanciaTexto, FONTE);
  } else if (lat && lng && lat !== "GPS não disponível") {
    const distCalculada = calcularDistanciaCarroKm(
      parseFloat(lat),
      parseFloat(lng),
      latitudeReferencia,
      longitudeReferencia,
    );
    aeroportoFinal = formatarDistanciaAeroporto(
      `${distCalculada} km`,
      "calculado pela equação",
    );
  }

  const regimeFinal = identificarRegime(
    [descricaoHotel, textoComodidades, textoPagina].join(" "),
  );

  let plusCode = "Não localizado";
  if (lat && lng && lat !== "GPS não disponível") {
    try {
      plusCode = olc.encode(parseFloat(lat), parseFloat(lng));
    } catch (e) {}
  }

  const notaEstruturada = extrairNotaEstruturada(jsonLd);
  const notaBruta =
    notaEstruturada !== null
      ? notaEstruturada
      : $(
          '[data-stid="content-hotel-reviewsummary"], [data-stid*="review-score"], [data-stid*="reviewsummary"]',
        )
          .first()
          .text()
          .match(/(?:10|[0-9])[.,][0-9]\b/)?.[0] || null;
  const notaNormalizada = normalizarNota(notaBruta);

  let imagensJsonLd = [];
  if (jsonLd?.image) {
    imagensJsonLd = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
  }
  const jsonGaleriaCompleta = await obterJsonGaleriaCompletaDoEstado(page);
  const imagensCombinadas = finalizarListaImagens([
    ...imagensJsonLd,
    ...extrairUrlsFotosDeTexto(html.replace(/\\\//g, "/")),
    ...(jsonGaleriaCompleta ? extrairUrlsFotosDeTexto(jsonGaleriaCompleta) : []),
  ]);

  return {
    nomeOficial,
    enderecoFinal,
    bairro,
    tipoHotel,
    beiraMar,
    coordenadas,
    plusCode,
    nota: notaNormalizada,
    regime: regimeFinal,
    aeroporto: aeroportoFinal,
    imagens: imagensCombinadas,
  };
}

async function pesquisarExpedia(page, opcoes) {
  try {
    return await executarPesquisaExpedia(page, opcoes);
  } catch (erro) {
    if (
      erro instanceof ErroFonte ||
      erro instanceof ErroEntrada ||
      erro instanceof ErroArmazenamento ||
      erro instanceof ErroProcessamento
    ) {
      throw erro;
    }
    throw new ErroFonte(`Falha ao processar dados da Expedia: ${erro.message}`, {
      fonte: FONTE,
      causa: erro,
    });
  } finally {
    await desativarBloqueioDeMidia(page).catch(() => {});
  }
}

async function executarPesquisaExpedia(page, opcoes) {
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

  await ativarBloqueioDeMidia(page);

  try {
    let urlHotel = entrada;

    if (!ehLink) {
      const candidatos = await pesquisarCardsExpedia(page, entrada);
      const melhorCandidato = escolherMelhorCandidato(
        entrada,
        candidatos,
        (candidato) => candidato.nome,
      );

      if (!melhorCandidato) {
        throw new ErroFonte(
          "Nenhum resultado da Expedia corresponde de forma confiável ao hotel pesquisado.",
          { fonte: FONTE },
        );
      }

      urlHotel = melhorCandidato.link;
    }

    urlHotel = garantirDatasNaUrl(urlHotel);

    try {
      await page.goto(urlHotel, { waitUntil: "domcontentloaded" });
    } catch (erroNavegacao) {
      throw new ErroFonte(
        `Falha ao carregar a página do hotel na Expedia: ${erroNavegacao.message}`,
        { fonte: FONTE },
      );
    }

    await page
      .waitForSelector('[data-stid="content-hotel-title"], h1', { timeout: 15000 })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    if (await detectarDesafioAntibot(page)) {
      throw new ErroFonte(
        "A Expedia pediu uma verificação de segurança (CAPTCHA) e bloqueou o acesso automático no momento. Tente novamente mais tarde.",
        { fonte: FONTE },
      );
    }

    const dados = await extrairDadosHotelExpedia(page, {
      latitudeReferencia,
      longitudeReferencia,
    });

    await desativarBloqueioDeMidia(page);

    const nomeLimpo = criarNomePastaHotel(dados.nomeOficial);
    const pastaHotel = path.resolve(pastaImagensDestino, nomeLimpo);

    let caminhosImagensLocais = [];
    let altTexts = {};
    const avaliacaoFiltroDownload = avaliarFiltroDownload({
      filtro: filtroDownload,
      endereco: dados.enderecoFinal,
      coordenadas: dados.coordenadas,
      latitudeReferencia,
      longitudeReferencia,
    });
    const deveBaixarImagens = baixarImagens && avaliacaoFiltroDownload.aprovado;

    if (deveBaixarImagens) {
      await ativarBloqueioDeMidia(page);
      caminhosImagensLocais = await baixarImagensParaPasta({
        page,
        imagensUrls: dados.imagens,
        pastaHotel,
      });
      await desativarBloqueioDeMidia(page);

      const resultadoLeitura = lerPastaImagensRecursivo(pastaHotel, pastaImagensBase);
      caminhosImagensLocais = resultadoLeitura.imagens;
      altTexts = resultadoLeitura.altTexts;
    } else {
      caminhosImagensLocais = dados.imagens;
      if (baixarImagens && !avaliacaoFiltroDownload.aprovado) {
        console.log(`[-] Download ignorado pelo filtro: ${avaliacaoFiltroDownload.motivo}.`);
      }
    }

    return {
      sucesso: true,
      nome: dados.nomeOficial,
      endereco: dados.enderecoFinal,
      bairro: dados.bairro,
      tipoHotel: dados.tipoHotel,
      beiraMar: dados.beiraMar,
      coordenadas: dados.coordenadas,
      plusCode: dados.plusCode,
      nota: dados.nota,
      regime: dados.regime,
      aeroporto: dados.aeroporto,
      imagens: caminhosImagensLocais,
      altTexts,
      baixouLocal: deveBaixarImagens,
      filtroDownload: baixarImagens ? avaliacaoFiltroDownload : undefined,
      fonte: FONTE,
      urlFonte: urlHotel,
    };
  } finally {
    await desativarBloqueioDeMidia(page);
  }
}

module.exports = {
  pesquisarExpedia,
  ehLinkExpedia,
  montarUrlBuscaExpedia,
};
