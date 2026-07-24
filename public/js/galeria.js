const FOTOS_POR_PAGINA_RESULTADO = 12;
const FOTOS_POR_PAGINA_BIBLIOTECA = 16;

let estadoGaleriaResultado = {
    fotos: [],
    pagina: 1,
};

let estadoBibliotecaFotos = {
    hoteis: [],
    fotos: [],
    pagina: 1,
    filtroHotel: '',
};

function obterNomeArquivoFoto(url, indice = 0) {
    try {
        const caminho = new URL(url, window.location.origin).pathname;
        return decodeURIComponent(caminho.split('/').pop()) ||
            'foto_' + (indice + 1);
    } catch (_) {
        return 'foto_' + (indice + 1);
    }
}

function criarLinkFoto(url, nome) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = nome;
    link.title = 'Abrir ' + nome;
    return link;
}

function criarCardFoto({ url, nome, textoAlternativo, detalhe }) {
    const card = document.createElement('article');
    card.className = 'catalog-photo';

    const imagem = document.createElement('img');
    imagem.src = url;
    imagem.alt = textoAlternativo || nome;
    imagem.loading = 'lazy';
    card.appendChild(imagem);

    const metadados = document.createElement('div');
    metadados.className = 'catalog-photo-meta';
    metadados.appendChild(criarLinkFoto(url, nome));

    if (detalhe) {
        const descricao = document.createElement('span');
        descricao.textContent = detalhe;
        descricao.title = detalhe;
        metadados.appendChild(descricao);
    }

    card.appendChild(metadados);
    return card;
}

function obterFatiaPagina(itens, pagina, tamanhoPagina) {
    const inicio = (pagina - 1) * tamanhoPagina;
    return itens.slice(inicio, inicio + tamanhoPagina);
}

function atualizarControlesPaginacao({
    containerId,
    textoId,
    anteriorId,
    proximaId,
    pagina,
    totalItens,
    tamanhoPagina,
}) {
    const totalPaginas = Math.max(1, Math.ceil(totalItens / tamanhoPagina));
    const container = document.getElementById(containerId);

    container.classList.toggle('hidden', totalPaginas <= 1);
    document.getElementById(textoId).textContent =
        'Página ' + pagina + ' de ' + totalPaginas;
    document.getElementById(anteriorId).disabled = pagina <= 1;
    document.getElementById(proximaId).disabled = pagina >= totalPaginas;
}

function renderizarPaginaGaleriaResultado() {
    const grid = document.getElementById('galeriaGrid');
    const totalPaginas = Math.max(
        1,
        Math.ceil(
            estadoGaleriaResultado.fotos.length /
            FOTOS_POR_PAGINA_RESULTADO
        )
    );
    estadoGaleriaResultado.pagina = Math.min(
        Math.max(estadoGaleriaResultado.pagina, 1),
        totalPaginas
    );
    grid.replaceChildren();

    const fotosPagina = obterFatiaPagina(
        estadoGaleriaResultado.fotos,
        estadoGaleriaResultado.pagina,
        FOTOS_POR_PAGINA_RESULTADO
    );
    fotosPagina.forEach((foto) => {
        grid.appendChild(criarCardFoto(foto));
    });

    atualizarControlesPaginacao({
        containerId: 'paginacaoGaleriaResultado',
        textoId: 'paginaAtualGaleriaResultado',
        anteriorId: 'btnPaginaAnteriorResultado',
        proximaId: 'btnProximaPaginaResultado',
        pagina: estadoGaleriaResultado.pagina,
        totalItens: estadoGaleriaResultado.fotos.length,
        tamanhoPagina: FOTOS_POR_PAGINA_RESULTADO,
    });
}

function renderizarGaleriaResultado(imagens, altTexts = {}) {
    const fotos = Array.isArray(imagens) ? imagens : [];
    estadoGaleriaResultado = {
        pagina: 1,
        fotos: fotos.map((url, indice) => {
            const nome = obterNomeArquivoFoto(url, indice);
            const legenda = altTexts && altTexts[nome]
                ? String(altTexts[nome])
                : 'Imagem do hotel';
            return {
                url,
                nome,
                textoAlternativo: legenda,
                detalhe: legenda,
            };
        }),
    };
    renderizarPaginaGaleriaResultado();
}

function mudarPaginaGaleriaResultado(direcao) {
    estadoGaleriaResultado.pagina += direcao;
    renderizarPaginaGaleriaResultado();
    document.getElementById('galeriaGrid')
        .scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function obterImagensGaleriaResultado() {
    return estadoGaleriaResultado.fotos.map((foto) => foto.url);
}

function obterChaveHotel(hotel) {
    return hotel.pasta || '__imagens_soltas__';
}

function preencherFiltroHoteis(hoteis) {
    const seletor = document.getElementById('filtroHotelBiblioteca');
    seletor.replaceChildren();

    const todos = document.createElement('option');
    todos.value = '';
    todos.textContent = 'Todos os hotéis';
    seletor.appendChild(todos);

    hoteis.forEach((hotel) => {
        const opcao = document.createElement('option');
        opcao.value = obterChaveHotel(hotel);
        opcao.textContent = hotel.nome + ' (' + hotel.totalImagens + ')';
        seletor.appendChild(opcao);
    });
    seletor.value = estadoBibliotecaFotos.filtroHotel;
}

function obterFotosBibliotecaFiltradas() {
    if (!estadoBibliotecaFotos.filtroHotel) {
        return estadoBibliotecaFotos.fotos;
    }
    return estadoBibliotecaFotos.fotos.filter(
        (foto) => foto.chaveHotel === estadoBibliotecaFotos.filtroHotel
    );
}

function renderizarPaginaBibliotecaFotos() {
    const grid = document.getElementById('bibliotecaFotosGrid');
    const vazio = document.getElementById('bibliotecaFotosVazia');
    const fotos = obterFotosBibliotecaFiltradas();
    const totalPaginas = Math.max(
        1,
        Math.ceil(fotos.length / FOTOS_POR_PAGINA_BIBLIOTECA)
    );
    estadoBibliotecaFotos.pagina = Math.min(
        Math.max(estadoBibliotecaFotos.pagina, 1),
        totalPaginas
    );
    grid.replaceChildren();

    obterFatiaPagina(
        fotos,
        estadoBibliotecaFotos.pagina,
        FOTOS_POR_PAGINA_BIBLIOTECA
    ).forEach((foto) => {
        grid.appendChild(criarCardFoto({
            url: foto.url,
            nome: foto.nome,
            textoAlternativo: 'Foto de ' + foto.hotel,
            detalhe: foto.hotel + ' • ' + foto.categoria,
        }));
    });

    vazio.classList.toggle('hidden', fotos.length > 0);
    atualizarControlesPaginacao({
        containerId: 'paginacaoBibliotecaFotos',
        textoId: 'paginaAtualBiblioteca',
        anteriorId: 'btnPaginaAnteriorBiblioteca',
        proximaId: 'btnProximaPaginaBiblioteca',
        pagina: estadoBibliotecaFotos.pagina,
        totalItens: fotos.length,
        tamanhoPagina: FOTOS_POR_PAGINA_BIBLIOTECA,
    });
}

function renderizarBibliotecaFotos(dados) {
    const hoteis = Array.isArray(dados.hoteis) ? dados.hoteis : [];
    estadoBibliotecaFotos.hoteis = hoteis;
    estadoBibliotecaFotos.filtroHotel = '';
    estadoBibliotecaFotos.pagina = 1;
    estadoBibliotecaFotos.fotos = hoteis.flatMap((hotel) =>
        hotel.imagens.map((foto) => ({
            ...foto,
            hotel: hotel.nome,
            chaveHotel: obterChaveHotel(hotel),
        }))
    );

    preencherFiltroHoteis(hoteis);
    renderizarPaginaBibliotecaFotos();
    document.getElementById('resumoBibliotecaFotos').textContent =
        dados.totalHoteis + (dados.totalHoteis === 1 ? ' hotel' : ' hotéis') +
        ' • ' +
        dados.totalImagens + (dados.totalImagens === 1 ? ' foto' : ' fotos');
}

function filtrarBibliotecaFotos(chaveHotel) {
    estadoBibliotecaFotos.filtroHotel = chaveHotel;
    estadoBibliotecaFotos.pagina = 1;
    renderizarPaginaBibliotecaFotos();
}

function mudarPaginaBiblioteca(direcao) {
    estadoBibliotecaFotos.pagina += direcao;
    renderizarPaginaBibliotecaFotos();
    document.getElementById('bibliotecaFotosGrid')
        .scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function carregarBibliotecaFotos({ silencioso = false } = {}) {
    const botao = document.getElementById('btnAtualizarBiblioteca');
    const status = document.getElementById('statusBibliotecaFotos');

    botao.disabled = true;
    if (!silencioso) {
        status.textContent = 'Carregando fotos salvas...';
        status.className = 'text-sm text-slate-400';
    }

    try {
        const response = await fetch('/api/galeria-hoteis');
        const dados = await response.json();
        if (!response.ok) {
            throw new Error(dados.erro || 'Falha ao carregar a biblioteca.');
        }

        renderizarBibliotecaFotos(dados);
        status.textContent = dados.totalImagens > 0
            ? 'Biblioteca atualizada.'
            : 'A pasta configurada ainda não contém fotos.';
        status.className = dados.totalImagens > 0
            ? 'text-sm text-emerald-400'
            : 'text-sm text-slate-400';
    } catch (erro) {
        status.textContent = 'Erro: ' + erro.message;
        status.className = 'text-sm text-red-400';
    } finally {
        botao.disabled = false;
    }
}

carregarBibliotecaFotos();
