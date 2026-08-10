function formatarDuracao(totalSegundos) {
    if (totalSegundos == null || !Number.isFinite(Number(totalSegundos))) {
        return 'Calculando estimativa...';
    }

    const segundosValidos = Math.max(0, Math.floor(Number(totalSegundos)));
    const horas = Math.floor(segundosValidos / 3600);
    const minutos = Math.floor((segundosValidos % 3600) / 60);
    const segundos = segundosValidos % 60;

    return String(horas).padStart(2, '0') + ':' +
        String(minutos).padStart(2, '0') + ':' +
        String(segundos).padStart(2, '0');
}

let downloadAutomaticoLogFlorencePendente = false;
let pastasMaeOrganizacaoCarregadas = false;
let requisicaoEstimativaFlorence = 0;

async function lerRespostaJsonOrganizacao(response, url) {
    const texto = await response.text();
    try {
        return JSON.parse(texto);
    } catch (_) {
        throw new Error(
            'A API de organização respondeu conteúdo inválido em ' + url +
            '. Feche outras instâncias do aplicativo e reinicie o servidor.'
        );
    }
}

function definirTextoStatus(id, valor, valorPadrao = '—') {
    document.getElementById(id).textContent =
        valor == null || valor === '' ? valorPadrao : String(valor);
}

function limitarPercentual(valor) {
    return Math.min(Math.max(Number(valor) || 0, 0), 100);
}

function formatarTamanhoBytes(totalBytes) {
    const bytes = Math.max(0, Number(totalBytes) || 0);
    if (bytes < 1024) return bytes + ' B';

    const unidades = ['KB', 'MB', 'GB', 'TB'];
    let valor = bytes / 1024;
    let indice = 0;
    while (valor >= 1024 && indice < unidades.length - 1) {
        valor /= 1024;
        indice += 1;
    }
    return valor.toLocaleString('pt-BR', {
        maximumFractionDigits: 1,
    }) + ' ' + unidades[indice];
}

async function carregarEstimativaFlorence() {
    const requisicaoAtual = ++requisicaoEstimativaFlorence;
    const botao = document.getElementById(
        'btnAtualizarEstimativaFlorence'
    );
    const titulo = document.getElementById(
        'estimativaHistoricaFlorence'
    );
    const detalhes = document.getElementById(
        'detalhesEstimativaFlorence'
    );
    botao.disabled = true;
    const reorganizar = document.getElementById(
        'reorganizarImagensOrganizadas'
    )?.checked === true;
    const parametros = new URLSearchParams();
    if (reorganizar) {
        parametros.set('reorganizar', 'true');
        const pastasMae = obterPastasMaeSelecionadasOrganizacao();
        if (pastasMae.length === 0) {
            titulo.textContent = 'Selecione ao menos uma pasta-mãe';
            detalhes.textContent =
                'Marque as pastas que devem entrar nesta reorganização.';
            botao.disabled = false;
            return;
        }
        pastasMae.forEach((pastaMae) =>
            parametros.append('pastaMae', pastaMae)
        );
    }
    const url = '/api/estimativa-florence' +
        (parametros.size > 0 ? '?' + parametros.toString() : '');

    try {
        const response = await fetch(url);
        const dados = await lerRespostaJsonOrganizacao(
            response,
            url
        );
        if (requisicaoAtual !== requisicaoEstimativaFlorence) return;
        if (!response.ok) {
            throw new Error(
                dados.erro || 'Não foi possível calcular a estimativa.'
            );
        }

        if (!dados.disponivel) {
            titulo.textContent = 'Estimativa indisponível';
            detalhes.textContent = dados.motivo;
            return;
        }

        titulo.textContent =
            formatarDuracao(dados.faixaMinimaSegundos) +
            ' a ' +
            formatarDuracao(dados.faixaMaximaSegundos);
        detalhes.textContent =
            dados.numeroImagens +
            (dados.numeroImagens === 1 ? ' imagem • ' : ' imagens • ') +
            formatarTamanhoBytes(dados.tamanhoTotalBytes) + ' • ' +
            dados.numeroHoteis +
            (dados.numeroHoteis === 1 ? ' hotel • ' : ' hotéis • ') +
            dados.execucoesHistoricas +
            (dados.execucoesHistoricas === 1
                ? ' execução histórica'
                : ' execuções históricas');
    } catch (erro) {
        if (requisicaoAtual !== requisicaoEstimativaFlorence) return;
        titulo.textContent = 'Estimativa indisponível';
        detalhes.textContent = erro.message;
    } finally {
        if (requisicaoAtual === requisicaoEstimativaFlorence) {
            botao.disabled = false;
        }
    }
}

async function carregarPastasMaeOrganizacao({ forcar = false } = {}) {
    if (pastasMaeOrganizacaoCarregadas && !forcar) return;

    const lista = document.getElementById('pastasMaeOrganizacaoLista');
    const status = document.getElementById('statusPastasMaeOrganizacao');
    const selecaoAnterior = new Set(
        obterPastasMaeSelecionadasOrganizacao()
    );
    definirPastasMaeOrganizacaoDesabilitadas(true);
    status.textContent = 'Carregando pastas-mãe...';

    try {
        const response = await fetch('/api/pastas-mae-florence');
        const dados = await lerRespostaJsonOrganizacao(
            response,
            '/api/pastas-mae-florence'
        );
        if (!response.ok) {
            throw new Error(dados.erro || 'Não foi possível listar as pastas-mãe.');
        }

        lista.replaceChildren();
        const pastasMae = Array.isArray(dados.pastasMae) ? dados.pastasMae : [];
        pastasMae.forEach((pastaMae) => {
            const rotulo = document.createElement('label');
            rotulo.className = 'ia-folder-option';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'app-checkbox h-4 w-4 rounded';
            checkbox.value = pastaMae;
            checkbox.checked = selecaoAnterior.size === 0 ||
                selecaoAnterior.has(pastaMae);
            checkbox.addEventListener('change', () => {
                atualizarResumoPastasMaeOrganizacao();
                carregarEstimativaFlorence();
            });
            const nome = document.createElement('span');
            nome.textContent = pastaMae;
            rotulo.append(checkbox, nome);
            lista.appendChild(rotulo);
        });
        pastasMaeOrganizacaoCarregadas = true;
        atualizarResumoPastasMaeOrganizacao();
    } catch (erro) {
        status.textContent = erro.message;
        pastasMaeOrganizacaoCarregadas = false;
    } finally {
        definirPastasMaeOrganizacaoDesabilitadas(false);
    }
}

function obterPastasMaeSelecionadasOrganizacao() {
    return Array.from(document.querySelectorAll(
        '#pastasMaeOrganizacaoLista input[type="checkbox"]:checked'
    )).map((checkbox) => checkbox.value);
}

function definirPastasMaeOrganizacaoDesabilitadas(desabilitadas) {
    document.querySelectorAll(
        '#campoPastaMaeOrganizacao input, #campoPastaMaeOrganizacao button'
    ).forEach((controle) => { controle.disabled = desabilitadas; });
}

function atualizarResumoPastasMaeOrganizacao() {
    const total = document.querySelectorAll(
        '#pastasMaeOrganizacaoLista input[type="checkbox"]'
    ).length;
    const selecionadas = obterPastasMaeSelecionadasOrganizacao().length;
    document.getElementById('statusPastasMaeOrganizacao').textContent =
        total === 0
            ? 'Nenhuma pasta-mãe encontrada.'
            : selecionadas + ' de ' + total +
                (total === 1 ? ' pasta selecionada.' : ' pastas selecionadas.');
}

function marcarTodasPastasMaeOrganizacao(marcar) {
    document.querySelectorAll(
        '#pastasMaeOrganizacaoLista input[type="checkbox"]'
    ).forEach((checkbox) => { checkbox.checked = marcar; });
    atualizarResumoPastasMaeOrganizacao();
    carregarEstimativaFlorence();
}

async function atualizarFiltroPastaMaeOrganizacao() {
    const reorganizar = document.getElementById(
        'reorganizarImagensOrganizadas'
    ).checked;
    document.getElementById('campoPastaMaeOrganizacao')
        .classList.toggle('hidden', !reorganizar);
    if (reorganizar) await carregarPastasMaeOrganizacao({ forcar: true });
    await carregarEstimativaFlorence();
}

function aplicarVisualEstadoIA(estado) {
    const card = document.getElementById('statusCardIA');
    const spinner = document.getElementById('statusSpinnerIA');
    const estadosConhecidos = ['processando', 'concluido', 'erro'];
    const estadoVisual = estadosConhecidos.includes(estado) ? estado : 'ocioso';

    card.dataset.state = estadoVisual;
    spinner.classList.toggle('animate-spin', estadoVisual === 'processando');
}

function atualizarPainelOrganizacao(status) {
    const processadas = Number(status.imagensProcessadasGeral) || 0;
    const totalGeral = Number(status.totalImagensGeral) || 0;
    const imagemAtual = Number(status.imagemAtual) || 0;
    const totalHotel = Number(status.totalImagens) || 0;
    const progressoGeral = limitarPercentual(
        totalGeral > 0 ? (processadas / totalGeral) * 100 : 0,
    );
    const progressoHotel = limitarPercentual(
        totalHotel > 0 ? (imagemAtual / totalHotel) * 100 : 0,
    );

    definirTextoStatus('statusEtapaIA', status.etapa, 'Ocioso');
    definirTextoStatus(
        'statusMensagemIA',
        status.mensagem,
        'Lapidando as imagens...',
    );
    definirTextoStatus('statusHotelIA', status.hotel);
    definirTextoStatus('statusPastaIA', status.pasta);
    definirTextoStatus('statusImagemIA', status.imagem);
    definirTextoStatus('statusImagemAtualIA', imagemAtual, '0');
    definirTextoStatus('statusTotalImagensIA', totalHotel, '0');
    definirTextoStatus('statusCategoriaIA', status.categoria);
    definirTextoStatus('statusNomeFinalIA', status.nomeFinal);
    definirTextoStatus(
        'statusTempoDecorridoIA',
        formatarDuracao(status.tempoDecorridoSegundos),
    );
    definirTextoStatus(
        'statusTempoMedioIA',
        status.tempoMedioPorImagemSegundos == null
            ? 'Calculando estimativa...'
            : formatarDuracao(status.tempoMedioPorImagemSegundos),
    );
    definirTextoStatus(
        'statusTempoRestanteIA',
        status.tempoEstimadoRestanteSegundos == null
            ? 'Calculando estimativa...'
            : formatarDuracao(status.tempoEstimadoRestanteSegundos),
    );

    let previsao = 'Calculando estimativa...';
    if (status.estado === 'concluido' && status.fimProcessamento) {
        previsao = 'Concluído às ' + new Date(status.fimProcessamento)
            .toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
            });
    } else if (status.previsaoTermino) {
        previsao = new Date(status.previsaoTermino)
            .toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
            });
    }
    definirTextoStatus('statusPrevisaoTerminoIA', previsao);
    definirTextoStatus(
        'statusProgressoGeralIA',
        processadas + ' de ' + totalGeral + ' imagens',
    );
    definirTextoStatus(
        'statusImagensPendentesIA',
        (Number(status.imagensPendentesGeral) || 0) + ' imagens',
    );
    definirTextoStatus(
        'statusProgressoGeralContagemIA',
        Math.round(progressoGeral),
        '0',
    );

    document.getElementById('statusBarraGeralIA').style.width =
        progressoGeral + '%';
    document.getElementById('statusBarraHotelIA').style.width =
        progressoHotel + '%';

    const historico = Array.isArray(status.historicoMensagens)
        ? status.historicoMensagens.slice(-10)
        : [];
    document.getElementById('historicoStatusIA').textContent =
        historico.length > 0
            ? historico.map((item) => '• ' + String(item)).join('\n')
            : 'Nenhuma mensagem recebida.';

    document.getElementById('statusRotuloTempoIA').textContent =
        status.estado === 'concluido'
            ? 'Tempo total:'
            : 'Tempo decorrido:';
    aplicarVisualEstadoIA(status.estado);
}

function prepararPainelOrganizacao() {
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('painelOrganizacaoIA')
        .classList.remove('hidden');
    atualizarPainelOrganizacao({
        estado: 'processando',
        etapa: 'iniciando',
        mensagem: 'Preparando a frente de organização...',
        imagemAtual: 0,
        totalImagens: 0,
        imagensProcessadasGeral: 0,
        totalImagensGeral: 0,
        imagensPendentesGeral: 0,
        tempoDecorridoSegundos: 0,
        historicoMensagens: [],
    });
}

async function baixarLogFlorence({ automatico = false } = {}) {
    const botao = document.getElementById('btnBaixarLogFlorence');
    const status = document.getElementById('statusLogFlorence');
    botao.disabled = true;
    status.className = 'app-text-muted text-xs';
    status.textContent = 'Preparando download...';

    try {
        const response = await fetch('/api/log-florence');
        if (!response.ok) {
            const dados = await response.json();
            throw new Error(
                dados.erro || 'Não foi possível baixar o log do Florence.'
            );
        }

        const arquivo = await response.blob();
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'log_classificacao_florence.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        status.className = 'app-status-success text-xs';
        status.textContent = automatico
            ? 'Organização concluída. Log baixado automaticamente.'
            : 'Download iniciado.';
    } catch (erro) {
        status.className = 'app-status-danger text-xs';
        status.textContent = erro.message;
    } finally {
        botao.disabled = false;
    }
}

async function consultarStatusOrganizacao() {
    const response = await fetch('/api/status-organizacao');
    if (!response.ok) {
        throw new Error('Não foi possível consultar o progresso.');
    }
    const status = await lerRespostaJsonOrganizacao(
        response,
        '/api/status-organizacao'
    );
    atualizarPainelOrganizacao(status);

    if (status.estado === 'concluido' || status.estado === 'erro') {
        clearInterval(intervaloStatusOrganizacao);
        intervaloStatusOrganizacao = null;

        const btn = document.getElementById('btnOrganizarTudo');
        const opcaoReorganizar = document.getElementById(
            'reorganizarImagensOrganizadas'
        );
        btn.disabled = false;
        opcaoReorganizar.disabled = false;
        definirPastasMaeOrganizacaoDesabilitadas(false);
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        carregarEstimativaFlorence();

        if (
            status.estado === 'concluido' &&
            downloadAutomaticoLogFlorencePendente
        ) {
            downloadAutomaticoLogFlorencePendente = false;
            await baixarLogFlorence({ automatico: true });
        }
    }

    return status;
}

carregarEstimativaFlorence();

async function organizarLoteIA() {
    const opcaoReorganizar = document.getElementById(
        'reorganizarImagensOrganizadas'
    );
    const reorganizar = opcaoReorganizar.checked;
    const pastasMae = reorganizar
        ? obterPastasMaeSelecionadasOrganizacao()
        : [];
    if (reorganizar && pastasMae.length === 0) {
        alert('Selecione ao menos uma pasta-mãe para reorganizar.');
        return;
    }
    const confirmacao = confirm(
        'Isto irá ativar a IA para ' +
        (reorganizar
            ? 'os hotéis de ' + pastasMae.length +
                (pastasMae.length === 1
                    ? ' pasta-mãe selecionada. '
                    : ' pastas-mãe selecionadas. ')
            : 'TODOS os hotéis salvos na sua pasta. ') +
        (reorganizar
            ? 'As imagens antigas já organizadas também serão renomeadas com o Florence. '
            : '') +
        'O processo pode levar vários minutos (ou horas, dependendo do volume). ' +
        'Deseja continuar?',
    );
    if (!confirmacao) return;

    downloadAutomaticoLogFlorencePendente = false;
    const btn = document.getElementById('btnOrganizarTudo');
    const resultadoContainer = document.getElementById('resultadoContainer');

    resultadoContainer.classList.add('hidden');
    btn.disabled = true;
    opcaoReorganizar.disabled = true;
    definirPastasMaeOrganizacaoDesabilitadas(true);
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    prepararPainelOrganizacao();

    try {
        const response = await fetch('/api/organizar-tudo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reorganizar, pastasMae }),
        });
        const dados = await lerRespostaJsonOrganizacao(
            response,
            '/api/organizar-tudo'
        );
        if (!response.ok) {
            throw new Error(dados.erro || 'Falha ao organizar em lote');
        }
        if (reorganizar && dados.reorganizar !== true) {
            throw new Error(
                'O servidor não ativou o modo Reorganizar. Reinicie o aplicativo e tente novamente.'
            );
        }
        if (reorganizar && (
            !Array.isArray(dados.pastasMae) ||
            dados.pastasMae.length !== pastasMae.length ||
            !pastasMae.every((pastaMae) => dados.pastasMae.includes(pastaMae))
        )) {
            throw new Error(
                'O servidor não aplicou todas as pastas-mãe selecionadas. Reinicie o aplicativo e tente novamente.'
            );
        }

        downloadAutomaticoLogFlorencePendente = true;
        const statusInicial = await consultarStatusOrganizacao();
        if (statusInicial.estado === 'processando') {
            intervaloStatusOrganizacao = setInterval(() => {
                consultarStatusOrganizacao().catch((erro) => {
                    console.error(erro);
                });
            }, 1000);
        }
    } catch (erro) {
        downloadAutomaticoLogFlorencePendente = false;
        atualizarPainelOrganizacao({
            estado: 'erro',
            etapa: 'erro',
            mensagem: 'Erro: ' + erro.message,
            imagemAtual: 0,
            totalImagens: 0,
            imagensProcessadasGeral: 0,
            totalImagensGeral: 0,
            imagensPendentesGeral: 0,
            tempoDecorridoSegundos: 0,
            historicoMensagens: ['Erro: ' + erro.message],
        });
        btn.disabled = false;
        opcaoReorganizar.disabled = false;
        definirPastasMaeOrganizacaoDesabilitadas(false);
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}
