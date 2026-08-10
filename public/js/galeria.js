const FOTOS_POR_PAGINA_RESULTADO = 12;
const FOTOS_POR_PAGINA_BIBLIOTECA = 16;
const FILTRO_TODAS_FOTOS = '__todas_fotos__';
const FILTRO_TODOS_HOTEIS = '__todos_hoteis__';
const FILTRO_TODAS_PASTAS_MAE = '__todas_pastas_mae__';
const FILTRO_SEM_PASTA_MAE = '__sem_pasta_mae__';

let estadoGaleriaResultado = {
    fotos: [],
    pagina: 1,
};

let estadoBibliotecaFotos = {
    hoteis: [],
    fotos: [],
    pagina: 1,
    filtroHotel: FILTRO_TODAS_FOTOS,
    filtroPastaMae: FILTRO_TODAS_PASTAS_MAE,
    pesquisa: '',
};

function normalizarPesquisaBiblioteca(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .trim();
}

function correspondePesquisaBiblioteca(item, campos) {
    if (!estadoBibliotecaFotos.pesquisa) return true;
    return normalizarPesquisaBiblioteca(
        campos.map((campo) => item[campo]).filter(Boolean).join(' ')
    ).includes(estadoBibliotecaFotos.pesquisa);
}

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

function criarCardFoto({ url, nome, textoAlternativo, detalhe, acoes }) {
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

    if (acoes) {
        const containerAcoes = document.createElement('div');
        containerAcoes.className = 'catalog-photo-actions';

        const botaoRenomear = document.createElement('button');
        botaoRenomear.type = 'button';
        botaoRenomear.className = 'catalog-photo-action';
        botaoRenomear.textContent = 'Renomear';
        botaoRenomear.addEventListener('click', acoes.renomear);

        const botaoExcluir = document.createElement('button');
        botaoExcluir.type = 'button';
        botaoExcluir.className =
            'catalog-photo-action catalog-photo-action-danger';
        botaoExcluir.textContent = 'Excluir';
        botaoExcluir.addEventListener('click', acoes.excluir);

        containerAcoes.append(botaoRenomear, botaoExcluir);
        metadados.appendChild(containerAcoes);
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

function obterChavePastaMae(hotel) {
    return hotel.pastaMae || FILTRO_SEM_PASTA_MAE;
}

function hotelPertencePastaMaeSelecionada(hotel) {
    return estadoBibliotecaFotos.filtroPastaMae === FILTRO_TODAS_PASTAS_MAE ||
        obterChavePastaMae(hotel) === estadoBibliotecaFotos.filtroPastaMae;
}

function preencherFiltroPastasMae(hoteis) {
    const seletor = document.getElementById('filtroPastaMaeBiblioteca');
    const pastasMae = Array.from(new Set(
        hoteis.map((hotel) => hotel.pastaMae).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

    seletor.replaceChildren();
    const todas = document.createElement('option');
    todas.value = FILTRO_TODAS_PASTAS_MAE;
    todas.textContent = 'Todas as pastas-mãe';
    seletor.appendChild(todas);

    pastasMae.forEach((pastaMae) => {
        const quantidade = hoteis.filter(
            (hotel) => hotel.pastaMae === pastaMae
        ).length;
        const opcao = document.createElement('option');
        opcao.value = pastaMae;
        opcao.textContent = pastaMae + ' (' + quantidade + ')';
        seletor.appendChild(opcao);
    });

    if (hoteis.some((hotel) => !hotel.pastaMae)) {
        const semPastaMae = document.createElement('option');
        semPastaMae.value = FILTRO_SEM_PASTA_MAE;
        semPastaMae.textContent = 'Sem pasta-mãe';
        seletor.appendChild(semPastaMae);
    }
    seletor.value = estadoBibliotecaFotos.filtroPastaMae;
}

function preencherFiltroHoteis(hoteis) {
    const seletor = document.getElementById('filtroHotelBiblioteca');
    seletor.replaceChildren();

    const todasFotos = document.createElement('option');
    todasFotos.value = FILTRO_TODAS_FOTOS;
    todasFotos.textContent = 'Todas as fotos';
    seletor.appendChild(todasFotos);

    const todosHoteis = document.createElement('option');
    todosHoteis.value = FILTRO_TODOS_HOTEIS;
    todosHoteis.textContent = 'Todos os hotéis';
    seletor.appendChild(todosHoteis);

    hoteis.filter(hotelPertencePastaMaeSelecionada).forEach((hotel) => {
        const opcao = document.createElement('option');
        opcao.value = obterChaveHotel(hotel);
        opcao.textContent = hotel.nome + ' (' + hotel.totalImagens + ')';
        seletor.appendChild(opcao);
    });
    seletor.value = estadoBibliotecaFotos.filtroHotel;
}

function obterFotosBibliotecaFiltradas() {
    let fotos = estadoBibliotecaFotos.fotos.filter((foto) =>
        estadoBibliotecaFotos.filtroPastaMae === FILTRO_TODAS_PASTAS_MAE ||
        foto.chavePastaMae === estadoBibliotecaFotos.filtroPastaMae
    );
    if (estadoBibliotecaFotos.filtroHotel === FILTRO_TODOS_HOTEIS) {
        return [];
    }
    if (estadoBibliotecaFotos.filtroHotel !== FILTRO_TODAS_FOTOS) {
        fotos = fotos.filter(
            (foto) => foto.chaveHotel === estadoBibliotecaFotos.filtroHotel
        );
    }

    return fotos.filter((foto) =>
        correspondePesquisaBiblioteca(
            foto,
            ['hotel', 'nome', 'categoria', 'caminho', 'chaveHotel']
        )
    );
}

function obterPastasBibliotecaFiltradas() {
    return estadoBibliotecaFotos.hoteis.filter((hotel) => {
        if (!hotel.pasta) return false;
        if (!hotelPertencePastaMaeSelecionada(hotel)) return false;
        if (correspondePesquisaBiblioteca(hotel, ['nome', 'pasta'])) return true;
        return Array.isArray(hotel.imagens) && hotel.imagens.some((foto) =>
            correspondePesquisaBiblioteca(foto, ['nome', 'categoria', 'caminho'])
        );
    });
}

function criarCardPastaHotel(hotel) {
    const card = document.createElement('article');
    card.className = 'catalog-photo catalog-folder';

    if (hotel.imagemCapa) {
        const imagem = document.createElement('img');
        imagem.src = hotel.imagemCapa;
        imagem.alt = 'Capa da pasta ' + hotel.nome;
        imagem.loading = 'lazy';
        card.appendChild(imagem);
    }

    const metadados = document.createElement('div');
    metadados.className = 'catalog-photo-meta';

    const tipo = document.createElement('span');
    tipo.className = 'catalog-folder-type';
    tipo.textContent = 'Pasta do hotel';

    const nome = document.createElement('strong');
    nome.className = 'catalog-folder-name';
    nome.textContent = hotel.nome;
    nome.title = hotel.nome;

    const quantidade = document.createElement('span');
    quantidade.textContent =
        hotel.totalImagens +
        (hotel.totalImagens === 1 ? ' foto' : ' fotos');

    const abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.className = 'catalog-folder-open';
    abrir.textContent = 'Abrir pasta';
    abrir.addEventListener('click', () => abrirPastaHotel(hotel));

    metadados.append(tipo, nome, quantidade, abrir);
    card.appendChild(metadados);
    return card;
}

function abrirPastaHotel(hotel) {
    const chave = obterChaveHotel(hotel);
    document.getElementById('filtroHotelBiblioteca').value = chave;
    filtrarBibliotecaFotos(chave);
}

function renderizarPaginaBibliotecaFotos() {
    const grid = document.getElementById('bibliotecaFotosGrid');
    const vazio = document.getElementById('bibliotecaFotosVazia');
    const exibindoPastas =
        estadoBibliotecaFotos.filtroHotel === FILTRO_TODOS_HOTEIS;
    const pastas = exibindoPastas ? obterPastasBibliotecaFiltradas() : [];
    const fotos = obterFotosBibliotecaFiltradas();
    const itens = exibindoPastas ? pastas : fotos;
    const totalPaginas = Math.max(
        1,
        Math.ceil(itens.length / FOTOS_POR_PAGINA_BIBLIOTECA)
    );
    estadoBibliotecaFotos.pagina = Math.min(
        Math.max(estadoBibliotecaFotos.pagina, 1),
        totalPaginas
    );
    grid.replaceChildren();

    const itensPagina = obterFatiaPagina(
        itens,
        estadoBibliotecaFotos.pagina,
        FOTOS_POR_PAGINA_BIBLIOTECA
    );
    if (exibindoPastas) {
        itensPagina.forEach((hotel) => {
            grid.appendChild(criarCardPastaHotel(hotel));
        });
    } else {
        itensPagina.forEach((foto) => {
            grid.appendChild(criarCardFoto({
                url: foto.url,
                nome: foto.nome,
                textoAlternativo: 'Foto de ' + foto.hotel,
                detalhe: foto.hotel + ' • ' + foto.categoria,
                acoes: {
                    renomear: () => renomearFotoBiblioteca(foto),
                    excluir: () => excluirFotoBiblioteca(foto),
                },
            }));
        });
    }

    vazio.textContent = estadoBibliotecaFotos.pesquisa
        ? 'Nenhum resultado encontrado para esta pesquisa.'
        : exibindoPastas
            ? 'Nenhuma pasta de hotel foi encontrada.'
            : 'Nenhuma foto foi encontrada na pasta configurada.';
    vazio.classList.toggle('hidden', itens.length > 0);

    const resultadoPesquisa = document.getElementById('resultadoPesquisaBiblioteca');
    if (resultadoPesquisa) {
        resultadoPesquisa.textContent = estadoBibliotecaFotos.pesquisa
            ? itens.length + (itens.length === 1 ? ' resultado' : ' resultados')
            : '';
    }
    atualizarControlesPaginacao({
        containerId: 'paginacaoBibliotecaFotos',
        textoId: 'paginaAtualBiblioteca',
        anteriorId: 'btnPaginaAnteriorBiblioteca',
        proximaId: 'btnProximaPaginaBiblioteca',
        pagina: estadoBibliotecaFotos.pagina,
        totalItens: itens.length,
        tamanhoPagina: FOTOS_POR_PAGINA_BIBLIOTECA,
    });
}

function renderizarBibliotecaFotos(dados, { preservarFiltro = false } = {}) {
    const hoteis = Array.isArray(dados.hoteis) ? dados.hoteis : [];
    const filtroAnterior = estadoBibliotecaFotos.filtroHotel;
    const filtroPastaMaeAnterior = estadoBibliotecaFotos.filtroPastaMae;
    const filtrosFixos = [FILTRO_TODAS_FOTOS, FILTRO_TODOS_HOTEIS];
    estadoBibliotecaFotos.hoteis = hoteis;
    const chavesPastasMae = new Set(hoteis.map(obterChavePastaMae));
    estadoBibliotecaFotos.filtroPastaMae =
        preservarFiltro && (
            filtroPastaMaeAnterior === FILTRO_TODAS_PASTAS_MAE ||
            chavesPastasMae.has(filtroPastaMaeAnterior)
        )
            ? filtroPastaMaeAnterior
            : FILTRO_TODAS_PASTAS_MAE;
    estadoBibliotecaFotos.filtroHotel =
        preservarFiltro &&
        (
            filtrosFixos.includes(filtroAnterior) ||
            hoteis.some(
                (hotel) =>
                    obterChaveHotel(hotel) === filtroAnterior &&
                    (
                        estadoBibliotecaFotos.filtroPastaMae ===
                            FILTRO_TODAS_PASTAS_MAE ||
                        obterChavePastaMae(hotel) ===
                            estadoBibliotecaFotos.filtroPastaMae
                    )
            )
        )
            ? filtroAnterior
            : FILTRO_TODAS_FOTOS;
    estadoBibliotecaFotos.pagina = 1;
    estadoBibliotecaFotos.fotos = hoteis.flatMap((hotel) =>
        hotel.imagens.map((foto) => ({
            ...foto,
            hotel: hotel.nome,
            chaveHotel: obterChaveHotel(hotel),
            pastaMae: hotel.pastaMae || '',
            chavePastaMae: obterChavePastaMae(hotel),
        }))
    );

    preencherFiltroPastasMae(hoteis);
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
    atualizarBotaoExcluirPasta();
    renderizarPaginaBibliotecaFotos();
}

function filtrarPastaMaeBiblioteca(chavePastaMae) {
    estadoBibliotecaFotos.filtroPastaMae = chavePastaMae;
    const hotelSelecionado = estadoBibliotecaFotos.hoteis.find(
        (hotel) => obterChaveHotel(hotel) === estadoBibliotecaFotos.filtroHotel
    );
    if (hotelSelecionado && !hotelPertencePastaMaeSelecionada(hotelSelecionado)) {
        estadoBibliotecaFotos.filtroHotel = FILTRO_TODAS_FOTOS;
    }
    estadoBibliotecaFotos.pagina = 1;
    preencherFiltroHoteis(estadoBibliotecaFotos.hoteis);
    atualizarBotaoExcluirPasta();
    renderizarPaginaBibliotecaFotos();
}

function atualizarBotaoExcluirPasta() {
    const botao = document.getElementById('btnExcluirPastaHotel');
    const hotel = estadoBibliotecaFotos.hoteis.find(
        (item) => obterChaveHotel(item) === estadoBibliotecaFotos.filtroHotel
    );
    botao.classList.toggle('hidden', !hotel || !hotel.pasta);
    botao.disabled = false;
}

function definirStatusBiblioteca(mensagem, erro = false) {
    const status = document.getElementById('statusBibliotecaFotos');
    status.textContent = mensagem;
    status.className = erro
        ? 'app-status-danger text-sm'
        : 'app-status-success text-sm';
}

async function chamarAcaoGaleria(url, method, body) {
    const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const dados = await lerRespostaJsonGaleria(response, url);
    if (!response.ok) {
        throw new Error(dados.erro || 'Não foi possível concluir a ação.');
    }
    return dados;
}

function pesquisarBibliotecaFotos(valor) {
    estadoBibliotecaFotos.pesquisa = normalizarPesquisaBiblioteca(valor);
    estadoBibliotecaFotos.pagina = 1;
    document.getElementById('btnLimparPesquisaBiblioteca')?.classList.toggle(
        'hidden',
        !estadoBibliotecaFotos.pesquisa
    );
    renderizarPaginaBibliotecaFotos();
}

function limparPesquisaBibliotecaFotos() {
    const campo = document.getElementById('pesquisaBibliotecaFotos');
    if (campo) {
        campo.value = '';
        campo.focus();
    }
    pesquisarBibliotecaFotos('');
}

async function lerRespostaJsonGaleria(response, url) {
    const texto = await response.text();
    try {
        return JSON.parse(texto);
    } catch (_) {
        throw new Error(
            'A API da galeria respondeu conteúdo inválido em ' + url +
            '. Feche outras instâncias do aplicativo e reinicie o servidor.'
        );
    }
}

async function renomearFotoBiblioteca(foto) {
    const extensao = foto.nome.includes('.')
        ? foto.nome.slice(foto.nome.lastIndexOf('.'))
        : '';
    const nomeAtual = extensao
        ? foto.nome.slice(0, -extensao.length)
        : foto.nome;
    const novoNome = window.prompt(
        'Novo nome da foto (a extensão será preservada):',
        nomeAtual
    );

    if (novoNome === null || novoNome.trim() === '') return;

    try {
        const dados = await chamarAcaoGaleria(
            '/api/galeria/foto',
            'PATCH',
            { caminho: foto.caminho, novoNome }
        );
        await carregarBibliotecaFotos({ silencioso: true });
        definirStatusBiblioteca(dados.mensagem);
    } catch (erro) {
        definirStatusBiblioteca('Erro: ' + erro.message, true);
    }
}

async function excluirFotoBiblioteca(foto) {
    if (!window.confirm(`Excluir definitivamente a foto "${foto.nome}"?`)) {
        return;
    }

    try {
        const dados = await chamarAcaoGaleria(
            '/api/galeria/foto',
            'DELETE',
            { caminho: foto.caminho }
        );
        await carregarBibliotecaFotos({ silencioso: true });
        definirStatusBiblioteca(dados.mensagem);
    } catch (erro) {
        definirStatusBiblioteca('Erro: ' + erro.message, true);
    }
}

async function excluirPastaHotelSelecionada() {
    const hotel = estadoBibliotecaFotos.hoteis.find(
        (item) => obterChaveHotel(item) === estadoBibliotecaFotos.filtroHotel
    );
    if (!hotel || !hotel.pasta) return;

    const confirmou = window.confirm(
        `Excluir definitivamente a pasta "${hotel.nome}" e todas as ` +
        `${hotel.totalImagens} foto(s) contidas nela?`
    );
    if (!confirmou) return;

    const botao = document.getElementById('btnExcluirPastaHotel');
    botao.disabled = true;
    try {
        const dados = await chamarAcaoGaleria(
            '/api/galeria/hotel',
            'DELETE',
            { pasta: hotel.pasta }
        );
        await carregarBibliotecaFotos({ silencioso: true });
        definirStatusBiblioteca(dados.mensagem);
    } catch (erro) {
        definirStatusBiblioteca('Erro: ' + erro.message, true);
        botao.disabled = false;
    }
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
        status.className = 'app-text-muted text-sm';
    }

    try {
        const response = await fetch('/api/galeria-hoteis');
        const dados = await lerRespostaJsonGaleria(
            response,
            '/api/galeria-hoteis'
        );
        if (!response.ok) {
            throw new Error(dados.erro || 'Falha ao carregar a biblioteca.');
        }

        renderizarBibliotecaFotos(dados, { preservarFiltro: silencioso });
        atualizarBotaoExcluirPasta();
        status.textContent = dados.totalImagens > 0
            ? 'Biblioteca atualizada.'
            : 'A pasta configurada ainda não contém fotos.';
        status.className = dados.totalImagens > 0
            ? 'app-status-success text-sm'
            : 'app-text-muted text-sm';
    } catch (erro) {
        status.textContent = 'Erro: ' + erro.message;
        status.className = 'app-status-danger text-sm';
    } finally {
        botao.disabled = false;
    }
}

carregarBibliotecaFotos();
