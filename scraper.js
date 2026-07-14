const { exec } = require('child_process'); // <-- Mantido para a IA
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
// Altere este caminho se precisar:
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

const LAT_RECIFE = -2.9066;
const LNG_RECIFE = -40.3580;

async function rasparDadosHotel(nomeHotel, baixarImagensLocal) {
    const termoFormatado = encodeURIComponent(nomeHotel);
    const urlBusca = `https://www.booking.com/searchresults.pt-br.html?ss=${termoFormatado}`;

    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--disable-web-security', '--no-sandbox'] 
    });
    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(120000); 

    try {
        const bloqueadorDeMidia = (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
            else req.continue();
        };

        await page.setRequestInterception(true);
        page.on('request', bloqueadorDeMidia);

        // ==========================================
        // FASE 1: PESQUISA BÁSICA
        // ==========================================
        await page.goto(urlBusca, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 15000 });
        
        const dadosPesquisa = await page.evaluate(() => {
            const card = document.querySelector('[data-testid="property-card"]');
            if (!card) return null;
            
            const link = card.querySelector('a').href;
            const nome = card.querySelector('[data-testid="title"]')?.innerText?.trim() || '';
            const enderecoBasico = card.querySelector('[data-testid="address"]')?.innerText?.trim() || '';
            
            const elementoNota = card.querySelector('[data-testid="review-score"]');
            let nota = 'Sem nota';
            if (elementoNota) {
                const match = elementoNota.innerText.match(/[0-9]+,[0-9]+/);
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

        if (!dadosPesquisa) throw new Error("Hotel não encontrado na pesquisa.");

        // ==========================================
        // FASE 2: PÁGINA INTERNA E GPS
        // ==========================================
        await page.goto(dadosPesquisa.link, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 2000));
        const html = await page.content();

        page.off('request', bloqueadorDeMidia);
        await page.setRequestInterception(false);

        const $ = cheerio.load(html);
        const nomeOficial = dadosPesquisa.nome || nomeHotel;
        
        let enderecoInterno = '';
        let lat = '';
        let lng = '';

        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const jsonData = JSON.parse($(el).html());
                const obj = Array.isArray(jsonData) ? jsonData.find(j => j.address || j.geo) : jsonData;
                if (obj) {
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

        const textoPagina = $('body').text().replace(/\s+/g, ' ');

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
            const distCalculada = calcularDistanciaCarroKm(parseFloat(lat), parseFloat(lng), LAT_RECIFE, LNG_RECIFE);
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
            } catch (error) {}
        }

        // ==========================================
        // FASE 4: IMAGENS (COM OPÇÃO DE NÃO BAIXAR)
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
        
        const caminhosImagens = [];

        if (baixarImagensLocal) {
            // Rotina pesada: Salvar fisicamente na máquina
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
                    caminhosImagens.push(`/img/${encodeURIComponent(nomeLimpo)}/${nomeArquivo}.jpg`);
                }
            }
        } else {
            // Rotina rápida: Apenas retorna os links originais do Booking
            caminhosImagens.push(...imagensArray);
        }

        await browser.close();
        
        // ========================================================
        // INTEGRAÇÃO COM O ORGANIZADOR EM PYTHON
        // ========================================================
        if (baixarImagensLocal && caminhosImagens.length > 0) {
            console.log(`\n[+] Download concluído. Iniciando a organização por IA...`);
            
            await new Promise((resolve) => {
                const scriptPython = path.resolve(__dirname, 'organizar_hoteis.py');
                
                exec(`python "${scriptPython}" --pasta "${pastaHotel}"`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`[-] Erro na organização por IA: ${error.message}`);
                    } else {
                        console.log(`[+] IA de Organização executada com sucesso!`);
                        console.log(stdout); 
                    }
                    resolve(); 
                });
            });
        } else {
            console.log(`\n[!] Download ignorado ou sem imagens. Organização por IA pulada.`);
        }
        // ========================================================

        return {
            sucesso: true,
            nome: nomeOficial,
            endereco: enderecoFinal,
            coordenadas: coordenadas,
            plusCode: plusCode,
            nota: dadosPesquisa.nota,
            regime: regimeFinal,
            aeroporto: aeroportoFinal,
            imagens: caminhosImagens,
            baixouLocal: baixarImagensLocal
        };

    } catch (error) {
        if (browser) await browser.close();
        return { sucesso: false, erro: error.message };
    }
}

app.post('/api/buscar', async (req, res) => {
    req.setTimeout(300000);
    res.setTimeout(300000);
    
    // Recebe a nova variável "baixarImagens"
    const { nome, baixarImagens } = req.body;
    if (!nome) return res.status(400).json({ erro: 'O nome do hotel é obrigatório' });

    const deveBaixar = baixarImagens !== undefined ? baixarImagens : true;

    const resultado = await rasparDadosHotel(nome, deveBaixar);
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
                    <input type="text" id="hotelInput" placeholder="Digite o nome do hotel ou resort..." 
                        class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500 transition-all"
                        onkeypress="if(event.key === 'Enter') iniciarBusca()">
                    <button id="btnBuscar" onclick="iniciarBusca()" 
                        class="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-900/30 transition-all flex items-center gap-2">
                        Pesquisar
                    </button>
                </div>

                <div class="mt-4 flex items-center gap-3 px-2">
                    <input type="checkbox" id="checkBaixarImagens" checked 
                        class="w-5 h-5 rounded bg-slate-900 border-slate-600 text-blue-500 focus:ring-blue-500 cursor-pointer">
                    <label for="checkBaixarImagens" class="text-sm text-slate-300 cursor-pointer select-none">
                        Baixar imagens localmente e executar a IA Organizadora <span class="text-slate-500">(Desative para pesquisa rápida apenas textual)</span>
                    </label>
                </div>
            </div>

            <div id="loader" class="hidden text-center py-12 animate-pulse">
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
                            <span>Galeria de Imagens</span>
                            <span id="badgeContador" class="bg-slate-700 text-xs px-2.5 py-1 rounded-full text-slate-300"></span>
                        </h3>
                        
                        <div class="flex flex-wrap gap-3">
                            <button id="btnBaixarCSV" onclick="baixarDadosCSV()" class="hidden bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                Exportar Dados (.CSV)
                            </button>

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

            function baixarDadosCSV() {
                if (!dadosAtuais) return;

                const cabecalho = "ID,Nota de Avaliação,Endereço da Rua,Plus Code,Distância Aeroporto,Regime de Alimentação\\n";
                const prepararCampo = (str) => '"' + String(str).replace(/"/g, '""') + '"';
                const distanciaAeroporto = String(dadosAtuais.aeroporto).match(/\\d+(?:[.,]\\d+)?\\s*km/i)?.[0] || dadosAtuais.aeroporto;

                const linha = [
                    prepararCampo(dadosAtuais.idWix || ''), // <-- ID Wix retornado aqui
                    prepararCampo(dadosAtuais.nota),
                    prepararCampo(dadosAtuais.endereco),
                    prepararCampo(dadosAtuais.plusCode),
                    prepararCampo(distanciaAeroporto),
                    prepararCampo(dadosAtuais.regime)
                ].join(',');

                const conteudoCSV = cabecalho + linha;
                const blob = new Blob(["\\uFEFF" + conteudoCSV], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", dadosAtuais.nome.replace(/[^a-zA-Z0-9]/g, '_') + "_Dados.csv");
                
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
                btn.innerHTML = \`<div class="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>Aguarde, compactando...\`;

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
                    link.download = \`\${nomeHotel}_galeria_HD.zip\`;
                    link.click();
                } catch (err) {
                    alert('Erro ao agrupar ficheiros: ' + err.message);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = textoOriginal;
                }
            }

            async function iniciarBusca() {
                const nomeInput = document.getElementById('hotelInput').value.trim();
                if (!nomeInput) return alert('Por favor, introduza o nome de um hotel.');

                const baixarImagensCheckbox = document.getElementById('checkBaixarImagens').checked;

                const loader = document.getElementById('loader');
                const resultadoContainer = document.getElementById('resultadoContainer');
                const btnBuscar = document.getElementById('btnBuscar');
                const btnBaixarTodas = document.getElementById('btnBaixarTodas');
                const btnBaixarCSV = document.getElementById('btnBaixarCSV');
                
                // Configura mensagem baseada na escolha do checkbox
                if (baixarImagensCheckbox) {
                    loader.innerHTML = \`
                        <div class="inline-block w-12 h-12 border-4 border-t-blue-500 border-slate-700 rounded-full animate-spin mb-4"></div>
                        <p class="text-lg text-slate-300 font-medium">Extraindo dados, salvando ficheiros e executando IA de Organização...</p>
                        <p class="text-sm text-slate-500 mt-2">Aviso: Esse processo é pesado e pode levar de 1 a 3 minutos.</p>
                    \`;
                } else {
                    loader.innerHTML = \`
                        <div class="inline-block w-12 h-12 border-4 border-t-blue-500 border-slate-700 rounded-full animate-spin mb-4"></div>
                        <p class="text-lg text-slate-300 font-medium">Extraindo dados rapidamente (Download e IA ignorados)...</p>
                    \`;
                }

                loader.classList.remove('hidden');
                resultadoContainer.classList.add('hidden');
                btnBaixarTodas.classList.add('hidden');
                btnBaixarCSV.classList.add('hidden');
                btnBuscar.disabled = true;
                btnBuscar.classList.add('opacity-50');

                try {
                    const response = await fetch('/api/buscar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            nome: nomeInput,
                            baixarImagens: baixarImagensCheckbox
                        })
                    });

                    const dados = await response.json();
                    if (!response.ok) throw new Error(dados.erro || 'Falha no pedido');

                    dadosAtuais = dados;
                    dadosAtuais.idWix = ''; // <-- Zera o ID da memória ao buscar novo hotel

                    document.getElementById('resNome').innerText = dados.nome;
                    document.getElementById('resIdWix').value = ''; // <-- Limpa o input no HTML
                    document.getElementById('resEndereco').innerText = "🏢 " + dados.endereco;
                    document.getElementById('resNota').innerText = dados.nota;
                    document.getElementById('resAeroporto').innerText = dados.aeroporto;
                    
                    const seletorRegime = document.getElementById('resRegime');
                    seletorRegime.value = Array.from(seletorRegime.options).some(opcao => opcao.value === dados.regime)
                        ? dados.regime
                        : 'Não informado';
                    dadosAtuais.regime = seletorRegime.value;
                    
                    document.getElementById('badgeContador').innerText = dados.imagens.length + " ficheiros encontrados";

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
                        const div = document.createElement('div');
                        div.className = "group overflow-hidden rounded-2xl bg-slate-950 border border-slate-800 shadow-md aspect-video relative";
                        
                        div.innerHTML = \`
                            <img src="\${src}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 shadow-inner">
                            <a href="\${src}" target="_blank" download="hotel_foto_\${index + 1}.jpg" title="Abrir / Transferir Imagem"
                               class="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-400 text-white p-2.5 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform hover:scale-110">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            </a>
                        \`;
                        grid.appendChild(div);
                    });

                    resultadoContainer.classList.remove('hidden');
                    btnBaixarCSV.classList.remove('hidden');
                    
                    // Só mostra o botão ZIP se existirem fotos E a pessoa optou por baixar as imagens localmente
                    if (dados.imagens.length > 0 && dados.baixouLocal) {
                        btnBaixarTodas.classList.remove('hidden');
                    }

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