            let pesquisaLoteEmAndamento = false;
            const idsPorLinhaLote = new Map();
            let textoProblemasLote = '';
            let rotuloProblemasLote = '';

            function aguardarMs(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }

            // Disparar uma pesquisa atrás da outra sem pausa é o padrão que
            // mais chama atenção da proteção antibot da Booking/Expedia
            // (CAPTCHA). Um intervalo variável entre hotéis imita melhor um
            // uso manual e reduz a chance de bloqueio no meio de um lote.
            function calcularIntervaloEntreBuscasLote() {
                const minimoMs = 4000;
                const variacaoMs = 4000;
                return minimoMs + Math.floor(Math.random() * variacaoMs);
            }

            function dividirLinhasBrutasLote(valor) {
                return String(valor || '')
                    .replace(/\u00a0/g, ' ')
                    .split(/\r\n?|\n/);
            }

            function combinarListaEIdsLote(valor) {
                return dividirLinhasBrutasLote(valor)
                    .map((linhaBruta, indice) => {
                        const numeroLinha = indice + 1;
                        const linha = linhaBruta.replace(/[ \t]+/g, ' ').trim();
                        if (!linha || linha.includes('|')) return linhaBruta;

                        const idAssociado = (idsPorLinhaLote.get(numeroLinha) || '').trim();
                        return idAssociado ? idAssociado + ' | ' + linha : linhaBruta;
                    })
                    .join('\n');
            }

            function atualizarPainelIdsLote() {
                const container = document.getElementById('idsLoteContainer');
                if (!container) return;

                const valor = document.getElementById('listaHoteisInput').value;
                const linhas = dividirLinhasBrutasLote(valor);
                const numerosAtivos = new Set();

                linhas.forEach((linhaBruta, indice) => {
                    const numeroLinha = indice + 1;
                    const linha = linhaBruta.replace(/[ \t]+/g, ' ').trim();
                    if (!linha || linha.includes('|')) return;

                    numerosAtivos.add(numeroLinha);

                    let linhaEl = container.querySelector(
                        '[data-linha="' + numeroLinha + '"]'
                    );
                    if (!linhaEl) {
                        linhaEl = document.createElement('div');
                        linhaEl.dataset.linha = String(numeroLinha);
                        linhaEl.className = 'lote-id-row';

                        const label = document.createElement('span');
                        label.className = 'lote-id-row-label';
                        linhaEl.appendChild(label);

                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'app-input lote-id-row-input';
                        input.placeholder = 'ID do Wix (opcional)';
                        input.value = idsPorLinhaLote.get(numeroLinha) || '';
                        input.addEventListener('input', () => {
                            const idDigitado = input.value.trim();
                            if (idDigitado) {
                                idsPorLinhaLote.set(numeroLinha, idDigitado);
                            } else {
                                idsPorLinhaLote.delete(numeroLinha);
                            }
                            atualizarContadorEntradaLote();
                        });
                        linhaEl.appendChild(input);
                    }

                    linhaEl.querySelector('.lote-id-row-label').textContent = linha;
                    container.appendChild(linhaEl);
                });

                Array.from(container.children).forEach((linhaEl) => {
                    const numeroLinha = Number(linhaEl.dataset.linha);
                    if (!numerosAtivos.has(numeroLinha)) {
                        idsPorLinhaLote.delete(numeroLinha);
                        linhaEl.remove();
                    }
                });
            }

            function normalizarEntradasLote(valor) {
                const entradas = String(valor || '')
                    .replace(/\u00a0/g, ' ')
                    .split(/\r\n?|\n/)
                    .map(item => item.replace(/[ \t]+/g, ' ').trim())
                    .filter(Boolean);
                return Array.from(new Set(entradas));
            }

            function parsearEntradasLote(valor) {
                const linhas = String(valor || '')
                    .replace(/\u00a0/g, ' ')
                    .split(/\r\n?|\n/);

                const entradas = [];

                linhas.forEach((linhaBruta, indice) => {
                    const numeroLinha = indice + 1;
                    const linha = linhaBruta.replace(/[ \t]+/g, ' ').trim();
                    if (!linha) return;

                    const indiceSeparador = linha.indexOf('|');
                    if (indiceSeparador === -1) {
                        entradas.push({
                            idWix: '',
                            consulta: linha,
                            textoOriginal: linha,
                            numeroLinha
                        });
                        return;
                    }

                    const idParte = linha.slice(0, indiceSeparador).trim();
                    const consultaParte = linha.slice(indiceSeparador + 1).trim();

                    if (!idParte || !consultaParte) {
                        throw new Error(
                            'Linha ' + numeroLinha +
                            ' inválida: informe o ID antes do separador e o hotel depois dele.'
                        );
                    }

                    entradas.push({
                        idWix: idParte,
                        consulta: consultaParte,
                        textoOriginal: linha,
                        numeroLinha
                    });
                });

                return entradas;
            }

            function prepararEntradasLotePesquisa(valor) {
                const entradas = parsearEntradasLote(valor);
                const resultado = [];
                const vistosSemId = new Set();
                const mapaPorId = new Map();
                const conflitosPorId = new Map();

                entradas.forEach((entrada) => {
                    if (!entrada.idWix) {
                        if (vistosSemId.has(entrada.consulta)) return;
                        vistosSemId.add(entrada.consulta);
                        resultado.push(entrada);
                        return;
                    }

                    if (!mapaPorId.has(entrada.idWix)) {
                        mapaPorId.set(entrada.idWix, entrada);
                        resultado.push(entrada);
                        return;
                    }

                    const existente = mapaPorId.get(entrada.idWix);
                    if (existente.consulta === entrada.consulta) return;

                    if (!conflitosPorId.has(entrada.idWix)) {
                        conflitosPorId.set(
                            entrada.idWix,
                            new Set([existente.numeroLinha])
                        );
                    }
                    conflitosPorId.get(entrada.idWix).add(entrada.numeroLinha);
                });

                if (conflitosPorId.size > 0) {
                    const mensagens = Array.from(conflitosPorId.entries()).map(
                        ([idWix, linhas]) => {
                            const linhasOrdenadas = Array.from(linhas).sort(
                                (a, b) => a - b
                            );
                            return 'ID ' + idWix +
                                ' associado a consultas diferentes nas linhas ' +
                                linhasOrdenadas.join(', ') + '.';
                        }
                    );
                    throw new Error(
                        'Conflito de ID na pesquisa em lote: ' +
                        mensagens.join(' ')
                    );
                }

                return resultado;
            }

            function contarEntradasLote(valor) {
                const linhas = String(valor || '')
                    .replace(/\u00a0/g, ' ')
                    .split(/\r\n?|\n/)
                    .map(linha => linha.replace(/[ \t]+/g, ' ').trim())
                    .filter(Boolean);

                let comId = 0;
                linhas.forEach((linha) => {
                    const indiceSeparador = linha.indexOf('|');
                    if (indiceSeparador === -1) return;
                    if (linha.slice(0, indiceSeparador).trim()) comId += 1;
                });

                return { total: linhas.length, comId };
            }

            function atualizarContadorEntradaLote() {
                const valorCombinado = combinarListaEIdsLote(
                    document.getElementById('listaHoteisInput').value
                );
                const { total, comId } = contarEntradasLote(valorCombinado);
                const texto = total + (total === 1 ? ' hotel' : ' hotéis') +
                    (comId > 0 ? ' • ' + comId + ' com ID do Wix' : '');
                document.getElementById('contadorEntradaLote').textContent = texto;
            }

            function atualizarMensagemPesquisa(mensagem = '', tipo = 'neutro') {
                const elemento = document.getElementById('mensagemPesquisa');
                elemento.textContent = mensagem;
                elemento.classList.toggle('hidden', !mensagem);
                elemento.classList.toggle('app-status-danger', tipo === 'erro');
                elemento.classList.toggle('app-status-success', tipo === 'sucesso');
                elemento.classList.toggle(
                    'app-text-muted',
                    tipo !== 'erro' && tipo !== 'sucesso'
                );
            }

            function atualizarModoPesquisaLote() {
                const baixarImagens = document.getElementById(
                    'baixarImagensLoteInput'
                ).checked;
                document.getElementById('painelFiltroDownloadLote')
                    .classList.toggle('hidden', !baixarImagens);
                document.getElementById('textoBtnPesquisarLote').textContent =
                    baixarImagens
                        ? 'Baixar imagens dos hotéis da lista'
                        : 'Pesquisar lista e adicionar ao CSV';
                atualizarCamposFiltroDownloadLote();
            }

            function atualizarCamposFiltroDownloadLote() {
                const modo = document.getElementById('modoFiltroDownloadLote').value;
                const usaRaio = modo === 'ambos';
                const usaCidade = modo === 'ambos';
                const usaEstado = modo === 'estado';
                document.getElementById('campoRaioDownloadLote')
                    .classList.toggle('hidden', !usaRaio);
                document.getElementById('campoCidadeDownloadLote')
                    .classList.toggle('hidden', !usaCidade);
                document.getElementById('campoEstadoDownloadLote')
                    .classList.toggle('hidden', !usaEstado);

                const descricoes = {
                    nenhum: 'Sem filtro: todos os hotéis encontrados terão as imagens baixadas.',
                    estado: 'Confere a UF no endereço encontrado antes de baixar.',
                    ambos: 'Baixa somente quando o hotel está na cidade informada e dentro do raio.'
                };
                document.getElementById('ajudaFiltroDownloadLote').textContent =
                    descricoes[modo] || descricoes.nenhum;
            }

            function obterFiltroDownloadLote(baixarImagens) {
                if (!baixarImagens) return { modo: 'nenhum' };

                const modo = document.getElementById('modoFiltroDownloadLote').value;
                const filtro = { modo };
                if (modo === 'ambos') {
                    filtro.raioKm = Number(
                        document.getElementById('raioDownloadLote').value
                    );
                    if (!Number.isFinite(filtro.raioKm) ||
                        filtro.raioKm <= 0 || filtro.raioKm > 20000) {
                        throw new Error(
                            'Informe um raio válido, maior que 0 e de até 20.000 km.'
                        );
                    }
                }
                if (modo === 'ambos') {
                    filtro.cidade = document.getElementById(
                        'cidadeDownloadLote'
                    ).value.trim();
                    if (filtro.cidade.length < 2) {
                        throw new Error('Informe a cidade usada no filtro de download.');
                    }
                }
                if (modo === 'estado') {
                    filtro.estado = document.getElementById(
                        'estadoDownloadLote'
                    ).value;
                    if (!filtro.estado) {
                        throw new Error('Selecione o estado usado no filtro de download.');
                    }
                }
                return filtro;
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

            // Junta, ao final da lista de resultados do lote, um botão para
            // copiar os hotéis que deram erro e os que ficaram com
            // localização muito diferente da pesquisada — para o usuário
            // revisar ou pesquisar de novo por fora, sem mexer na lista atual.
            function atualizarBotaoProblemasLote(hoteisComErro, hoteisLocalizacaoSuspeita) {
                const btn = document.getElementById('btnCopiarProblemasLote');
                const total = hoteisComErro.length + hoteisLocalizacaoSuspeita.length;

                if (total === 0) {
                    textoProblemasLote = '';
                    rotuloProblemasLote = '';
                    btn.classList.add('hidden');
                    return;
                }

                const secoes = [];
                if (hoteisComErro.length > 0) {
                    secoes.push(
                        'Hotéis com erro (' + hoteisComErro.length + '):\n' +
                        hoteisComErro.join('\n')
                    );
                }
                if (hoteisLocalizacaoSuspeita.length > 0) {
                    secoes.push(
                        'Hotéis com localização muito diferente da pesquisada (' +
                        hoteisLocalizacaoSuspeita.length + '):\n' +
                        hoteisLocalizacaoSuspeita.join('\n')
                    );
                }
                textoProblemasLote = secoes.join('\n\n');
                rotuloProblemasLote =
                    '📋 Copiar lista de hotéis com erro/localização suspeita (' +
                    total + ')';

                btn.textContent = rotuloProblemasLote;
                btn.classList.remove('hidden');
            }

            async function copiarProblemasLote() {
                if (!textoProblemasLote) return;
                const btn = document.getElementById('btnCopiarProblemasLote');

                try {
                    await navigator.clipboard.writeText(textoProblemasLote);
                    btn.textContent = '✓ Lista copiada para a área de transferência.';
                } catch (erro) {
                    btn.textContent = '✕ Não foi possível copiar automaticamente.';
                } finally {
                    window.setTimeout(() => {
                        btn.textContent = rotuloProblemasLote;
                    }, 2500);
                }
            }

            async function pesquisarHoteisEmLote() {
                if (pesquisaLoteEmAndamento) return;

                const valorLista = combinarListaEIdsLote(
                    document.getElementById('listaHoteisInput').value
                );
                let hoteis;
                try {
                    hoteis = prepararEntradasLotePesquisa(valorLista);
                } catch (erro) {
                    alert(erro.message);
                    return;
                }
                const baixarImagens = document.getElementById(
                    'baixarImagensLoteInput'
                ).checked;
                let filtroDownload;
                try {
                    filtroDownload = obterFiltroDownloadLote(baixarImagens);
                } catch (erro) {
                    alert(erro.message);
                    return;
                }

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
                    'modoFiltroDownloadLote',
                    'raioDownloadLote',
                    'cidadeDownloadLote',
                    'estadoDownloadLote',
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

                const rotuloId = (idWix) => idWix ? '[' + idWix + '] ' : '';

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
                document.getElementById('btnCopiarProblemasLote')
                    .classList.add('hidden');

                let adicionados = 0;
                let baixados = 0;
                let filtradosDownload = 0;
                let ignorados = 0;
                let erros = 0;
                const hoteisComErro = [];
                const hoteisLocalizacaoSuspeita = [];

                try {
                    for (let indice = 0; indice < hoteis.length; indice++) {
                        const entrada = hoteis[indice];
                        const textoBaseStatus = baixarImagens
                            ? 'Pesquisando e baixando imagens'
                            : 'Pesquisando';
                        const sufixoIdStatus = entrada.idWix
                            ? ' [' + entrada.idWix + ']'
                            : '';
                        textoStatus.textContent =
                            textoBaseStatus + sufixoIdStatus + ': ' + entrada.consulta;
                        contador.textContent = indice + ' de ' + hoteis.length;
                        barra.style.width = ((indice / hoteis.length) * 100) + '%';

                        const linhaResultado = document.createElement('p');
                        linhaResultado.className = 'app-text-muted';
                        linhaResultado.textContent =
                            '⏳ ' + rotuloId(entrada.idWix) + entrada.consulta;
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
                                        nome: entrada.consulta,
                                        baixarImagens,
                                        latitudeReferencia,
                                        longitudeReferencia,
                                        filtroDownload
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
                            const fonteTexto = dados.fonte ? ' • ' + dados.fonte : '';

                            if (dados.localizacaoForaDaArea) {
                                hoteisLocalizacaoSuspeita.push(
                                    entrada.textoOriginal || entrada.consulta
                                );
                            }
                            const avisoLocalizacao = dados.localizacaoForaDaArea
                                ? ' ⚠ localização bem distante da área pesquisada'
                                : '';

                            if (baixarImagens) {
                                if (entrada.idWix) dadosAtuais.idWix = entrada.idWix;
                                if (dados.baixouLocal) {
                                    baixados += 1;
                                    linhaResultado.className = dados.localizacaoForaDaArea
                                        ? 'app-status-warning'
                                        : 'app-status-success';
                                    linhaResultado.textContent =
                                        '✓ ' + rotuloId(entrada.idWix) + dados.nome +
                                        ': imagens baixadas' + fonteTexto + avisoLocalizacao;
                                } else {
                                    filtradosDownload += 1;
                                    linhaResultado.className = 'app-status-warning';
                                    linhaResultado.textContent =
                                        '↷ ' + rotuloId(entrada.idWix) + dados.nome +
                                        ': download ignorado • ' +
                                        (dados.filtroDownload?.motivo ||
                                            'não passou pelo filtro') + fonteTexto;
                                }
                            } else {
                                if (entrada.idWix) {
                                    dadosAtuais.idWix = entrada.idWix;
                                    if (csvWix) {
                                        const itemWix = localizarItemWixPorId(entrada.idWix);
                                        if (!itemWix) {
                                            throw Object.assign(
                                                new Error('ID não encontrado no CSV do Wix.'),
                                                { ignorado: true }
                                            );
                                        }
                                    }
                                } else if (csvWix) {
                                    const localizacaoWix = localizarItemWixPorNome(dados.nome);
                                    if (!localizacaoWix.item) {
                                        const motivo = localizacaoWix.motivo === 'repetido'
                                            ? 'mais de uma correspondência encontrada no CSV'
                                            : 'hotel não encontrado no CSV';
                                        throw Object.assign(
                                            new Error(entrada.consulta + ': ' + motivo + '.'),
                                            { ignorado: true }
                                        );
                                    }
                                    if (!localizacaoWix.item.ID) {
                                        throw Object.assign(
                                            new Error(
                                                entrada.consulta +
                                                ': hotel encontrado sem ID no CSV.'
                                            ),
                                            { ignorado: true }
                                        );
                                    }
                                    dadosAtuais.idWix = localizacaoWix.item.ID;
                                }

                                if (!adicionarAoCsv()) {
                                    throw new Error('Não foi possível adicionar o hotel ao CSV.');
                                }

                                adicionados += 1;
                                linhaResultado.className = dados.localizacaoForaDaArea
                                    ? 'app-status-warning'
                                    : 'app-status-success';
                                linhaResultado.textContent =
                                    '✓ ' + rotuloId(entrada.idWix) + dados.nome +
                                    fonteTexto + avisoLocalizacao;
                            }
                        } catch (erro) {
                            if (erro.ignorado) {
                                ignorados += 1;
                                linhaResultado.className = 'app-status-warning';
                                linhaResultado.textContent =
                                    '↷ ' + rotuloId(entrada.idWix) + erro.message;
                            } else {
                                erros += 1;
                                hoteisComErro.push(
                                    entrada.textoOriginal || entrada.consulta
                                );
                                linhaResultado.className = 'app-status-danger';
                                linhaResultado.textContent =
                                    '✕ ' + rotuloId(entrada.idWix) + entrada.consulta +
                                    ': ' + erro.message;
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

                        if (indice < hoteis.length - 1) {
                            const intervaloMs = calcularIntervaloEntreBuscasLote();
                            textoStatus.textContent =
                                'Aguardando ' + Math.round(intervaloMs / 1000) +
                                's antes da próxima pesquisa...';
                            await aguardarMs(intervaloMs);
                        }
                    }

                    textoStatus.textContent = baixarImagens
                        ? 'Concluído: ' + baixados + ' hotéis com imagens baixadas, ' +
                            filtradosDownload + ' ignorados pelo filtro, ' +
                            erros + ' com erro.'
                        : 'Concluído: ' + adicionados + ' adicionados, ' +
                            ignorados + ' ignorados, ' + erros + ' com erro.';
                    renderizarResumoLocalizacoesLote();
                    atualizarBotaoProblemasLote(
                        hoteisComErro,
                        hoteisLocalizacaoSuspeita
                    );
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
                module.exports = {
                    normalizarEntradasLote,
                    parsearEntradasLote,
                    prepararEntradasLotePesquisa,
                    contarEntradasLote
                };
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
                    ? 'Escavando dados e trazendo toda a galeria em HD...'
                    : 'Escavando os dados do hotel...';
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
                        tagIcon.className = "app-accent-text h-4 w-4";
                    } else {
                        textPlusCode.innerText = "Plus Code indisponível";
                        tagPlusCodeBase.dataset.available = 'false';
                        tagIcon.className = "app-text-subtle h-4 w-4";
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
                    if (dados.localizacaoForaDaArea) {
                        const distanciaTexto = Number.isFinite(dados.distanciaReferenciaKm)
                            ? Math.round(dados.distanciaReferenciaKm) + ' km'
                            : 'desconhecida';
                        atualizarMensagemPesquisa(
                            '⚠ Atenção: este hotel está a ' + distanciaTexto +
                            ' da área pesquisada. Confira o endereço antes de usar o resultado.',
                            'erro'
                        );
                    } else {
                        atualizarMensagemPesquisa('Achado confirmado: consulta concluída.', 'sucesso');
                    }

                } catch (err) {
                    atualizarMensagemPesquisa(
                        'A escavação dos dados não foi concluída: ' + err.message,
                        'erro'
                    );
                } finally {
                    loader.classList.add('hidden');
                    btnBuscar.disabled = false;
                    btnBuscar.classList.remove('opacity-50');
                }
            }
