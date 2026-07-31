(() => {
    'use strict';

    const CHAVE_MODO_DEV = 'garimpu-modo-dev';

    function lerModoDevSalvo() {
        try {
            return localStorage.getItem(CHAVE_MODO_DEV) === 'true';
        } catch {
            return false;
        }
    }

    function salvarModoDev(ativo) {
        try {
            localStorage.setItem(CHAVE_MODO_DEV, String(ativo));
        } catch {
            // O estado continua válido durante a sessão sem bloquear a interface.
        }
    }

    function aplicarModoDev(ativo, { persistir = true } = {}) {
        document.querySelectorAll('[data-dev-only]').forEach((elemento) => {
            elemento.hidden = !ativo;
        });

        const checkbox = document.getElementById('checkboxModoDev');
        if (checkbox) checkbox.checked = ativo;

        if (!ativo) {
            const abaTerminalAtiva = document
                .querySelector('[data-tab-button="terminal"]')
                ?.getAttribute('aria-pressed') === 'true';
            if (abaTerminalAtiva && typeof selecionarAba === 'function') {
                selecionarAba('pesquisa');
            }
        }

        if (persistir) salvarModoDev(ativo);

        window.dispatchEvent(
            new CustomEvent('garimpu:modo-dev-alterado', { detail: { ativo } }),
        );

        return ativo;
    }

    function alternar(ativo) {
        return aplicarModoDev(Boolean(ativo));
    }

    function inicializar() {
        aplicarModoDev(lerModoDevSalvo(), { persistir: false });
    }

    window.garimpuModoDev = Object.freeze({ alternar, aplicarModoDev });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar, { once: true });
    } else {
        inicializar();
    }
})();
