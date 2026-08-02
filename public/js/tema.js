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
        'tempestade',
        'dimensao',
        'pulsar',
        'supernova',
        'noir',
        'oceano',
        'cyberpunk',
        'tempo',
        'virus',
        'multiverso',
    ]);

    const CHAVE_FILTRO_PALETA = 'garimpu-filtro-paleta';
    const PALETAS_ESTATICAS = Object.freeze([
        'dourado',
        'ametista',
        'esmeralda',
        'boreal',
    ]);

    const PALETAS_ESPECIAIS = Object.freeze([
        'cyberpunk',
        'tempo',
        'virus',
        'multiverso',
    ]);

    const CHAVE_FPS_TEMAS_ESPECIAIS = 'garimpu-fps-temas-especiais';
    const FPS_TEMAS_ESPECIAIS_PADRAO = 15;
    const FPS_TEMAS_ESPECIAIS_MINIMO = 5;
    const FPS_TEMAS_ESPECIAIS_MAXIMO = 30;

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

    function validarFpsTemasEspeciais(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return FPS_TEMAS_ESPECIAIS_PADRAO;
        return Math.min(
            FPS_TEMAS_ESPECIAIS_MAXIMO,
            Math.max(FPS_TEMAS_ESPECIAIS_MINIMO, Math.round(numero)),
        );
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

    function lerFpsTemasEspeciaisSalvo() {
        try {
            const salvo = localStorage.getItem(CHAVE_FPS_TEMAS_ESPECIAIS);
            return salvo === null
                ? FPS_TEMAS_ESPECIAIS_PADRAO
                : validarFpsTemasEspeciais(salvo);
        } catch {
            return FPS_TEMAS_ESPECIAIS_PADRAO;
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

    function salvarFpsTemasEspeciais(fps) {
        try {
            localStorage.setItem(CHAVE_FPS_TEMAS_ESPECIAIS, String(fps));
        } catch {
            // O valor continua válido durante a sessão sem bloquear a interface.
        }
    }

    function descricaoNivelFps(fps) {
        if (fps <= 10) return 'Econômico';
        if (fps <= 17) return 'Equilibrado';
        if (fps <= 24) return 'Suave';
        return 'Alto';
    }

    function atualizarControleFpsTemasEspeciais(fps) {
        const controle = document.getElementById('fpsTemasEspeciais');
        const valor = document.getElementById('valorFpsTemasEspeciais');
        const nivel = document.getElementById('nivelFpsTemasEspeciais');
        if (controle) controle.value = String(fps);
        if (valor) valor.textContent = `${fps} FPS`;
        if (nivel) nivel.textContent = descricaoNivelFps(fps);
    }

    function aplicarFpsTemasEspeciais(
        valor,
        { persistir = true, emitirEvento = true } = {},
    ) {
        const anterior = validarFpsTemasEspeciais(
            document.documentElement.dataset.specialThemeFps,
        );
        const fps = validarFpsTemasEspeciais(valor);
        document.documentElement.dataset.specialThemeFps = String(fps);
        atualizarControleFpsTemasEspeciais(fps);
        if (persistir) salvarFpsTemasEspeciais(fps);

        if (emitirEvento && fps !== anterior) {
            window.dispatchEvent(
                new CustomEvent('garimpu:fps-temas-especiais-alterado', {
                    detail: { fps, fpsAnterior: anterior },
                }),
            );
        }

        return fps;
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

    function validarCategoriaPaleta(valor) {
        return ['animada', 'estatica', 'especial'].includes(valor)
            ? valor
            : 'animada';
    }

    function categoriaDaPaleta(paleta) {
        if (PALETAS_ESPECIAIS.includes(paleta)) return 'especial';
        return PALETAS_ESTATICAS.includes(paleta) ? 'estatica' : 'animada';
    }

    function salvarFiltroPaleta(categoria) {
        try {
            localStorage.setItem(CHAVE_FILTRO_PALETA, categoria);
        } catch {
            // O filtro continua válido durante a sessão sem bloquear a interface.
        }
    }

    function definirFiltroPaletas(valor, { persistir = true } = {}) {
        const categoria = validarCategoriaPaleta(valor);

        document
            .querySelectorAll('[data-palette-categoria]')
            .forEach((opcao) => {
                opcao.hidden = opcao.dataset.paletteCategoria !== categoria;
            });

        const botaoAnimada = document.getElementById('btnFiltroPaletaAnimada');
        const botaoEstatica = document.getElementById('btnFiltroPaletaEstatica');
        const botaoEspecial = document.getElementById('btnFiltroPaletaEspecial');
        botaoAnimada?.setAttribute('aria-pressed', String(categoria === 'animada'));
        botaoEstatica?.setAttribute('aria-pressed', String(categoria === 'estatica'));
        botaoEspecial?.setAttribute('aria-pressed', String(categoria === 'especial'));

        if (persistir) salvarFiltroPaleta(categoria);
        return categoria;
    }

    function lerFiltroPaletaSalvo(paletaAtual) {
        try {
            const salvo = localStorage.getItem(CHAVE_FILTRO_PALETA);
            if (['animada', 'estatica', 'especial'].includes(salvo)) return salvo;
        } catch {
            // Sem storage disponível, o filtro é inferido pela paleta ativa.
        }
        return categoriaDaPaleta(paletaAtual);
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
        const fpsTemasEspeciais = aplicarFpsTemasEspeciais(FPS_TEMAS_ESPECIAIS_PADRAO);
        return { paleta, fonte, fpsTemasEspeciais };
    }

    function inicializarTema() {
        const paletaInicial = lerPaletaSalva();
        aplicarPaleta(paletaInicial, {
            persistir: false,
            emitirEvento: false,
        });
        definirFiltroPaletas(lerFiltroPaletaSalvo(paletaInicial), { persistir: false });

        const fonteInicial = lerFonteSalva();
        aplicarFonte(fonteInicial, {
            persistir: false,
            emitirEvento: false,
        });

        aplicarFpsTemasEspeciais(lerFpsTemasEspeciaisSalvo(), {
            persistir: false,
            emitirEvento: false,
        });
    }

    window.selecionarPaleta = selecionarPaleta;
    window.restaurarPaletaPadrao = restaurarPaletaPadrao;
    window.selecionarFonte = selecionarFonte;
    window.restaurarFontePadrao = restaurarFontePadrao;
    window.restaurarAparenciaPadrao = restaurarAparenciaPadrao;
    window.definirFpsTemasEspeciais = aplicarFpsTemasEspeciais;
    window.garimpuTema = Object.freeze({
        aplicarPaleta,
        lerPaletaSalva,
        paletasValidas: PALETAS_VALIDAS,
        paletaPadrao: PALETA_PADRAO,
        aplicarFonte,
        lerFonteSalva,
        fontesValidas: FONTES_VALIDAS,
        fontePadrao: FONTE_PADRAO,
        definirFiltroPaletas,
        aplicarFpsTemasEspeciais,
        lerFpsTemasEspeciaisSalvo,
        fpsTemasEspeciaisPadrao: FPS_TEMAS_ESPECIAIS_PADRAO,
        fpsTemasEspeciaisMinimo: FPS_TEMAS_ESPECIAIS_MINIMO,
        fpsTemasEspeciaisMaximo: FPS_TEMAS_ESPECIAIS_MAXIMO,
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarTema, {
            once: true,
        });
    } else {
        inicializarTema();
    }
})();
