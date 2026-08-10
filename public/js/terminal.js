const TERMINAL_LIMITE_LINHAS = 500;
let terminalEventSource = null;

function normalizarBuscaTerminal(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR');
}

function obterLinhasTerminal() {
    return Array.from(document.querySelectorAll('#terminalLog .terminal-line'));
}

function atualizarFiltroTerminal() {
    const termo = normalizarBuscaTerminal(document.getElementById('terminalBuscaInput')?.value.trim());
    const linhas = obterLinhasTerminal();
    let visiveis = 0;

    linhas.forEach((linha) => {
        const corresponde = !termo || linha.dataset.busca.includes(termo);
        linha.hidden = !corresponde;
        if (corresponde) visiveis += 1;
    });

    const contagem = document.getElementById('terminalContagemLinhas');
    if (contagem) contagem.textContent = `${linhas.length} ${linhas.length === 1 ? 'linha' : 'linhas'}`;

    const resumo = document.getElementById('terminalBuscaResumo');
    if (resumo) resumo.textContent = termo ? `${visiveis} de ${linhas.length}` : '';

    const buscaVazia = document.getElementById('terminalBuscaVazia');
    if (buscaVazia) buscaVazia.hidden = !termo || linhas.length === 0 || visiveis > 0;
}

function alternarPesquisaTerminal() {
    const busca = document.getElementById('terminalBusca');
    if (!busca) return;

    if (busca.hidden) {
        busca.hidden = false;
        document.getElementById('btnPesquisarTerminal')?.setAttribute('aria-expanded', 'true');
        document.getElementById('terminalBuscaInput')?.focus();
    } else {
        fecharPesquisaTerminal();
    }
}

function fecharPesquisaTerminal() {
    const busca = document.getElementById('terminalBusca');
    const campo = document.getElementById('terminalBuscaInput');
    if (campo) campo.value = '';
    if (busca) busca.hidden = true;
    document.getElementById('btnPesquisarTerminal')?.setAttribute('aria-expanded', 'false');
    atualizarFiltroTerminal();
}

function formatarHoraTerminal(timestampIso) {
    try {
        return new Date(timestampIso).toLocaleTimeString('pt-BR', { hour12: false });
    } catch {
        return '--:--:--';
    }
}

function terminalEstaProximoDoFinal(area) {
    return area.scrollHeight - area.scrollTop - area.clientHeight < 80;
}

function adicionarLinhaTerminal(entrada) {
    const area = document.getElementById('terminalLog');
    if (!area) return;

    const vazio = area.querySelector('.terminal-log-empty');
    if (vazio) vazio.remove();

    const manterRolagem = terminalEstaProximoDoFinal(area);

    const linha = document.createElement('p');
    const nivel = ['info', 'warn', 'error'].includes(entrada.nivel) ? entrada.nivel : 'info';
    linha.className = `terminal-line terminal-line-${nivel}`;

    const hora = document.createElement('span');
    hora.className = 'terminal-line-time';
    hora.textContent = formatarHoraTerminal(entrada.timestamp);

    const marcadorNivel = document.createElement('span');
    marcadorNivel.className = 'terminal-line-level';
    marcadorNivel.textContent = nivel;

    const mensagem = document.createElement('span');
    mensagem.className = 'terminal-line-message';
    mensagem.textContent = entrada.mensagem;

    linha.dataset.busca = normalizarBuscaTerminal(`${hora.textContent} ${nivel} ${entrada.mensagem}`);
    linha.append(hora, marcadorNivel, mensagem);
    area.appendChild(linha);

    let linhas = obterLinhasTerminal();
    while (linhas.length > TERMINAL_LIMITE_LINHAS) {
        linhas.shift().remove();
    }

    atualizarFiltroTerminal();

    if (manterRolagem) {
        area.scrollTop = area.scrollHeight;
    }
}

function atualizarStatusConexaoTerminal(estado) {
    const badge = document.getElementById('terminalStatusConexao');
    const texto = document.getElementById('terminalStatusConexaoTexto');
    if (!badge || !texto) return;

    badge.dataset.estado = estado;
    texto.textContent = {
        conectando: 'Conectando...',
        conectado: 'Ao vivo',
        desconectado: 'Desconectado',
    }[estado] || estado;
}

function limparTerminal() {
    const area = document.getElementById('terminalLog');
    if (!area) return;
    area.querySelectorAll('.terminal-line').forEach((linha) => linha.remove());
    let vazio = area.querySelector('.terminal-log-empty');
    if (!vazio) {
        vazio = document.createElement('p');
        vazio.className = 'terminal-log-empty';
        area.prepend(vazio);
    }
    vazio.textContent = 'Aguardando novas atividades...';
    atualizarFiltroTerminal();
}

function iniciarTerminalLogs() {
    if (typeof EventSource === 'undefined' || terminalEventSource) return;

    atualizarStatusConexaoTerminal('conectando');
    terminalEventSource = new EventSource('/api/logs/stream');

    terminalEventSource.onopen = () => {
        atualizarStatusConexaoTerminal('conectado');
    };

    terminalEventSource.onmessage = (evento) => {
        try {
            adicionarLinhaTerminal(JSON.parse(evento.data));
        } catch {
            // Ignora eventos mal formados sem interromper o fluxo dos demais.
        }
    };

    terminalEventSource.onerror = () => {
        atualizarStatusConexaoTerminal(
            terminalEventSource && terminalEventSource.readyState === EventSource.CONNECTING
                ? 'conectando'
                : 'desconectado',
        );
    };
}

function pararTerminalLogs() {
    if (terminalEventSource) {
        terminalEventSource.close();
        terminalEventSource = null;
    }
    atualizarStatusConexaoTerminal('desconectado');
}

window.iniciarTerminalLogs = iniciarTerminalLogs;
window.pararTerminalLogs = pararTerminalLogs;

document.getElementById('terminalBuscaInput')?.addEventListener('input', atualizarFiltroTerminal);
document.getElementById('terminalBuscaInput')?.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') fecharPesquisaTerminal();
});

window.addEventListener('garimpu:modo-dev-alterado', (evento) => {
    if (evento.detail?.ativo) {
        iniciarTerminalLogs();
    } else {
        pararTerminalLogs();
    }
});

// O Modo Desenvolvedor já pode estar ativo quando este script carrega (estado
// restaurado do localStorage), então o "ao vivo" só liga a conexão quando
// necessário, em vez de manter um EventSource aberto para todo mundo.
if (document.getElementById('checkboxModoDev')?.checked) {
    iniciarTerminalLogs();
}
