let diretoriosPadrao = null;

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
