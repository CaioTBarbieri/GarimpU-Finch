function selecionarAba(nomeAba) {
    const nomesValidos = ['pesquisa', 'fotos', 'ia', 'configuracoes'];
    const abaAtiva = nomesValidos.includes(nomeAba) ? nomeAba : 'pesquisa';

    document.querySelectorAll('[data-tab-panel]').forEach((painel) => {
        painel.hidden = painel.dataset.tabPanel !== abaAtiva;
    });

    document.querySelectorAll('[data-tab-button]').forEach((botao) => {
        botao.setAttribute(
            'aria-pressed',
            String(botao.dataset.tabButton === abaAtiva)
        );
    });

    if (typeof atualizarVisibilidadeCsvGlobal === 'function') {
        atualizarVisibilidadeCsvGlobal(abaAtiva);
    }
}

selecionarAba('pesquisa');
