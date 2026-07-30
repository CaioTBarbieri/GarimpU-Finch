let diretoriosPadrao = null;

const CHAVE_COORDENADAS_AEROPORTO = 'garimpu-coordenadas-aeroporto';
const COORDENADAS_AEROPORTO_PADRAO = Object.freeze({
    latitude: -14.815,
    longitude: -39.0333
});

function definirStatusCoordenadasAeroporto(mensagem, tipo = 'neutro') {
    const status = document.getElementById('statusCoordenadasAeroporto');
    if (!status) return;
    status.textContent = mensagem;
    status.className = 'mt-3 text-sm ' + (
        tipo === 'erro'
            ? 'app-status-danger'
            : tipo === 'sucesso'
                ? 'app-status-success'
                : 'app-text-subtle'
    );
}

function lerCoordenadasAeroportoSalvas() {
    try {
        const bruto = localStorage.getItem(CHAVE_COORDENADAS_AEROPORTO);
        if (!bruto) return null;
        const dados = JSON.parse(bruto);
        const latitude = Number(dados.latitude);
        const longitude = Number(dados.longitude);
        if (
            !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
            !Number.isFinite(longitude) || longitude < -180 || longitude > 180
        ) {
            return null;
        }
        return { latitude, longitude };
    } catch {
        return null;
    }
}

function carregarCoordenadasAeroporto() {
    const salvas = lerCoordenadasAeroportoSalvas();
    if (!salvas) return;
    document.getElementById('latitudeReferenciaInput').value = salvas.latitude;
    document.getElementById('longitudeReferenciaInput').value = salvas.longitude;
    definirStatusCoordenadasAeroporto('Coordenadas salvas carregadas.');
}

function salvarCoordenadasAeroporto() {
    const latitude = Number(
        document.getElementById('latitudeReferenciaInput').value
    );
    const longitude = Number(
        document.getElementById('longitudeReferenciaInput').value
    );

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        definirStatusCoordenadasAeroporto(
            'Digite uma latitude válida, entre -90 e 90.',
            'erro'
        );
        return;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        definirStatusCoordenadasAeroporto(
            'Digite uma longitude válida, entre -180 e 180.',
            'erro'
        );
        return;
    }

    try {
        localStorage.setItem(
            CHAVE_COORDENADAS_AEROPORTO,
            JSON.stringify({ latitude, longitude })
        );
        definirStatusCoordenadasAeroporto(
            'Coordenadas salvas. Serão usadas automaticamente nas próximas pesquisas.',
            'sucesso'
        );
    } catch (erro) {
        definirStatusCoordenadasAeroporto(
            'Não foi possível salvar as coordenadas: ' + erro.message,
            'erro'
        );
    }
}

function restaurarCoordenadasAeroportoPadrao() {
    document.getElementById('latitudeReferenciaInput').value =
        COORDENADAS_AEROPORTO_PADRAO.latitude;
    document.getElementById('longitudeReferenciaInput').value =
        COORDENADAS_AEROPORTO_PADRAO.longitude;
    definirStatusCoordenadasAeroporto(
        'Coordenadas padrão restauradas. Clique em “Salvar” para aplicar.'
    );
}

function definirStatusDiretorios(mensagem, tipo = 'neutro') {
    const status = document.getElementById('statusDiretorios');
    status.textContent = mensagem;
    status.className = 'mt-3 text-sm ' + (
        tipo === 'erro'
            ? 'app-status-danger'
            : tipo === 'sucesso'
                ? 'app-status-success'
                : 'app-text-subtle'
    );
}

function definirControlesDiretoriosDesabilitados(desabilitados) {
    [
        'btnSelecionarPastaImagens',
        'btnSelecionarPastaFlorence',
        'btnUsarMesmaPastaFlorence',
        'btnRestaurarPastas',
        'btnSalvarDiretorios'
    ].forEach((id) => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.disabled = desabilitados;
    });
}

async function carregarDiretorios() {
    if (!window.garimpuDesktop) {
        definirControlesDiretoriosDesabilitados(true);
        definirStatusDiretorios(
            'A seleção nativa de pastas está disponível no aplicativo para Windows.'
        );
        return;
    }

    try {
        const configuracoes =
            await window.garimpuDesktop.obterConfiguracoes();
        diretoriosPadrao = configuracoes.padroes;
        document.getElementById('pastaImagensInput').value =
            configuracoes.pastaImagens;
        document.getElementById('pastaFlorenceInput').value =
            configuracoes.pastaFlorence;
        definirStatusDiretorios(
            'Os diretórios selecionados estão ativos nesta execução.'
        );
    } catch (erro) {
        definirControlesDiretoriosDesabilitados(true);
        definirStatusDiretorios(
            'Não foi possível carregar os diretórios: ' + erro.message,
            'erro'
        );
    }
}

async function selecionarPastaConfiguracao(tipo) {
    if (!window.garimpuDesktop) return;
    const idInput = tipo === 'florence'
        ? 'pastaFlorenceInput'
        : 'pastaImagensInput';
    const input = document.getElementById(idInput);

    try {
        const caminho = await window.garimpuDesktop.selecionarPasta(
            input.value
        );
        if (caminho) {
            input.value = caminho;
            definirStatusDiretorios(
                'Diretório alterado. Clique em “Salvar e reiniciar” para aplicar.'
            );
        }
    } catch (erro) {
        definirStatusDiretorios(
            'Não foi possível selecionar a pasta: ' + erro.message,
            'erro'
        );
    }
}

function usarPastaImagensNoFlorence() {
    document.getElementById('pastaFlorenceInput').value =
        document.getElementById('pastaImagensInput').value;
    definirStatusDiretorios(
        'O Florence usará a mesma pasta das imagens após salvar.'
    );
}

function restaurarDiretoriosPadrao() {
    if (!diretoriosPadrao) return;
    document.getElementById('pastaImagensInput').value =
        diretoriosPadrao.pastaImagens;
    document.getElementById('pastaFlorenceInput').value =
        diretoriosPadrao.pastaFlorence;
    definirStatusDiretorios(
        'Diretórios padrão restaurados. Salve para aplicar.'
    );
}

async function salvarDiretorios() {
    if (!window.garimpuDesktop) return;
    const pastaImagens =
        document.getElementById('pastaImagensInput').value.trim();
    const pastaFlorence =
        document.getElementById('pastaFlorenceInput').value.trim();

    if (!pastaImagens || !pastaFlorence) {
        definirStatusDiretorios(
            'Selecione as duas pastas antes de salvar.',
            'erro'
        );
        return;
    }

    const confirmou = confirm(
        'O aplicativo será reiniciado para aplicar os novos diretórios. ' +
        'Se houver uma organização em andamento, ela será interrompida. Continuar?'
    );
    if (!confirmou) return;

    const botao = document.getElementById('btnSalvarDiretorios');
    botao.disabled = true;
    botao.classList.add('is-loading');
    definirStatusDiretorios('Salvando diretórios e reiniciando...');

    try {
        await window.garimpuDesktop.salvarConfiguracoes({
            pastaImagens,
            pastaFlorence
        });
        definirStatusDiretorios(
            'Configurações salvas. Reiniciando o aplicativo...',
            'sucesso'
        );
    } catch (erro) {
        botao.disabled = false;
        botao.classList.remove('is-loading');
        definirStatusDiretorios(
            'Não foi possível salvar os diretórios: ' + erro.message,
            'erro'
        );
    }
}

carregarDiretorios();
carregarCoordenadasAeroporto();
