(() => {
    'use strict';

    const CHAVE_PALETA = 'garimpu-paleta';
    const PALETA_PADRAO = 'dourado';
    const PALETAS_VALIDAS = Object.freeze([
        'dourado',
        'ametista',
        'artico',
        'esmeralda',
        'galaxia',
        'sakura',
        'titanio',
        'vulcanico',
        'boreal',
        'singularidade',
        'aurora',
    ]);

    const PALETAS_EXTRAS = Object.freeze([
        'esmeralda',
        'galaxia',
        'sakura',
        'titanio',
        'vulcanico',
        'boreal',
        'singularidade',
        'aurora',
    ]);

    const CHAVE_FONTE = 'garimpu-fonte';
    const FONTE_PADRAO = 'classico';
    const FONTES_VALIDAS = Object.freeze([
        'classico',
        'moderno',
        'tecnologico',
        'editorial',
    ]);

    function validarPaleta(valor) {
        return PALETAS_VALIDAS.includes(valor)
            ? valor
            : PALETA_PADRAO;
    }

    function validarFonte(valor) {
        return FONTES_VALIDAS.includes(valor)
            ? valor
            : FONTE_PADRAO;
    }

    function lerPaletaSalva() {
        try {
            return validarPaleta(localStorage.getItem(CHAVE_PALETA));
        } catch {
            return PALETA_PADRAO;
        }
    }

    function lerFonteSalva() {
        try {
            return validarFonte(localStorage.getItem(CHAVE_FONTE));
        } catch {
            return FONTE_PADRAO;
        }
    }

    function salvarPaleta(paleta) {
        try {
            localStorage.setItem(CHAVE_PALETA, paleta);
        } catch {
            // A troca continua válida durante a sessão sem bloquear a interface.
        }
    }

    function salvarFonte(fonte) {
        try {
            localStorage.setItem(CHAVE_FONTE, fonte);
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

    function atualizarControlesFonte(fonte) {
        document
            .querySelectorAll('input[name="fonteAplicacao"]')
            .forEach((radio) => {
                radio.checked = radio.value === fonte;
            });

        document
            .querySelectorAll('[data-font-value]')
            .forEach((opcao) => {
                opcao.dataset.selected = String(
                    opcao.dataset.fontValue === fonte,
                );
            });
    }

    function definirPaletasExtrasVisiveis(visivel) {
        document
            .querySelectorAll('[data-palette-extra]')
            .forEach((opcao) => {
                opcao.hidden = !visivel;
            });

        const botao = document.getElementById('btnAlternarPaletasExtras');
        if (!botao) return;

        botao.setAttribute('aria-expanded', String(visivel));
        const rotulo = botao.querySelector('[data-toggle-label]');
        if (rotulo) {
            rotulo.textContent = visivel
                ? 'Ver menos paletas'
                : 'Ver mais paletas';
        }
    }

    function alternarPaletasExtras() {
        const botao = document.getElementById('btnAlternarPaletasExtras');
        const expandidoAtual = botao?.getAttribute('aria-expanded') === 'true';
        definirPaletasExtrasVisiveis(!expandidoAtual);
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

    function aplicarFonte(
        valor,
        { persistir = true, emitirEvento = true } = {},
    ) {
        const fonteAnterior = validarFonte(
            document.documentElement.dataset.font,
        );
        const fonte = validarFonte(valor);

        document.documentElement.dataset.font = fonte;
        atualizarControlesFonte(fonte);
        if (persistir) salvarFonte(fonte);

        if (emitirEvento && fonte !== fonteAnterior) {
            window.dispatchEvent(
                new CustomEvent('garimpu:fonte-alterada', {
                    detail: {
                        fonte,
                        fonteAnterior,
                    },
                }),
            );
        }

        return fonte;
    }

    function selecionarPaleta(valor) {
        return aplicarPaleta(valor);
    }

    function selecionarFonte(valor) {
        return aplicarFonte(valor);
    }

    function restaurarPaletaPadrao() {
        return aplicarPaleta(PALETA_PADRAO);
    }

    function restaurarFontePadrao() {
        return aplicarFonte(FONTE_PADRAO);
    }

    function restaurarAparenciaPadrao() {
        const paleta = aplicarPaleta(PALETA_PADRAO);
        const fonte = aplicarFonte(FONTE_PADRAO);
        return { paleta, fonte };
    }

    function inicializarTema() {
        const paletaInicial = lerPaletaSalva();
        aplicarPaleta(paletaInicial, {
            persistir: false,
            emitirEvento: false,
        });
        definirPaletasExtrasVisiveis(PALETAS_EXTRAS.includes(paletaInicial));

        const fonteInicial = lerFonteSalva();
        aplicarFonte(fonteInicial, {
            persistir: false,
            emitirEvento: false,
        });
    }

    window.selecionarPaleta = selecionarPaleta;
    window.restaurarPaletaPadrao = restaurarPaletaPadrao;
    window.alternarPaletasExtras = alternarPaletasExtras;
    window.selecionarFonte = selecionarFonte;
    window.restaurarFontePadrao = restaurarFontePadrao;
    window.restaurarAparenciaPadrao = restaurarAparenciaPadrao;
    window.garimpuTema = Object.freeze({
        aplicarPaleta,
        lerPaletaSalva,
        paletasValidas: PALETAS_VALIDAS,
        paletaPadrao: PALETA_PADRAO,
        aplicarFonte,
        lerFonteSalva,
        fontesValidas: FONTES_VALIDAS,
        fontePadrao: FONTE_PADRAO,
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarTema, {
            once: true,
        });
    } else {
        inicializarTema();
    }
})();
