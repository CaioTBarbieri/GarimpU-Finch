            async function pesquisarHoteisEmLote() {
                const entradas = document.getElementById('listaHoteisInput').value
                    .split(/\r?\n/)
                    .map(item => item.trim())
                    .filter(Boolean);
                const hoteis = Array.from(new Set(entradas));

                if (hoteis.length === 0) {
                    alert('Adicione pelo menos um hotel ou link na lista.');
                    return;
                }

                try {
                    obterNomesColunasCsv();
                } catch (erro) {
                    alert(erro.message);
                    return;
                }

                const latitudeReferencia = Number(
                    document.getElementById('latitudeReferenciaInput').value
                );
                const longitudeReferencia = Number(
                    document.getElementById('longitudeReferenciaInput').value
                );

                if (!Number.isFinite(latitudeReferencia) ||
                    latitudeReferencia < -90 || latitudeReferencia > 90) {
                    alert('Digite uma latitude válida, entre -90 e 90.');
                    return;
                }
                if (!Number.isFinite(longitudeReferencia) ||
                    longitudeReferencia < -180 || longitudeReferencia > 180) {
                    alert('Digite uma longitude válida, entre -180 e 180.');
                    return;
                }

                const btn = document.getElementById('btnPesquisarLote');
                const btnBuscar = document.getElementById('btnBuscar');
                const status = document.getElementById('statusPesquisaLote');
                const textoStatus = document.getElementById('textoStatusPesquisaLote');
                const contador = document.getElementById('contadorPesquisaLote');
                const barra = document.getElementById('barraPesquisaLote');
                const resultados = document.getElementById('resultadosPesquisaLote');
                const btnBaixarCsvLote = document.getElementById('btnBaixarCsvLote');
                const camposBloqueados = [
                    'csvWixInput',
                    'latitudeReferenciaInput',
                    'longitudeReferenciaInput',
                    'colunaRegimeCsv',
                    'colunaNotaCsv',
                    'colunaTipoCsv',
                    'colunaBairrosCsv',
                    'colunaBeiraMarCsv',
                    'colunaEnderecoCsv',
                    'colunaPlusCodeCsv',
                    'colunaDistanciaNumeroCsv',
                    'colunaDistanciaCsv'
                ].map(id => document.getElementById(id));

                btn.disabled = true;
                btnBuscar.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                btnBuscar.classList.add('opacity-50', 'cursor-not-allowed');
                camposBloqueados.forEach(campo => { campo.disabled = true; });
                status.classList.remove('hidden');
                resultados.innerHTML = '';
                btnBaixarCsvLote.classList.add('hidden');
                btnBaixarCsvLote.classList.remove('flex');

                let adicionados = 0;
                let ignorados = 0;
                let erros = 0;

                try {
                    for (let indice = 0; indice < hoteis.length; indice++) {
                        const entrada = hoteis[indice];
                        textoStatus.textContent = 'Pesquisando: ' + entrada;
                        contador.textContent = indice + ' de ' + hoteis.length;
                        barra.style.width = ((indice / hoteis.length) * 100) + '%';

                        const linhaResultado = document.createElement('p');
                        linhaResultado.className = 'text-slate-400';
                        linhaResultado.textContent = '⏳ ' + entrada;
                        resultados.appendChild(linhaResultado);

                        try {
                            const response = await fetch('/api/buscar', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    nome: entrada,
                                    baixarImagens: false,
                                    latitudeReferencia,
                                    longitudeReferencia
                                })
                            });
                            const dados = await response.json();
                            if (!response.ok) {
                                throw new Error(dados.erro || 'Falha na pesquisa');
                            }

                            dadosAtuais = dados;
                            dadosAtuais.idWix = '';
                            if (csvWix) {
                                const localizacaoWix = localizarItemWixPorNome(dados.nome);
                                if (!localizacaoWix.item) {
                                    const motivo = localizacaoWix.motivo === 'repetido'
                                        ? 'mais de uma correspondência encontrada no CSV'
                                        : 'hotel não encontrado no CSV';
                                    throw new Error('Ignorado: ' + motivo + '.');
                                }
                                if (!localizacaoWix.item.ID) {
                                    throw new Error('Ignorado: hotel encontrado sem ID no CSV.');
                                }
                                dadosAtuais.idWix = localizacaoWix.item.ID;
                            }

                            if (!adicionarAoCsv()) {
                                throw new Error('Não foi possível adicionar o hotel ao CSV.');
                            }

                            adicionados += 1;
                            linhaResultado.className = 'text-emerald-400';
                            linhaResultado.textContent = '✓ ' + dados.nome;
                        } catch (erro) {
                            if (erro.message.startsWith('Ignorado:')) {
                                ignorados += 1;
                                linhaResultado.className = 'text-amber-400';
                                linhaResultado.textContent = '↷ ' + entrada + ': ' + erro.message;
                            } else {
                                erros += 1;
                                linhaResultado.className = 'text-red-400';
                                linhaResultado.textContent = '✕ ' + entrada + ': ' + erro.message;
                            }
                        }

                        contador.textContent = (indice + 1) + ' de ' + hoteis.length;
                        barra.style.width = (((indice + 1) / hoteis.length) * 100) + '%';
                        resultados.scrollTop = resultados.scrollHeight;
                    }

                    textoStatus.textContent =
                        'Concluído: ' + adicionados + ' adicionados, ' +
                        ignorados + ' ignorados, ' + erros + ' com erro.';
                    if (adicionados > 0) {
                        btnBaixarCsvLote.classList.remove('hidden');
                        btnBaixarCsvLote.classList.add('flex');
                    }
                } finally {
                    btn.disabled = false;
                    btnBuscar.disabled = false;
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');
                    btnBuscar.classList.remove('opacity-50', 'cursor-not-allowed');
                    camposBloqueados.forEach(campo => { campo.disabled = false; });
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
                        const itemWix = encontrarItemWixPorNome(dados.nome);
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
                        
                        div.innerHTML = `
                            <img src="${src}" alt="${legendaPt}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 shadow-inner">
                            <div class="absolute bottom-0 left-0 w-full bg-slate-900/80 backdrop-blur-sm p-2 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                                <p class="text-[10px] leading-tight text-slate-300 truncate" title="${legendaPt}">${legendaPt}</p>
                            </div>
                            <a href="${src}" target="_blank" download="${nomeArquivo}" title="Transferir: ${nomeArquivo}"
                               class="absolute top-3 right-3 bg-blue-600 hover:bg-blue-400 text-white p-2 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform hover:scale-110">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            </a>
                        `;
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
