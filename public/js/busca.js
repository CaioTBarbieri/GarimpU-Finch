            function atualizarContadorEntradaLote() {
                const entradas = document.getElementById('listaHoteisInput').value
                    .split(/\r?\n/)
                    .map(item => item.trim())
                    .filter(Boolean);
                const total = new Set(entradas).size;
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

            async function pesquisarHoteisEmLote() {
                const entradas = document.getElementById('listaHoteisInput').value
                    .split(/\r?\n/)
                    .map(item => item.trim())
                    .filter(Boolean);
                const hoteis = Array.from(new Set(entradas));
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

                        try {
                            const response = await fetch('/api/buscar', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    nome: entrada,
                                    baixarImagens,
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

                        contador.textContent = (indice + 1) + ' de ' + hoteis.length;
                        barra.style.width = (((indice + 1) / hoteis.length) * 100) + '%';
                        resultados.scrollTop = resultados.scrollHeight;
                    }

                    textoStatus.textContent = baixarImagens
                        ? 'Concluído: ' + baixados + ' hotéis com imagens baixadas, ' +
                            erros + ' com erro.'
                        : 'Concluído: ' + adicionados + ' adicionados, ' +
                            ignorados + ' ignorados, ' + erros + ' com erro.';
                    if (!baixarImagens && adicionados > 0) {
                        btnBaixarCsvLote.classList.remove('hidden');
                        btnBaixarCsvLote.classList.add('flex');
                    }
                    if (baixarImagens) {
                        await carregarBibliotecaFotos({ silencioso: true });
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
