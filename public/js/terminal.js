const TERMINAL_LIMITE_LINHAS = 500;
let terminalEventSource = null;

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
    linha.className = `terminal-line terminal-line-${entrada.nivel || 'info'}`;

    const hora = document.createElement('span');
    hora.className = 'terminal-line-time';
    hora.textContent = formatarHoraTerminal(entrada.timestamp);

    const mensagem = document.createElement('span');
    mensagem.className = 'terminal-line-message';
    mensagem.textContent = entrada.mensagem;

    linha.append(hora, mensagem);
    area.appendChild(linha);

    while (area.children.length > TERMINAL_LIMITE_LINHAS) {
        area.removeChild(area.firstChild);
    }

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
    area.innerHTML = '<p class="terminal-log-empty">Nenhuma mensagem ainda.</p>';
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
