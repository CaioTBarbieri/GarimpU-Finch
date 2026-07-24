            let pesquisaLoteEmAndamento = false;

            function normalizarEntradasLote(valor) {
                const entradas = String(valor || '')
                    .replace(/\u00a0/g, ' ')
                    .split(/\r\n?|\n/)
                    .map(item => item.replace(/[ \t]+/g, ' ').trim())
                    .filter(Boolean);
                return Array.from(new Set(entradas));
            }

            function atualizarContadorEntradaLote() {
                const entradas = normalizarEntradasLote(
                    document.getElementById('listaHoteisInput').value
                );
                const total = entradas.length;
                document.getElementById('contadorEntradaLote').textContent =
                    total + (total === 1 ? ' hotel' : ' hotéis');
            }

            function atualizarMensagemPesquisa(mensagem = '', tipo = 'neutro') {
                const elemento = document.getElementById('mensagemPesquisa');
                elemento.textContent = mensagem;
                elemento.classList.toggle('hidden', !mensagem);
                elemento.classList.toggle('text-red-400', tipo === 'erro');
                elemento.classList.toggle('text-emerald-400', tipo === 'sucesso');
                elemento.classList.toggle(
                    'text-slate-400',
                    tipo !== 'erro' && tipo !== 'sucesso'
                );
            }

            function atualizarModoPesquisaLote() {
                const baixarImagens = document.getElementById(
                    'baixarImagensLoteInput'
                ).checked;
                document.getElementById('textoBtnPesquisarLote').textContent =
                    baixarImagens
                        ? 'Baixar imagens dos hotéis da lista'
                        : 'Pesquisar lista e adicionar ao CSV';
            }

            function obterUfDoEndereco(endereco) {
                const estados = {
                    acre: 'AC',
                    alagoas: 'AL',
                    amapa: 'AP',
                    amazonas: 'AM',
                    bahia: 'BA',
                    ceara: 'CE',
                    'distrito federal': 'DF',
                    'espirito santo': 'ES',
                    goias: 'GO',
                    maranhao: 'MA',
                    'mato grosso': 'MT',
                    'mato grosso do sul': 'MS',
                    'minas gerais': 'MG',
                    para: 'PA',
                    paraiba: 'PB',
                    parana: 'PR',
                    pernambuco: 'PE',
                    piaui: 'PI',
                    'rio de janeiro': 'RJ',
                    'rio grande do norte': 'RN',
                    'rio grande do sul': 'RS',
                    rondonia: 'RO',
                    roraima: 'RR',
                    'santa catarina': 'SC',
                    'sao paulo': 'SP',
                    sergipe: 'SE',
                    tocantins: 'TO',
                };
                const texto = String(endereco || '');
                const sigla = texto.match(
                    /(?:^|[\s,–-])([A-Z]{2})(?=$|[\s,])/u
                );
                if (sigla) return sigla[1];

                const normalizado = texto
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase();
                return Object.entries(estados).find(
                    ([nome]) => normalizado.includes(nome)
                )?.[1] || '';
            }

            function resumirLocalizacaoHotel(bairro, endereco) {
                const textoEndereco = String(endereco || '');
                const uf = obterUfDoEndereco(textoEndereco);
                const pais = /\b(?:brasil|brazil)\b/i.test(textoEndereco)
                    ? 'Brasil'
                    : '';
                let localidade = String(bairro || '').trim();

                if (!localidade || normalizarNome(localidade) === 'naoinformado') {
                    const partes = textoEndereco
                        .split(',')
                        .map(parte => parte.trim())
                        .filter(Boolean)
                        .filter(parte =>
                            !/\bcep\b|\b\d{5}-?\d{3}\b/i.test(parte) &&
                            !/^(?:rua|avenida|av\.?|rodovia|estrada|travessa|alameda)\b/i.test(parte) &&
                            !/^\d+\b/.test(parte) &&
                            !/\b(?:brasil|brazil)\b/i.test(parte)
                        );
                    const indiceEstado = partes.findIndex(parte =>
                        obterUfDoEndereco(parte) === uf && Boolean(uf)
                    );
                    const candidata = indiceEstado > 0
                        ? partes[indiceEstado - 1]
                        : partes.at(-1);
                    localidade = String(candidata || '')
                        .replace(/\s*[–-]\s*[A-Z]{2}\s*$/u, '')
                        .trim();
                }

                const localidadeComUf = [localidade, uf]
                    .filter(Boolean)
                    .join(' - ');
                return [localidadeComUf, pais]
                    .filter(Boolean)
                    .join(', ') || 'Localização não informada';
            }

            function adicionarLocalizacaoAoResultado(elemento, dados) {
                const localizacao = resumirLocalizacaoHotel(
                    dados.bairro,
                    dados.endereco
                );
                elemento.dataset.localizacao = localizacao;
                elemento.tabIndex = 0;
                elemento.title = localizacao;
                elemento.setAttribute(
                    'aria-describedby',
                    'tooltipLocalizacaoLote'
                );
                elemento.setAttribute(
                    'aria-label',
                    elemento.textContent + '. Localização: ' + localizacao
                );

                const mostrarTooltip = () => {
                    const tooltip = document.getElementById(
                        'tooltipLocalizacaoLote'
                    );
                    tooltip.textContent = '📍 ' + localizacao;
                    tooltip.classList.remove('hidden');

                    const alvo = elemento.getBoundingClientRect();
                    const caixa = tooltip.getBoundingClientRect();
                    const margem = 12;
                    const esquerda = Math.min(
                        Math.max(alvo.left, margem),
                        window.innerWidth - caixa.width - margem
                    );
                    const acima = alvo.top - caixa.height - 8;
                    const topo = acima >= margem
                        ? acima
                        : alvo.bottom + 8;
                    tooltip.style.left = esquerda + 'px';
                    tooltip.style.top = topo + 'px';
                };
                const ocultarTooltip = () => {
                    document.getElementById('tooltipLocalizacaoLote')
                        .classList.add('hidden');
                };

                elemento.addEventListener('mouseenter', mostrarTooltip);
                elemento.addEventListener('mouseleave', ocultarTooltip);
                elemento.addEventListener('focus', mostrarTooltip);
                elemento.addEventListener('blur', ocultarTooltip);
            }

            const FILTRO_TODAS_LOCALIZACOES = '__todos_resultados__';
            const FILTRO_SEM_LOCALIZACAO = '__sem_localizacao__';

            function obterLocalizacaoDaLinha(linha) {
                const localizacao = String(
                    linha.dataset.localizacao || ''
                ).trim();
                return localizacao &&
                    localizacao !== 'Localização não informada'
                    ? localizacao
                    : FILTRO_SEM_LOCALIZACAO;
            }

            function filtrarResultadosLote(filtro) {
                const linhas = document.querySelectorAll(
                    '#resultadosPesquisaLote > p'
                );
                linhas.forEach((linha) => {
                    linha.hidden =
                        filtro !== FILTRO_TODAS_LOCALIZACOES &&
                        obterLocalizacaoDaLinha(linha) !== filtro;
                });
            }

            function renderizarResumoLocalizacoesLote() {
                const resumo = document.getElementById(
                    'resumoLocalizacoesLote'
                );
                const linhas = Array.from(document.querySelectorAll(
                    '#resultadosPesquisaLote > p'
                ));
                const contagens = new Map();
                let semLocalizacao = 0;

                linhas.forEach((linha) => {
                    const localizacao = obterLocalizacaoDaLinha(linha);
                    if (localizacao === FILTRO_SEM_LOCALIZACAO) {
                        semLocalizacao += 1;
                        return;
                    }
                    contagens.set(
                        localizacao,
                        (contagens.get(localizacao) || 0) + 1
                    );
                });

                const localizacoes = Array.from(contagens.entries())
                    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
                const totalLocalizados = localizacoes.reduce(
                    (total, [, quantidade]) => total + quantidade,
                    0
                );

                document.getElementById(
                    'contadorLocalizacoesLote'
                ).textContent =
                    totalLocalizados + ' de ' + linhas.length +
                    (linhas.length === 1 ? ' hotel localizado' :
                        ' hotéis localizados') +
                    ' • ' + localizacoes.length +
                    (localizacoes.length === 1 ? ' localidade' :
                        ' localidades');

                const filtro = document.getElementById(
                    'filtroLocalizacaoLote'
                );
                filtro.replaceChildren();

                const todos = document.createElement('option');
                todos.value = FILTRO_TODAS_LOCALIZACOES;
                todos.textContent = 'Todos os resultados (' +
                    linhas.length + ')';
                filtro.appendChild(todos);

                localizacoes.forEach(([localizacao, quantidade]) => {
                    const opcao = document.createElement('option');
                    opcao.value = localizacao;
                    opcao.textContent =
                        localizacao + ' (' + quantidade + ')';
                    filtro.appendChild(opcao);
                });

                if (semLocalizacao > 0) {
                    const sem = document.createElement('option');
                    sem.value = FILTRO_SEM_LOCALIZACAO;
                    sem.textContent =
                        'Sem localização (' + semLocalizacao + ')';
                    filtro.appendChild(sem);
                }

                const lista = document.getElementById(
                    'listaLocalizacoesLote'
                );
                lista.replaceChildren();
                localizacoes.forEach(([localizacao, quantidade]) => {
                    const item = document.createElement('span');
                    item.textContent =
                        localizacao + ': ' + quantidade +
                        (quantidade === 1 ? ' hotel' : ' hotéis');
                    lista.appendChild(item);
                });

                resumo.classList.remove('hidden');
                filtrarResultadosLote(FILTRO_TODAS_LOCALIZACOES);
            }

            async function pesquisarHoteisEmLote() {
                if (pesquisaLoteEmAndamento) return;

                const hoteis = normalizarEntradasLote(
                    document.getElementById('listaHoteisInput').value
                );
                const baixarImagens = document.getElementById(
                    'baixarImagensLoteInput'
                ).checked;

                if (hoteis.length === 0) {
                    alert('Adicione pelo menos um hotel ou link na lista.');
                    return;
                }

                if (!baixarImagens) {
                    try {
                        obterNomesColunasCsv();
                    } catch (erro) {
                        alert(erro.message);
                        return;
                    }
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
                    'listaHoteisInput',
                    'baixarImagensLoteInput',
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

                pesquisaLoteEmAndamento = true;
                btn.disabled = true;
                btnBuscar.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                btnBuscar.classList.add('opacity-50', 'cursor-not-allowed');
                camposBloqueados.forEach(campo => { campo.disabled = true; });
                status.classList.remove('hidden');
                resultados.innerHTML = '';
                document.getElementById('resumoLocalizacoesLote')
                    .classList.add('hidden');
                btnBaixarCsvLote.classList.add('hidden');
                btnBaixarCsvLote.classList.remove('flex');

                let adicionados = 0;
                let baixados = 0;
                let ignorados = 0;
                let erros = 0;

                try {
                    for (let indice = 0; indice < hoteis.length; indice++) {
                        const entrada = hoteis[indice];
                        textoStatus.textContent = baixarImagens
                            ? 'Pesquisando e baixando imagens: ' + entrada
                            : 'Pesquisando: ' + entrada;
                        contador.textContent = indice + ' de ' + hoteis.length;
                        barra.style.width = ((indice / hoteis.length) * 100) + '%';

                        const linhaResultado = document.createElement('p');
                        linhaResultado.className = 'text-slate-400';
                        linhaResultado.textContent = '⏳ ' + entrada;
                        resultados.appendChild(linhaResultado);
                        let dadosLocalizacao = null;

                        try {
                            const controlador = new AbortController();
                            const limiteMs = baixarImagens ? 900000 : 360000;
                            const temporizador = window.setTimeout(
                                () => controlador.abort(),
                                limiteMs
                            );
                            let response;
                            try {
                                response = await fetch('/api/buscar', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    signal: controlador.signal,
                                    body: JSON.stringify({
                                        nome: entrada,
                                        baixarImagens,
                                        latitudeReferencia,
                                        longitudeReferencia
                                    })
                                });
                            } catch (erroRequisicao) {
                                if (erroRequisicao.name === 'AbortError') {
                                    throw new Error(
                                        'Tempo limite excedido nesta pesquisa.'
                                    );
                                }
                                throw erroRequisicao;
                            } finally {
                                window.clearTimeout(temporizador);
                            }
                            const dados = await response.json();
                            if (!response.ok) {
                                throw new Error(dados.erro || 'Falha na pesquisa');
                            }

                            dadosAtuais = dados;
                            dadosAtuais.idWix = '';
                            dadosLocalizacao = dados;
                            if (baixarImagens) {
                                baixados += 1;
                                linhaResultado.className = 'text-emerald-400';
                                linhaResultado.textContent =
                                    '✓ ' + dados.nome + ': imagens baixadas';
                            } else {
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
                            }
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
                        if (dadosLocalizacao) {
                            adicionarLocalizacaoAoResultado(
                                linhaResultado,
                                dadosLocalizacao
                            );
                        }

                        contador.textContent = (indice + 1) + ' de ' + hoteis.length;
                        barra.style.width = (((indice + 1) / hoteis.length) * 100) + '%';
                        resultados.scrollTop = resultados.scrollHeight;
                    }

                    textoStatus.textContent = baixarImagens
                        ? 'Concluído: ' + baixados + ' hotéis com imagens baixadas, ' +
                            erros + ' com erro.'
                        : 'Concluído: ' + adicionados + ' adicionados, ' +
                            ignorados + ' ignorados, ' + erros + ' com erro.';
                    renderizarResumoLocalizacoesLote();
                    if (!baixarImagens && adicionados > 0) {
                        btnBaixarCsvLote.classList.remove('hidden');
                        btnBaixarCsvLote.classList.add('flex');
                    }
                    if (baixarImagens) {
                        await carregarBibliotecaFotos({ silencioso: true });
                    }
                } finally {
                    pesquisaLoteEmAndamento = false;
                    btn.disabled = false;
                    btnBuscar.disabled = false;
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');
                    btnBuscar.classList.remove('opacity-50', 'cursor-not-allowed');
                    camposBloqueados.forEach(campo => { campo.disabled = false; });
                }
            }

            if (typeof module !== 'undefined' && module.exports) {
                module.exports = { normalizarEntradasLote };
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
        atualizarMensagemPesquisa(
            'Digite o nome do hotel ou cole um link da Booking.',
            'erro'
        );
        document.getElementById('hotelInput').focus();
        return;
    }

    if (
        !Number.isFinite(latitudeReferencia) ||
        latitudeReferencia < -90 ||
        latitudeReferencia > 90
    ) {
        atualizarMensagemPesquisa(
            'Digite uma latitude válida, entre -90 e 90.',
            'erro'
        );
        document.getElementById('latitudeReferenciaInput').focus();
        return;
    }

    if (
        !Number.isFinite(longitudeReferencia) ||
        longitudeReferencia < -180 ||
        longitudeReferencia > 180
    ) {
        atualizarMensagemPesquisa(
            'Digite uma longitude válida, entre -180 e 180.',
            'erro'
        );
        document.getElementById('longitudeReferenciaInput').focus();
        return;
    }

                const loader = document.getElementById('loader');
                const resultadoContainer = document.getElementById('resultadoContainer');
                const btnBuscar = document.getElementById('btnBuscar');
                const btnBaixarTodas = document.getElementById('btnBaixarTodas');
                const btnBaixarCSV = document.getElementById('btnBaixarCSV');
                const btnAdicionarCSV = document.getElementById('btnAdicionarCSV');
                document.getElementById('loaderTexto').textContent = baixarImagens
                    ? 'Extraindo dados e baixando toda a galeria em HD...'
                    : 'Extraindo somente os dados do hotel...';
                document.getElementById('loaderAjuda').textContent = baixarImagens
                    ? 'Esse processo pode levar alguns minutos, dependendo da quantidade de fotos.'
                    : 'A consulta será concluída assim que os dados estiverem disponíveis.';
                
                atualizarMensagemPesquisa();
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
                        tagPlusCodeBase.dataset.available = 'true';
                        tagIcon.className = "h-4 w-4 text-blue-400";
                    } else {
                        textPlusCode.innerText = "Plus Code indisponível";
                        tagPlusCodeBase.dataset.available = 'false';
                        tagIcon.className = "h-4 w-4 text-slate-500";
                    }

                    renderizarGaleriaResultado(
                        dados.imagens,
                        dados.altTexts
                    );

                    document.getElementById('galeriaVazia').classList.toggle(
                        'hidden',
                        dados.imagens.length > 0
                    );
                    resultadoContainer.classList.remove('hidden');
                    btnAdicionarCSV.classList.remove('hidden');
                    atualizarContadorCsv();
                    if (dados.imagens.length > 0 && dados.baixouLocal) btnBaixarTodas.classList.remove('hidden');
                    if (dados.baixouLocal) {
                        carregarBibliotecaFotos({ silencioso: true });
                    }
                    atualizarMensagemPesquisa('Consulta concluída com sucesso.', 'sucesso');

                } catch (err) {
                    atualizarMensagemPesquisa(
                        'Erro na extração: ' + err.message,
                        'erro'
                    );
                } finally {
                    loader.classList.add('hidden');
                    btnBuscar.disabled = false;
                    btnBuscar.classList.remove('opacity-50');
                }
            }
