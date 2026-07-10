const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { extrairRegime, extrairDistanciaAeroporto } = require('./extracao_melhorada');

// Algoritmo offline para geração de Plus Codes a partir do GPS
const { OpenLocationCode } = require('open-location-code');
const olc = new OpenLocationCode();

puppeteer.use(StealthPlugin());
const app = express();
const PORT = 3000;

app.use(express.json());
app.use('/img', express.static(path.join(__dirname, 'img')));

async function rasparDadosHotel(nomeHotel) {
    const termoFormatado = encodeURIComponent(nomeHotel);
    const urlBusca = `https://www.booking.com/searchresults.pt-br.html?ss=${termoFormatado}`;

    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--disable-web-security', '--no-sandbox'] 
    });
    const page = await browser.newPage();

    try {
        const bloqueadorDeMidia = (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        };

        await page.setRequestInterception(true);
        page.on('request', bloqueadorDeMidia);

        // ==========================================
        // FASE 1: BOOKING PESQUISA BÁSICA E REGIME
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
            
            return { link, nome, enderecoBasico, nota };
        });
            // EXTRAÇÃO DE REGIME DE ALIMENTAÇÃO (Meal Plan)
        

        if (!dadosPesquisa) throw new Error("Hotel não encontrado na pesquisa.");

        // ==========================================
        // FASE 2: PÁGINA INTERNA (GPS E AEROPORTO)
        // ==========================================
        await page.goto(dadosPesquisa.link, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 2000));
        const html = await page.content();


        page.off('request', bloqueadorDeMidia);
        await page.setRequestInterception(false);

        const $ = cheerio.load(html);
        const regime = extrairRegime($, html);
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

        if (!lat || !lng) {
            const latMatch = html.match(/b_map_center_latitude\s*=\s*([-0-9.]+)/);
            const lngMatch = html.match(/b_map_center_longitude\s*=\s*([-0-9.]+)/);
            if (latMatch && lngMatch) {
                lat = latMatch[1];
                lng = lngMatch[1];
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

        // EXTRAÇÃO DA DISTÂNCIA DO AEROPORTO
        const aeroportoFinal = extrairDistanciaAeroporto($);

        // ==========================================
        // FASE 3: CONVERSÃO MATEMÁTICA PARA PLUS CODE
        // ==========================================
        let plusCode = 'Não localizado';
        if (lat && lng && lat !== 'GPS não disponível') {
            try {
                plusCode = olc.encode(parseFloat(lat), parseFloat(lng));
            } catch (error) {}
        }

        // ==========================================
        // EXTRAÇÃO DE IMAGENS
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
            .map(item => item.url)
            .slice(0, 30);

        const nomeLimpo = nomeOficial.replace(/[^a-zA-Z0-9]/g, '_');
        const pastaBase = path.resolve(__dirname, 'img');
        const pastaHotel = path.resolve(pastaBase, nomeLimpo);
        if (!fs.existsSync(pastaBase)) fs.mkdirSync(pastaBase);
        if (!fs.existsSync(pastaHotel)) fs.mkdirSync(pastaHotel);

        const caminhosImagensLocais = [];

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
                caminhosImagensLocais.push(`/img/${nomeLimpo}/${nomeArquivo}.jpg`);
            }
        }

        await browser.close();
        
        return {
            sucesso: true,
            nome: nomeOficial,
            endereco: enderecoFinal,
            coordenadas: coordenadas,
            plusCode: plusCode,
            nota: dadosPesquisa.nota,
            regime: regime,
            aeroporto: aeroportoFinal,
            imagens: caminhosImagensLocais
        };
    } catch (error) {
        if (browser) await browser.close();
        return { sucesso: false, erro: error.message };
    }
}

app.post('/api/buscar', async (req, res) => {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ erro: 'O nome do hotel é obrigatório' });

    const resultado = await rasparDadosHotel(nome);
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
        <title>Hotel Media Scraper</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    </head>
    <body class="bg-slate-900 text-slate-100 min-h-screen font-sans">
        <div class="max-w-6xl mx-auto px-4 py-12">
            
            <div class="text-center mb-12">
                <h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
                    Booking Data & Media Extractor
                </h1>
                <p class="text-slate-400">Pesquise hotéis, extraia coordenadas geográficas, regimes alimentares e exporte dados estruturados.</p>
            </div>

            <div class="bg-slate-800 p-6 rounded-2xl shadow-xl max-w-2xl mx-auto mb-12 border border-slate-700">
                <div class="flex gap-4">
                    <input type="text" id="hotelInput" placeholder="Introduza o nome do hotel ou resort..." 
                        class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500 transition-all"
                        onkeypress="if(event.key === 'Enter') iniciarBusca()">
                    <button id="btnBuscar" onclick="iniciarBusca()" 
                        class="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-900/30 transition-all flex items-center gap-2">
                        Pesquisar
                    </button>
                </div>
            </div>

            <div id="loader" class="hidden text-center py-12 animate-pulse">
                <div class="inline-block w-12 h-12 border-4 border-t-blue-500 border-slate-700 rounded-full animate-spin mb-4"></div>
                <p class="text-lg text-slate-300 font-medium">Lidando com firewalls e processando imagens em segundo plano...</p>
            </div>

            <div id="resultadoContainer" class="hidden space-y-8 animate-fade-in">
                
                <div class="bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div class="space-y-4">
                        <div>
                            <h2 id="resNome" class="text-3xl font-bold text-white"></h2>
                            <p id="resEndereco" class="text-slate-400 flex items-center gap-2 text-sm md:text-base mt-1"></p>
                        </div>
                        
                        <div class="flex flex-wrap gap-2">
                            <!-- TAG AEROPORTO -->
                            <span class="bg-slate-900 border border-sky-500/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 w-max shadow-inner text-slate-300">
                                <svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span id="resAeroporto"></span>
                            </span>

                            <!-- TAG REGIME -->
                            <span class="bg-slate-900 border border-orange-500/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 w-max shadow-inner text-slate-300">
                                <svg class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"></path></svg>
                                <span id="resRegime"></span>
                            </span>
                            
                            <!-- TAG PLUS CODE -->
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
                            <span>Galeria em Alta Resolução</span>
                            <span id="badgeContador" class="bg-slate-700 text-xs px-2.5 py-1 rounded-full text-slate-300"></span>
                        </h3>
                        
                        <div class="flex flex-wrap gap-3">
                            <button id="btnBaixarCSV" onclick="baixarDadosCSV()" class="hidden bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                Exportar Dados (.CSV)
                            </button>

                            <button id="btnBaixarTodas" onclick="baixarGaleriaComoZip()" class="hidden bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                Transferir Fotos (.ZIP)
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

                // CABEÇALHO ATUALIZADO COM AS 5 COLUNAS ESPECÍFICAS
                const cabecalho = "Nota de Avaliação,Endereço da Rua,Plus Code,Distância Aeroporto,Regime de Alimentação\\n";
                
                const prepararCampo = (str) => '"' + String(str).replace(/"/g, '""') + '"';

                const linha = [
                    prepararCampo(dadosAtuais.nota),
                    prepararCampo(dadosAtuais.endereco),
                    prepararCampo(dadosAtuais.plusCode),
                    prepararCampo(dadosAtuais.aeroporto),
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
                btn.innerHTML = \`<div class="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>Criando ZIP...\`;

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

                const loader = document.getElementById('loader');
                const resultadoContainer = document.getElementById('resultadoContainer');
                const btnBuscar = document.getElementById('btnBuscar');
                const btnBaixarTodas = document.getElementById('btnBaixarTodas');
                const btnBaixarCSV = document.getElementById('btnBaixarCSV');
                
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
                        body: JSON.stringify({ nome: nomeInput })
                    });

                    const dados = await response.json();
                    if (!response.ok) throw new Error(dados.erro || 'Falha no pedido');

                    dadosAtuais = dados;

                    // Alimenta a Interface Gráfica
                    document.getElementById('resNome').innerText = dados.nome;
                    document.getElementById('resEndereco').innerText = "🏢 " + dados.endereco;
                    document.getElementById('resNota').innerText = dados.nota;
                    document.getElementById('resAeroporto').innerText = dados.aeroporto;
                    document.getElementById('resRegime').innerText = dados.regime;
                    document.getElementById('badgeContador').innerText = dados.imagens.length + " ficheiros";

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
                            <a href="\${src}" download="hotel_foto_\${index + 1}.jpg" title="Transferir Imagem"
                               class="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-400 text-white p-2.5 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform hover:scale-110">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            </a>
                        \`;
                        grid.appendChild(div);
                    });

                    resultadoContainer.classList.remove('hidden');
                    
                    btnBaixarCSV.classList.remove('hidden');
                    if (dados.imagens.length > 0) btnBaixarTodas.classList.remove('hidden');

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