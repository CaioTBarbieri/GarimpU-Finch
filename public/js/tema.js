(() => {
    'use strict';

    const CHAVE_PALETA = 'garimpu-paleta';
    const PALETA_PADRAO = 'dourado';
    const PALETAS_VALIDAS = Object.freeze([
        'dourado',
        'ametista',
        'artico',
        'esmeralda',
    ]);

    function validarPaleta(valor) {
        return PALETAS_VALIDAS.includes(valor)
            ? valor
            : PALETA_PADRAO;
    }

    function lerPaletaSalva() {
        try {
            return validarPaleta(localStorage.getItem(CHAVE_PALETA));
        } catch {
            return PALETA_PADRAO;
        }
    }

    function salvarPaleta(paleta) {
        try {
            localStorage.setItem(CHAVE_PALETA, paleta);
        } catch {
            // A troca continua válida durante a sessão sem bloquear a interface.
        }
    }

    function atualizarControles(paleta) {
        document
            .querySelectorAll('input[name="paletaAplicacao"]')
            .forEach((radio) => {
                radio.checked = radio.value === paleta;
            });

        document
            .querySelectorAll('[data-palette-value]')
            .forEach((opcao) => {
                opcao.dataset.selected = String(
                    opcao.dataset.paletteValue === paleta,
                );
            });
    }

    function aplicarPaleta(
        valor,
        { persistir = true, emitirEvento = true } = {},
    ) {
        const paletaAnterior = validarPaleta(
            document.documentElement.dataset.palette,
        );
        const paleta = validarPaleta(valor);

        document.documentElement.dataset.palette = paleta;
        atualizarControles(paleta);
        if (persistir) salvarPaleta(paleta);

        if (emitirEvento && paleta !== paletaAnterior) {
            window.dispatchEvent(
                new CustomEvent('garimpu:paleta-alterada', {
                    detail: {
                        paleta,
                        paletaAnterior,
                    },
                }),
            );
        }

        return paleta;
    }

    function selecionarPaleta(valor) {
        return aplicarPaleta(valor);
    }

    function restaurarPaletaPadrao() {
        return aplicarPaleta(PALETA_PADRAO);
    }

    function inicializarTema() {
        const paletaInicial = lerPaletaSalva();
        aplicarPaleta(paletaInicial, {
            persistir: false,
            emitirEvento: false,
        });
    }

    window.selecionarPaleta = selecionarPaleta;
    window.restaurarPaletaPadrao = restaurarPaletaPadrao;
    window.garimpuTema = Object.freeze({
        aplicarPaleta,
        lerPaletaSalva,
        paletasValidas: PALETAS_VALIDAS,
        paletaPadrao: PALETA_PADRAO,
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarTema, {
            once: true,
        });
    } else {
        inicializarTema();
    }
})();
