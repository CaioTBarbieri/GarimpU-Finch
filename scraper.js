const { exec } = require('child_process'); // Mantido para a organização por IA
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Algoritmo offline para geração de Plus Codes
const { OpenLocationCode } = require('open-location-code');
const olc = new OpenLocationCode();

puppeteer.use(StealthPlugin());
const app = express();
const PORT = 3000;
const PASTA_IMAGENS = 'C:\\Users\\User\\Downloads\\Trabaio\\Software\\DOWNLOADS HOTEIS';

app.use(express.json());
app.use('/img', express.static(PASTA_IMAGENS));

// ==========================================
// FUNÇÃO MATEMÁTICA CORRIGIDA (Com Fator de Sinuosidade)
// ==========================================
function calcularDistanciaCarroKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distanciaLinhaReta = R * c;
    const fatorCorrecaoRota = 1.23;
    const distanciaCarro = distanciaLinhaReta * fatorCorrecaoRota;

    return distanciaCarro.toFixed(1);
}

const LAT_RECIFE = -14.8150;
const LNG_RECIFE = -39.0333;

async function rasparDadosHotel(
    nomeHotel,
    baixarImagens = true,
    latitudeReferencia = LAT_RECIFE,
    longitudeReferencia = LNG_RECIFE
) {
    const entrada = nomeHotel.trim();

    latitudeReferencia = Number(latitudeReferencia);
    longitudeReferencia = Number(longitudeReferencia);

    if (
        !Number.isFinite(latitudeReferencia) ||
        latitudeReferencia < -90 ||
        latitudeReferencia > 90
    ) {
        throw new Error('Latitude de referência inválida.');
    }

    if (
        !Number.isFinite(longitudeReferencia) ||
        longitudeReferencia < -180 ||
        longitudeReferencia > 180
    ) {
        throw new Error('Longitude de referência inválida.');
    }
    const ehLink = /^https?:\/\//i.test(entrada);
    const ehLinkBooking = /^https?:\/\/([a-z]{2,3}\.)?booking\.com\//i.test(entrada);
    let linkBookingNormalizado = entrada;

    if (ehLinkBooking) {
        const url = new URL(entrada);
        if (/\/hotel\/[^/]+\/[^/.]+\/?$/i.test(url.pathname)) {
            url.pathname = url.pathname.replace(/\/$/, '') + '.pt-br.html';
        }
        linkBookingNormalizado = url.toString();
    }

    const termoFormatado = encodeURIComponent(entrada);
    const urlBusca = `https://www.booking.com/searchresults.pt-br.html?ss=${termoFormatado}`;

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--disable-web-security', '--no-sandbox']
    });
    const page = await browser.newPage();

    // Aumentando o timeout da página para aguentar o download em massa
    page.setDefaultNavigationTimeout(120000);

    try {
        if (ehLink && !ehLinkBooking) {
            throw new Error('Cole um link válido da Booking.com.');
        }

        const bloqueadorDeMidia = (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
            else req.continue();
        };

        await page.setRequestInterception(true);
        page.on('request', bloqueadorDeMidia);

        // ==========================================
        // FASE 1: PESQUISA BÁSICA
        // ==========================================
        let dadosPesquisa;

        if (ehLinkBooking) {
            dadosPesquisa = {
                link: linkBookingNormalizado,
                nome: '',
                enderecoBasico: '',
                nota: 'Sem nota',
                regimePesquisa: 'Não informado'
            };
        } else {
            await page.goto(urlBusca, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('[data-testid="property-card"]', { timeout: 15000 });

            dadosPesquisa = await page.evaluate(() => {
                const card = document.querySelector('[data-testid="property-card"]');
                if (!card) return null;

                const link = card.querySelector('a').href;
                const nome = card.querySelector('[data-testid="title"]')?.innerText?.trim() || '';
                const enderecoBasico = card.querySelector('[data-testid="address"]')?.innerText?.trim() || '';

                const elementoNota = card.querySelector('[data-testid="review-score"]');
                let nota = 'Sem nota';
                if (elementoNota) {
                    const match = elementoNota.innerText.match(/(?:10|[0-9])[.,][0-9]\b/);
                    nota = match ? match[0] : 'Sem nota';
                }

                let regimeExtraido = 'Não informado';
                const textoCard = card.innerText.toLowerCase();

                if (textoCard.includes('all inclusive') || textoCard.includes('tudo incluído')) regimeExtraido = 'All Inclusive';
                else if (textoCard.includes('pensão completa') || textoCard.includes('full board')) regimeExtraido = 'Pensão completa';
                else if (textoCard.includes('meia pensão') || textoCard.includes('half board')) regimeExtraido = 'Meia pensão';
                else if (textoCard.includes('café da manhã incluído') || textoCard.includes('pequeno-almoço incluído')) regimeExtraido = 'Café da manhã incluído';
                else if (textoCard.includes('café da manhã')) regimeExtraido = 'Café da manhã disponível';

                return { link, nome, enderecoBasico, nota, regimePesquisa: regimeExtraido };
            });
        }

        if (!dadosPesquisa) throw new Error("Hotel não encontrado na pesquisa.");

        // ==========================================
        // FASE 2: PÁGINA INTERNA E GPS
        // ==========================================
        await page.goto(dadosPesquisa.link, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="title"], h1, h2.pp-header__title', { timeout: 15000 }).catch(() => { });
        await new Promise(r => setTimeout(r, 2000));
        const html = await page.content();

        page.off('request', bloqueadorDeMidia);
        await page.setRequestInterception(false);

        const $ = cheerio.load(html);
        let nomeOficial = dadosPesquisa.nome
            || $('[data-testid="title"], h1, h2.pp-header__title').first().text().replace(/\s+/g, ' ').trim()
            || entrada;

        let enderecoInterno = $('[data-testid="address"], .hp_address_subtitle').first().text().replace(/\s+/g, ' ').trim();
        let lat = '';
        let lng = '';

        if (dadosPesquisa.nota === 'Sem nota') {
            const textoNota = $('[data-testid="review-score-right-component"], [data-testid="review-score-component"]').first().text();
            const matchNota = textoNota.match(/(?:10|[0-9])[.,][0-9]\b/);
            if (matchNota) dadosPesquisa.nota = matchNota[0].replace('.', ',');
        }

        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const jsonData = JSON.parse($(el).html());
                const obj = Array.isArray(jsonData) ? jsonData.find(j => j.address || j.geo) : jsonData;
                if (obj) {
                    if (!dadosPesquisa.nome && obj.name) nomeOficial = obj.name;
                    if (dadosPesquisa.nota === 'Sem nota' && obj.aggregateRating?.ratingValue) {
                        const valorNota = Number(String(obj.aggregateRating.ratingValue).replace(',', '.'));
                        if (valorNota >= 0 && valorNota <= 10) {
                            dadosPesquisa.nota = valorNota.toFixed(1).replace('.', ',');
                        }
                    }
                    if (obj.address) {
                        const rua = obj.address.streetAddress || '';
                        const cidade = obj.address.addressLocality || '';
                        const estado = obj.address.addressRegion || '';
                        const enderecoCompleto = [rua, cidade, estado].filter(Boolean).join(', ');
                        if (enderecoCompleto) enderecoInterno = enderecoCompleto;
                    }
                    if (obj.geo && obj.geo.latitude && obj.geo.longitude) {
                        lat = obj.geo.latitude;
                        lng = obj.geo.longitude;
                    }
                }
            } catch (e) { }
        });

        if (dadosPesquisa.nota !== 'Sem nota') {
            const notaNumerica = Number(String(dadosPesquisa.nota).replace(',', '.'));
            if (!Number.isFinite(notaNumerica) || notaNumerica < 0 || notaNumerica > 10) {
                dadosPesquisa.nota = 'Sem nota';
            }
        }

        if (ehLinkBooking && nomeOficial === entrada) {
            throw new Error('A Booking não carregou os dados desse link. Confira se ele abre a página do hotel e tente novamente.');
        }

        if (!lat || !lng) {
            const mapLink = $('a[data-atlas-latlng]').attr('data-atlas-latlng');
            if (mapLink) {
                const parts = mapLink.split(',');
                if (parts.length === 2) {
                    lat = parts[0].trim();
                    lng = parts[1].trim();
                }
            }
        }

        let enderecoBruto = enderecoInterno || dadosPesquisa.enderecoBasico || 'Morada não localizada';
        let partesEnd = enderecoBruto.split(',').map(p => p.trim());
        let partesUnicas = [];
        partesEnd.forEach(p => {
            if (p && !partesUnicas.some(pu => pu.toLowerCase() === p.toLowerCase())) {
                partesUnicas.push(p);
            }
        });
        let enderecoFinal = partesUnicas.join(', ');
        let coordenadas = (lat && lng) ? `${lat}, ${lng}` : 'GPS não disponível';

        const nomeLower = nomeOficial.toLowerCase();
        const tipoHotel = nomeLower.includes('pousada')
            ? 'Pousada'
            : nomeLower.includes('resort')
                ? 'Resort'
                : 'Hotel';

        const partesEndereco = enderecoBruto.split(',').map(parte => parte.trim()).filter(Boolean);
        const indiceCep = partesEndereco.findIndex(parte => /\bcep\b|\b\d{5}-?\d{3}\b/i.test(parte));
        let bairro = indiceCep > 0 ? partesEndereco[indiceCep - 1] : '';

        if (!bairro) {
            bairro = [...partesEndereco].reverse().find((parte, indiceReverso) => {
                const indiceOriginal = partesEndereco.length - 1 - indiceReverso;
                return indiceOriginal > 0
                    && !/\b(?:cep|brasil|brazil|pernambuco|primeiro andar|andar|apto|apartamento)\b/i.test(parte)
                    && !/^\s*(?:pe|br)\s*$/i.test(parte)
                    && !/^(?:n[º°.]?\s*)?\d+/i.test(parte);
            }) || partesEndereco[1] || 'Não informado';
        }

        const textoPagina = $('body').text().replace(/\s+/g, ' ');

        // Busca somente a descrição específica do hotel. Evita capturar textos de
        // filtros, menus e sugestões de outros hotéis espalhados pelo <body>.
        let descricaoHotel = $('[data-testid="property-description"], #property_description_content, .hp-description').first().text().replace(/\s+/g, ' ').trim();

        const procurarDescricaoNoJson = (valor, chavePai = '') => {
            if (!valor || typeof valor !== 'object') return '';

            if (
                typeof valor.description === 'string' &&
                (valor.__typename === 'HotelTranslation' || chavePai === 'HotelTranslation')
            ) {
                return valor.description;
            }

            for (const [chave, filho] of Object.entries(valor)) {
                const encontrada = procurarDescricaoNoJson(filho, chave);
                if (encontrada) return encontrada;
            }
            return '';
        };

        if (!descricaoHotel) {
            $('script').each((_, el) => {
                if (descricaoHotel) return false;
                const conteudo = $(el).html()?.trim();
                if (!conteudo || (!conteudo.startsWith('{') && !conteudo.startsWith('['))) return;

                try {
                    descricaoHotel = procurarDescricaoNoJson(JSON.parse(conteudo));
                } catch (e) { }
            });
        }

        const textoComodidades = $('[data-testid="property-most-popular-facilities-wrapper"], [data-testid="facility-group-container"]').text();
        const textoBeiraMar = [nomeOficial, descricaoHotel, textoComodidades].join(' ').toLowerCase();
        const beiraMar = /\bbeira[- ]mar\b|à beira[- ]mar|de frente para o mar|praia privativa|beachfront|private beach/i.test(textoBeiraMar)
            ? 'Sim'
            : 'Não';

        // --- AEROPORTO ---
        let aeroportoFinal = 'Não informado';

        const extrairDistanciaKm = (texto) => {
            const match = texto.match(/(\d+(?:[.,]\d+)?)\s*(km|m)\b/i);
            if (!match) return null;

            const distancia = Number(match[1].replace(',', '.'));
            const distanciaKm = match[2].toLowerCase() === 'm' ? distancia / 1000 : distancia;
            const valorFormatado = Number.isInteger(distanciaKm)
                ? String(distanciaKm)
                : distanciaKm.toFixed(1).replace('.', ',');

            return `${valorFormatado} km`;
        };

        $('li, div.bui-list__item, div[data-testid="location-poi"]').each((_, el) => {
            if (aeroportoFinal !== 'Não informado') return;
            const txt = $(el).text().replace(/\s+/g, ' ').trim();
            if (txt.toLowerCase().includes('aeroporto') && txt.length < 150) {
                const distancia = extrairDistanciaKm(txt);
                if (distancia) aeroportoFinal = `${distancia} (Booking)`;
            }
        });

        if (aeroportoFinal === 'Não informado') {
            const matchAero = textoPagina.match(/aeroporto[a-zA-ZÀ-ÿ\s\-\/]{0,80}\d+(?:[.,]\d+)?\s*km/i);
            const distancia = matchAero ? extrairDistanciaKm(matchAero[0]) : null;
            if (distancia) aeroportoFinal = `${distancia} (Booking)`;
        }

        if (aeroportoFinal === 'Não informado' && lat && lng && lat !== 'GPS não disponível') {
            const distCalculada = calcularDistanciaCarroKm(
                parseFloat(lat),
                parseFloat(lng),
                latitudeReferencia,
                longitudeReferencia
            );
            aeroportoFinal = `${distCalculada} km (calculado pela equação)`;
        }

        // --- REGIME ---
        const identificarRegime = (texto) => {
            const textoLower = texto.toLowerCase();
            if (textoLower.includes('all inclusive') || textoLower.includes('tudo incluído')) return 'All Inclusive';
            if (textoLower.includes('pensão completa') || textoLower.includes('full board')) return 'Pensão completa';
            if (textoLower.includes('meia pensão') || textoLower.includes('meia-pensão') || textoLower.includes('half board')) return 'Meia pensão';

            const mencionaCafe = textoLower.includes('café da manhã') || textoLower.includes('pequeno-almoço');
            const cafeIncluso = /(?:café da manhã|pequeno-almoço)[^.]{0,100}(?:incluíd[oa]|grátis|gratuito|cortesia)/i.test(texto);
            if (mencionaCafe && cafeIncluso) return 'Café da manhã incluído';
            if (mencionaCafe) return 'Café da manhã disponível';
            return 'Não informado';
        };

        const regimeDaDescricao = identificarRegime(descricaoHotel);
        const regimeFinal = regimeDaDescricao !== 'Não informado'
            ? regimeDaDescricao
            : dadosPesquisa.regimePesquisa;

        // --- FASE 3: PLUS CODE ---
        let plusCode = 'Não localizado';
        if (lat && lng && lat !== 'GPS não disponível') {
            try {
                plusCode = olc.encode(parseFloat(lat), parseFloat(lng));
            } catch (error) { }
        }

        // ==========================================
        // FASE 4: IMAGENS (SEM LIMITE + SUPORTE À IA)
        // ==========================================
        const codigoFonteLimpo = html.replace(/\\\//g, '/');
        const regexFotos = /https:\/\/cf\.bstatic\.com[a-zA-Z0-9_\-\/]*?\/images\/hotel[a-zA-Z0-9_\-\/]*?\.jpg[a-zA-Z0-9_\-\/\?\.\=\&\;]*/gi;
        const matches = codigoFonteLimpo.match(regexFotos) || [];

        const urlsImagens = new Map();
        matches.forEach(url => {
            const urlSemQuery = url.split('?')[0];
            const idImagem = urlSemQuery.split('/').pop();
            let prioridade = url.includes('max1280') ? 4 : (url.includes('max1024') ? 3 : (url.includes('max500') ? 2 : 1));

            if (!urlsImagens.has(idImagem) || prioridade > urlsImagens.get(idImagem).prioridade) {
                urlsImagens.set(idImagem, { url, prioridade });
            }
        });

        const imagensArray = Array.from(urlsImagens.values())
            .filter(item => item.prioridade >= 3)
            .map(item => item.url);

        const nomeLimpo = nomeOficial.replace(/[^a-zA-Z0-9]/g, '_');
        const pastaBase = PASTA_IMAGENS;
        const pastaHotel = path.resolve(pastaBase, nomeLimpo);

        const caminhosImagensLocais = [];

        if (baixarImagens) {
            // Rotina pesada do Viny
            if (!fs.existsSync(pastaHotel)) fs.mkdirSync(pastaHotel, { recursive: true });

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
                            reader.onloadend = () => resolve({ sucesso: true, base64: reader.result.split(',')[1] });
                            reader.readAsDataURL(blob);
                        });
                    } catch { return { sucesso: false }; }
                }, url);

                if (resultado.sucesso) {
                    fs.writeFileSync(caminhoCompleto, Buffer.from(resultado.base64, 'base64'));
                    caminhosImagensLocais.push(`/img/${encodeURIComponent(nomeLimpo)}/${nomeArquivo}.jpg`);
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
            console.log(`\n[+] Download concluído. Imagens salvas na pasta do hotel.`);

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
                            lerPastaRecursivo(caminhoAbsoluto)
                        );
                        continue;
                    }

                    if (/\.(?:jpg|jpeg|png|webp)$/i.test(arquivo)) {
                        const caminhoRelativo = path
                            .relative(PASTA_IMAGENS, caminhoAbsoluto)
                            .split(path.sep)
                            .map(encodeURIComponent)
                            .join('/');

                        imagensEncontradas.push(`/img/${caminhoRelativo}`);
                        continue;
                    }

                    if (arquivo.toLowerCase() === 'alt_texts.json') {
                        try {
                            const conteudoAltTexts = JSON.parse(
                                fs.readFileSync(caminhoAbsoluto, 'utf8')
                            );

                            if (conteudoAltTexts && typeof conteudoAltTexts === 'object') {
                                altTexts = { ...altTexts, ...conteudoAltTexts };
                            }
                        } catch (erroAltTexts) {
                            console.warn(
                                `[-] Não foi possível ler ${caminhoAbsoluto}: ${erroAltTexts.message}`
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
            baixouLocal: baixarImagens
        };

    } catch (error) {
        if (browser) await browser.close();
        return { sucesso: false, erro: error.message };
    }
}

// Rota para rodar a IA em todos os hotéis da pasta raiz
app.post('/api/organizar-tudo', (req, res) => {
    // Timeout zerado: O servidor aguardará infinitamente
    req.setTimeout(0);
    res.setTimeout(0);

    console.log(`\n[+] Iniciando IA de Lote para TODOS os hotéis...`);

    const scriptPython = path.resolve(__dirname, 'organizar_hoteis.py');

    // CORREÇÃO: maxBuffer aumentado para 50MB para suportar horas de processamento sem crashar
    exec(`python "${scriptPython}"`, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`[-] Erro no processamento em lote: ${error.message}`);
            return res.status(500).json({ erro: error.message });
        }
        console.log(`[+] Processamento em Lote Concluído!`);
        res.json({ sucesso: true, log: stdout });
    });
});

app.post('/api/buscar', async (req, res) => {
    req.setTimeout(900000);
    res.setTimeout(900000);

    const {
        nome,
        baixarImagens,
        latitudeReferencia,
        longitudeReferencia
    } = req.body;

    if (!nome) {
        return res.status(400).json({
            erro: 'O nome do hotel é obrigatório'
        });
    }

    const deveBaixar =
        baixarImagens !== undefined ? baixarImagens : true;

    const latitudeFinal =
        latitudeReferencia !== undefined &&
            latitudeReferencia !== ''
            ? Number(latitudeReferencia)
            : LAT_RECIFE;

    const longitudeFinal =
        longitudeReferencia !== undefined &&
            longitudeReferencia !== ''
            ? Number(longitudeReferencia)
            : LNG_RECIFE;

    if (
        !Number.isFinite(latitudeFinal) ||
        latitudeFinal < -90 ||
        latitudeFinal > 90
    ) {
        return res.status(400).json({
            erro: 'Digite uma latitude válida, entre -90 e 90.'
        });
    }

    if (
        !Number.isFinite(longitudeFinal) ||
        longitudeFinal < -180 ||
        longitudeFinal > 180
    ) {
        return res.status(400).json({
            erro: 'Digite uma longitude válida, entre -180 e 180.'
        });
    }

    const resultado = await rasparDadosHotel(
        nome,
        deveBaixar,
        latitudeFinal,
        longitudeFinal
    );

    if (resultado.sucesso) {
        res.json(resultado);
    } else {
        res.status(500).json({ erro: resultado.erro });
    }
});

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>GarimpU Finch</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>
    </head>
    <body class="bg-slate-900 text-slate-100 min-h-screen font-sans">
        <div class="max-w-6xl mx-auto px-4 py-12">
            
            <div class="text-center mb-12">
                <h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
                    GarimpU Finch
                </h1>
                <p class="text-slate-400">Pesquise hotéis, extraia coordenadas, regimes alimentares e exporte dados CSV.</p>
            </div>

            <div class="bg-slate-800 p-6 rounded-2xl shadow-xl max-w-2xl mx-auto mb-12 border border-slate-700">
                <div class="flex gap-4">
                    <input type="text" id="hotelInput" placeholder="Digite o nome ou cole o link da Booking..." 
                        class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500 transition-all"
                        onkeypress="if(event.key === 'Enter') iniciarBusca()">
                    <button id="btnBuscar" onclick="iniciarBusca()" 
                        class="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-900/30 transition-all flex items-center gap-2">
                        Pesquisar
                    </button>
                </div>

                                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    <div>
                        <label
                            for="latitudeReferenciaInput"
                            class="text-sm text-slate-300 block mb-2"
                        >
                            Latitude de referência
                        </label>

                        <input
                            id="latitudeReferenciaInput"
                            type="number"
                            step="any"
                            min="-90"
                            max="90"
                            value="${LAT_RECIFE}"
                            placeholder="Ex.: -14.8150"
                            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500 transition-all"
                        >
                    </div>

                    <div>
                        <label
                            for="longitudeReferenciaInput"
                            class="text-sm text-slate-300 block mb-2"
                        >
                            Longitude de referência
                        </label>

                        <input
                            id="longitudeReferenciaInput"
                            type="number"
                            step="any"
                            min="-180"
                            max="180"
                            value="${LNG_RECIFE}"
                            placeholder="Ex.: -39.0333"
                            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500 transition-all"
                        >
                    </div>
                </div>

                <p class="text-xs text-slate-500 mt-2">
                    Coordenadas usadas como destino no cálculo da distância do aeroporto.
                </p>

                <div class="mt-6 pt-6 border-t border-slate-700/50 text-center">

                <div class="mt-6 pt-6 border-t border-slate-700/50 text-center">
                    <button id="btnOrganizarTudo" onclick="organizarLoteIA()"
                        class="bg-purple-600 hover:bg-purple-500 px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-purple-900/30 transition-all flex items-center justify-center gap-2 mx-auto text-sm border border-purple-500/50">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        Organizar Todos os Hotéis com IA
                    </button>
                    <p class="text-xs text-slate-400 mt-2">Use após baixar os hotéis que deseja organizar.</p>
                </div>

                <label class="flex items-center gap-3 mt-4 text-sm text-slate-300 cursor-pointer w-max">
                    <input id="baixarImagensInput" type="checkbox" checked
                        class="w-4 h-4 accent-emerald-500 cursor-pointer">
                    Baixar imagens automaticamente
                </label>
                <div class="mt-4">
                    <label class="text-sm text-slate-300 block mb-2">CSV completo exportado do Wix</label>
                    <input id="csvWixInput" type="file" accept=".csv,text/csv" onchange="carregarCsvWix(this.files[0])"
                        class="block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-indigo-500 cursor-pointer">
                    <p id="csvWixStatus" class="text-xs text-slate-500 mt-2">Opcional: carregue para preservar todas as colunas na atualização.</p>
                </div>
            </div>

            <div id="loader" class="hidden text-center py-12 animate-pulse">
                <div class="inline-block w-12 h-12 border-4 border-t-blue-500 border-slate-700 rounded-full animate-spin mb-4"></div>
                <p id="loaderTexto" class="text-lg text-slate-300 font-medium">Extraindo dados e baixando toda a galeria em HD...</p>
                <p class="text-sm text-slate-500 mt-2">Aviso: Esse processo pode levar de 1 a 3 minutos dependendo da quantidade de fotos do hotel.</p>
            </div>

            <div id="resultadoContainer" class="hidden space-y-8 animate-fade-in">
                
                <div class="bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div class="space-y-4">
                        <div>
                            <h2 id="resNome" class="text-3xl font-bold text-white"></h2>
                            <p id="resEndereco" class="text-slate-400 flex items-center gap-2 text-sm md:text-base mt-1"></p>
                        </div>
                        
                        <div class="flex flex-wrap gap-2">
                            <span class="bg-slate-900 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 shadow-inner text-slate-300">
                                <span class="text-indigo-400 font-semibold">ID Wix</span>
                                <input id="resIdWix" type="text" placeholder="Cole o ID aqui"
                                    oninput="dadosAtuais.idWix = this.value.trim()"
                                    class="bg-slate-900 text-slate-200 outline-none min-w-[220px] placeholder:text-slate-600">
                            </span>

                            <span class="bg-slate-900 border border-purple-500/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 shadow-inner text-slate-300">
                                <span class="text-purple-400 font-semibold">Tipo</span>
                                <select id="resTipoHotel" onchange="dadosAtuais.tipoHotel = this.value"
                                    class="bg-slate-900 text-slate-300 outline-none cursor-pointer">
                                    <option>Hotel</option>
                                    <option>Pousada</option>
                                    <option>Resort</option>
                                </select>
                            </span>

                            <span class="bg-slate-900 border border-teal-500/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 shadow-inner text-slate-300">
                                <span class="text-teal-400 font-semibold">Bairro</span>
                                <input id="resBairro" type="text" placeholder="Bairro"
                                    oninput="dadosAtuais.bairro = this.value.trim()"
                                    class="bg-slate-900 text-slate-200 outline-none min-w-[180px] placeholder:text-slate-600">
                            </span>

                            <span class="bg-slate-900 border border-cyan-500/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 shadow-inner text-slate-300">
                                <span class="text-cyan-400 font-semibold">Beira-mar</span>
                                <select id="resBeiraMar" onchange="dadosAtuais.beiraMar = this.value"
                                    class="bg-slate-900 text-slate-300 outline-none cursor-pointer">
                                    <option>Sim</option>
                                    <option>Não</option>
                                </select>
                            </span>

                            <span class="bg-slate-900 border border-sky-500/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 w-max shadow-inner text-slate-300">
                                <svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span id="resAeroporto"></span>
                            </span>

                            <span class="bg-slate-900 border border-orange-500/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 w-max shadow-inner text-slate-300">
                                <svg class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"></path></svg>
                                <select id="resRegime" onchange="dadosAtuais.regime = this.value"
                                    class="bg-slate-900 text-slate-300 outline-none cursor-pointer">
                                    <option>Não informado</option>
                                    <option>Café da manhã incluído</option>
                                    <option>Café da manhã disponível</option>
                                    <option>Meia pensão</option>
                                    <option>Pensão completa</option>
                                    <option>All Inclusive</option>
                                    <option>Sem regime alimentar incluso na diária</option>
                                </select>
                            </span>
                            
                            <span id="tagPlusCodeBase" class="bg-slate-900 border px-3 py-1.5 rounded-lg text-sm font-mono flex items-center gap-2 w-max shadow-inner">
                                <svg id="tagIcon" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path></svg>
                                <span id="resPlusCode"></span>
                            </span>
                        </div>
                    </div>

                    <div class="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-4 rounded-2xl text-center shadow-lg min-w-[120px]">
                        <span class="text-xs font-semibold uppercase tracking-wider text-emerald-100 block opacity-75">Avaliação</span>
                        <span id="resNota" class="text-4xl font-black text-white block mt-1"></span>
                    </div>
                </div>

                <div>
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                        <h3 class="text-xl font-bold text-slate-300 flex items-center gap-2">
                            <span>Galeria Completa em Alta Resolução</span>
                            <span id="badgeContador" class="bg-slate-700 text-xs px-2.5 py-1 rounded-full text-slate-300"></span>
                        </h3>
                        
                        <div class="flex flex-wrap gap-3">
                            <button id="btnAdicionarCSV" onclick="adicionarAoCsv()" class="hidden bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2">
                                + Adicionar ao CSV
                            </button>

                            <button id="btnBaixarCSV" onclick="baixarDadosCSV()" class="hidden bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                Exportar Dados (.CSV)
                            </button>

                            <span id="contadorCsv" class="hidden bg-slate-700 text-slate-200 px-3 py-2.5 rounded-xl text-sm">0 hotéis adicionados</span>

                            <button id="btnBaixarTodas" onclick="baixarGaleriaComoZip()" class="hidden bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                Transferir Todas as Fotos (.ZIP)
                            </button>
                        </div>
                    </div>

                    <div id="galeriaGrid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"></div>
                </div>

            </div>
        </div>

        <script>
            let dadosAtuais = null;
            let csvWix = null;
            let itensAcumulados = [];

            function normalizarNome(texto) {
                return String(texto || '')
                    .normalize('NFD')
                    .replace(/[\\u0300-\\u036f]/g, '')
                    .replace(/[^a-zA-Z0-9]/g, '')
                    .toLowerCase();
            }

            function carregarCsvWix(arquivo) {
                const status = document.getElementById('csvWixStatus');
                if (!arquivo) {
                    csvWix = null;
                    status.innerText = 'Nenhum CSV carregado.';
                    return;
                }

                Papa.parse(arquivo, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (resultado) => {
                        const campos = resultado.meta.fields || [];
                        if (!campos.includes('ID') || !campos.includes('Nome_Hotel')) {
                            csvWix = null;
                            status.innerText = 'Arquivo inválido: faltam as colunas ID ou Nome_Hotel.';
                            status.className = 'text-xs text-red-400 mt-2';
                            return;
                        }

                        csvWix = resultado;
                        itensAcumulados = [];
                        atualizarContadorCsv();
                        status.innerText = 'CSV carregado: ' + resultado.data.length + ' hotéis e ' + campos.length + ' colunas.';
                        status.className = 'text-xs text-emerald-400 mt-2';
                    },
                    error: (erro) => {
                        csvWix = null;
                        status.innerText = 'Erro ao ler o CSV: ' + erro.message;
                        status.className = 'text-xs text-red-400 mt-2';
                    }
                });
            }

            function atualizarContadorCsv() {
                const contador = document.getElementById('contadorCsv');
                const botaoExportar = document.getElementById('btnBaixarCSV');
                contador.innerText = itensAcumulados.length + (itensAcumulados.length === 1 ? ' hotel adicionado' : ' hotéis adicionados');
                contador.classList.toggle('hidden', itensAcumulados.length === 0);
                botaoExportar.classList.toggle('hidden', itensAcumulados.length === 0);
            }

            function adicionarAoCsv() {
                if (!dadosAtuais) return;

                const distanciaAeroporto = String(dadosAtuais.aeroporto).match(/\\d+(?:[.,]\\d+)?\\s*km/i)?.[0] || dadosAtuais.aeroporto;
                const tinhaIdInformado = Boolean(dadosAtuais.idWix);
                if (!dadosAtuais.idWix) {
                    dadosAtuais.idWix = crypto.randomUUID();
                    document.getElementById('resIdWix').value = dadosAtuais.idWix;
                }

                const registro = {
                    ID: dadosAtuais.idWix,
                    Nome_Hotel: dadosAtuais.nome,
                    'Localização_Bairro': dadosAtuais.bairro,
                    'Tipo_Hotel': dadosAtuais.tipoHotel,
                    'Beira mar': dadosAtuais.beiraMar,
                    'Nota de Avaliação': dadosAtuais.nota,
                    'Endereço da Rua': dadosAtuais.endereco,
                    'Plus Code': dadosAtuais.plusCode,
                    'Distância Aeroporto': distanciaAeroporto,
                    'Regime de Alimentação': dadosAtuais.regime
                };

                if (csvWix) {
                    let campoBeiraMar = csvWix.meta.fields.find(campo => normalizarNome(campo) === 'beiramar');
                    if (!campoBeiraMar) {
                        campoBeiraMar = 'Beira mar';
                        csvWix.meta.fields.push(campoBeiraMar);
                        csvWix.data.forEach(item => { item[campoBeiraMar] = ''; });
                    }

                    let linha = csvWix.data.find(item => item.ID === registro.ID);
                    if (!linha) {
                        if (tinhaIdInformado) {
                            alert('O ID informado não existe no CSV. Apague o ID para cadastrar como hotel novo.');
                            return;
                        }

                        linha = Object.fromEntries(csvWix.meta.fields.map(campo => [campo, '']));
                        linha.ID = registro.ID;
                        linha.Nome_Hotel = registro.Nome_Hotel;
                        csvWix.data.push(linha);
                    }

                    Object.assign(linha, {
                        'Localização_Bairro': registro['Localização_Bairro'],
                        'Tipo_Hotel': registro['Tipo_Hotel'],
                        [campoBeiraMar]: registro['Beira mar'],
                        'Nota de Avaliação': registro['Nota de Avaliação'],
                        'Endereço da Rua': registro['Endereço da Rua'],
                        'Plus Code': registro['Plus Code'],
                        'Distância Aeroporto': registro['Distância Aeroporto'],
                        'Regime de Alimentação': registro['Regime de Alimentação']
                    });
                }

                const chave = registro.ID || normalizarNome(registro.Nome_Hotel);
                const indiceExistente = itensAcumulados.findIndex(item => (item.ID || normalizarNome(item.Nome_Hotel)) === chave);
                if (indiceExistente >= 0) itensAcumulados[indiceExistente] = registro;
                else itensAcumulados.push(registro);

                atualizarContadorCsv();
                const botao = document.getElementById('btnAdicionarCSV');
                const textoOriginal = botao.innerText;
                botao.innerText = '✓ Adicionado';
                setTimeout(() => { botao.innerText = textoOriginal; }, 1200);
            }

            function baixarDadosCSV() {
                if (itensAcumulados.length === 0) {
                    alert('Adicione pelo menos um hotel ao CSV antes de baixar.');
                    return;
                }

                let conteudoCSV;
                let nomeArquivo;

                if (csvWix) {
                    const campos = csvWix.meta.fields;
                    const linhasOrdenadas = csvWix.data.map(item =>
                        campos.map(campo => item[campo] ?? '')
                    );

                    conteudoCSV = Papa.unparse({
                        fields: campos,
                        data: linhasOrdenadas
                    }, {
                        newline: '\\r\\n',
                        quotes: true
                    });
                    nomeArquivo = 'Hoteis_texto_atualizado.csv';
                } else {
                    conteudoCSV = Papa.unparse(itensAcumulados, {
                        newline: '\\r\\n',
                        quotes: true
                    });
                    nomeArquivo = 'Hoteis_Dados_Acumulados.csv';
                }

                const blob = new Blob(["\\uFEFF" + conteudoCSV], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", nomeArquivo);
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            async function baixarGaleriaComoZip() {
                const btn = document.getElementById('btnBaixarTodas');
                const imagens = document.querySelectorAll('#galeriaGrid img');
                if (imagens.length === 0) return;

                const textoOriginal = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = \`<div class="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>Aguarde, compactando centenas de imagens...\`;

                const zip = new JSZip();
                const nomeHotel = document.getElementById('resNome').innerText.replace(/[^a-zA-Z0-9]/g, '_');

                try {
                    for (let i = 0; i < imagens.length; i++) {
                        const src = imagens[i].src;
                        const response = await fetch(src);
                        const blob = await response.blob();
                        zip.file(\`foto_HD_\${i + 1}.jpg\`, blob);
                    }

                    const conteudoZip = await zip.generateAsync({ type: 'blob' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(conteudoZip);
                    link.download = \`\${nomeHotel}_galeria_HD_COMPLETA.zip\`;
                    link.click();
                } catch (err) {
                    alert('Erro ao agrupar ficheiros: ' + err.message);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = textoOriginal;
                }
            }

            async function organizarLoteIA() {
                const confirmacao = confirm("Isto irá ativar a IA para TODOS os hotéis salvos na sua pasta. O processo pode levar vários minutos (ou horas, dependendo do volume). Acompanhe o progresso no terminal preto. Deseja continuar?");
                if (!confirmacao) return;

                const btn = document.getElementById('btnOrganizarTudo');
                const loader = document.getElementById('loader');
                const resultadoContainer = document.getElementById('resultadoContainer');
                
                resultadoContainer.classList.add('hidden');
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                
                // Usando aspas simples e concatenação para não quebrar o res.send()
                loader.innerHTML = '<div class="inline-block w-12 h-12 border-4 border-t-purple-500 border-slate-700 rounded-full animate-spin mb-4"></div>' +
                    '<p class="text-xl text-purple-400 font-bold mb-2">Processamento de IA em Lote Iniciado!</p>' +
                    '<p class="text-slate-300">O Florence-2 e o CLIP estão analisando toda a sua pasta de downloads.</p>' +
                    '<p class="text-sm text-slate-500 mt-2 font-mono bg-slate-950 inline-block px-4 py-2 rounded-lg border border-slate-800">Abra a janela do seu terminal (CMD/PowerShell) para ver as fotos sendo processadas em tempo real.</p>';
                loader.classList.remove('hidden');

                try {
                    const response = await fetch('/api/organizar-tudo', { method: 'POST' });
                    const dados = await response.json();
                    
                    if (!response.ok) throw new Error(dados.erro || 'Falha ao organizar em lote');
                    
                    alert("A IA concluiu a organização e renomeação de todos os hotéis!");
                } catch (err) {
                    alert('Erro na execução da IA: ' + err.message);
                } finally {
                    loader.classList.add('hidden');
                    btn.disabled = false;
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }
            
           async function iniciarBusca() {
    const nomeInput =
        document.getElementById('hotelInput').value.trim();

    const baixarImagens =
        document.getElementById('baixarImagensInput').checked;

    const latitudeReferencia = Number(
        document.getElementById('latitudeReferenciaInput').value
    );

    const longitudeReferencia = Number(
        document.getElementById('longitudeReferenciaInput').value
    );

    if (!nomeInput) {
        return alert(
            'Digite o nome do hotel ou cole um link da Booking.'
        );
    }

    if (
        !Number.isFinite(latitudeReferencia) ||
        latitudeReferencia < -90 ||
        latitudeReferencia > 90
    ) {
        return alert(
            'Digite uma latitude válida, entre -90 e 90.'
        );
    }

    if (
        !Number.isFinite(longitudeReferencia) ||
        longitudeReferencia < -180 ||
        longitudeReferencia > 180
    ) {
        return alert(
            'Digite uma longitude válida, entre -180 e 180.'
        );
    }

                const loader = document.getElementById('loader');
                const resultadoContainer = document.getElementById('resultadoContainer');
                const btnBuscar = document.getElementById('btnBuscar');
                const btnBaixarTodas = document.getElementById('btnBaixarTodas');
                const btnBaixarCSV = document.getElementById('btnBaixarCSV');
                const btnAdicionarCSV = document.getElementById('btnAdicionarCSV');
                loader.innerHTML = baixarImagens
                    ? '<div class="inline-block w-12 h-12 border-4 border-t-blue-500 border-slate-700 rounded-full animate-spin mb-4"></div>' +
                      '<p class="text-lg text-slate-300 font-medium">Extraindo dados e baixando toda a galeria em HD...</p>' +
                      '<p class="text-sm text-slate-500 mt-2">Esse processo pode levar alguns minutos, dependendo da quantidade de fotos.</p>'
                    : '<div class="inline-block w-12 h-12 border-4 border-t-blue-500 border-slate-700 rounded-full animate-spin mb-4"></div>' +
                      '<p class="text-lg text-slate-300 font-medium">Extraindo somente os dados do hotel...</p>';
                
                loader.classList.remove('hidden');
                resultadoContainer.classList.add('hidden');
                btnBaixarTodas.classList.add('hidden');
                btnAdicionarCSV.classList.add('hidden');
                if (itensAcumulados.length === 0) btnBaixarCSV.classList.add('hidden');
                btnBuscar.disabled = true;
                btnBuscar.classList.add('opacity-50');

                try {
                    const response = await fetch('/api/buscar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                        nome: nomeInput,
                        baixarImagens,
                        latitudeReferencia,
                        longitudeReferencia
                        })
                    });

                    const dados = await response.json();
                    if (!response.ok) throw new Error(dados.erro || 'Falha no pedido');

                    dadosAtuais = dados;
                    dadosAtuais.idWix = '';

                    document.getElementById('resNome').innerText = dados.nome;
                    if (csvWix) {
                        const nomeNormalizado = normalizarNome(dados.nome);
                        const itemWix = csvWix.data.find(item => normalizarNome(item.Nome_Hotel) === nomeNormalizado);
                        if (itemWix) dadosAtuais.idWix = itemWix.ID;
                    }
                    document.getElementById('resIdWix').value = dadosAtuais.idWix;
                    document.getElementById('resTipoHotel').value = dados.tipoHotel;
                    document.getElementById('resBairro').value = dados.bairro;
                    document.getElementById('resBeiraMar').value = dados.beiraMar;
                    document.getElementById('resEndereco').innerText = "🏢 " + dados.endereco;
                    document.getElementById('resNota').innerText = dados.nota;
                    document.getElementById('resAeroporto').innerText = dados.aeroporto;
                    const seletorRegime = document.getElementById('resRegime');
                    seletorRegime.value = Array.from(seletorRegime.options).some(opcao => opcao.value === dados.regime)
                        ? dados.regime
                        : 'Não informado';
                    dadosAtuais.regime = seletorRegime.value;
                    document.getElementById('badgeContador').innerText = dados.imagens.length + " ficheiros salvos";

                    const tagPlusCodeBase = document.getElementById('tagPlusCodeBase');
                    const tagIcon = document.getElementById('tagIcon');
                    const textPlusCode = document.getElementById('resPlusCode');

                    if (dados.plusCode && dados.plusCode !== 'Não localizado') {
                        textPlusCode.innerText = dados.plusCode;
                        tagPlusCodeBase.className = "bg-slate-900 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg text-sm font-mono flex items-center gap-2 w-max shadow-inner";
                        tagIcon.className = "w-4 h-4 text-blue-500";
                    } else {
                        textPlusCode.innerText = "Plus Code indisponível";
                        tagPlusCodeBase.className = "bg-slate-900 text-slate-500 border border-slate-700 px-3 py-1.5 rounded-lg text-sm font-mono flex items-center gap-2 w-max shadow-inner";
                        tagIcon.className = "w-4 h-4 text-slate-500";
                    }

                    const grid = document.getElementById('galeriaGrid');
                    grid.innerHTML = '';
                    
                    dados.imagens.forEach((src, index) => {
                        const nomeArquivo = decodeURIComponent(src.split('/').pop()) || ('hotel_foto_' + (index + 1) + '.jpg');
                        const legendaPt = dados.altTexts && dados.altTexts[nomeArquivo]
                            ? dados.altTexts[nomeArquivo]
                            : 'Imagem do hotel';

                        const div = document.createElement('div');
                        div.className = "group overflow-hidden rounded-2xl bg-slate-950 border border-slate-800 shadow-md aspect-video relative";
                        
                        div.innerHTML = \`
                            <img src="\${src}" alt="\${legendaPt}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 shadow-inner">
                            <div class="absolute bottom-0 left-0 w-full bg-slate-900/80 backdrop-blur-sm p-2 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                                <p class="text-[10px] leading-tight text-slate-300 truncate" title="\${legendaPt}">\${legendaPt}</p>
                            </div>
                            <a href="\${src}" target="_blank" download="\${nomeArquivo}" title="Transferir: \${nomeArquivo}"
                               class="absolute top-3 right-3 bg-blue-600 hover:bg-blue-400 text-white p-2 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform hover:scale-110">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            </a>
                        \`;
                        grid.appendChild(div);
                    });

                    resultadoContainer.classList.remove('hidden');
                    btnAdicionarCSV.classList.remove('hidden');
                    atualizarContadorCsv();
                    if (dados.imagens.length > 0 && dados.baixouLocal) btnBaixarTodas.classList.remove('hidden');

                } catch (err) {
                    alert('Erro na extração: ' + err.message);
                } finally {
                    loader.classList.add('hidden');
                    btnBuscar.disabled = false;
                    btnBuscar.classList.remove('opacity-50');
                }
            }
        </script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => {
    console.log(`\n[+] Servidor da Interface Gráfica iniciado com sucesso!`);
    console.log(`[+] Aceda no seu navegador: http://localhost:${PORT}\n`);
});