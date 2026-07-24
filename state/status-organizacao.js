function criarEstadoInicial() {
  return {
    estado: "ocioso",
    etapa: null,
    mensagem: "Aguardando início da organização.",
    hotel: null,
    imagem: null,
    imagemAtual: 0,
    totalImagens: 0,
    inicioProcessamento: null,
    inicioProcessamentoImagens: null,
    fimProcessamento: null,
    tempoDecorridoSegundos: 0,
    tempoMedioPorImagemSegundos: null,
    tempoEstimadoRestanteSegundos: null,
    previsaoTermino: null,
    imagensProcessadasGeral: 0,
    totalImagensGeral: 0,
    imagensPendentesGeral: 0,
    temposRecentesImagens: [],
    historicoMensagens: [],
  };
}

function criarControleStatus({ agora = Date.now } = {}) {
  let estadoAtual = criarEstadoInicial();
  let ultimaConclusaoImagem = null;

  function registrarMensagem(mensagem) {
    if (typeof mensagem !== "string" || !mensagem.trim()) return;
    estadoAtual.historicoMensagens.push(mensagem);
    estadoAtual.historicoMensagens =
      estadoAtual.historicoMensagens.slice(-10);
  }

  function atualizarTempoDecorrido(instanteFinal = agora()) {
    if (estadoAtual.inicioProcessamento === null) return;
    estadoAtual.tempoDecorridoSegundos = Math.max(
      Math.floor(
        (instanteFinal - estadoAtual.inicioProcessamento) / 1000,
      ),
      0,
    );
  }

  function reiniciarEstado(instanteInicial = agora()) {
    estadoAtual = {
      ...criarEstadoInicial(),
      estado: "processando",
      etapa: "iniciando",
      mensagem: "Iniciando organização e carregamento dos modelos.",
      inicioProcessamento: instanteInicial,
    };
    ultimaConclusaoImagem = null;
    registrarMensagem(estadoAtual.mensagem);
  }

  function recalcularEstimativa(instanteAtual) {
    if (
      estadoAtual.imagensProcessadasGeral < 2 ||
      estadoAtual.temposRecentesImagens.length === 0
    ) {
      estadoAtual.tempoMedioPorImagemSegundos = null;
      estadoAtual.tempoEstimadoRestanteSegundos = null;
      estadoAtual.previsaoTermino = null;
      return;
    }

    const soma = estadoAtual.temposRecentesImagens.reduce(
      (total, tempo) => total + tempo,
      0,
    );
    estadoAtual.tempoMedioPorImagemSegundos =
      soma / estadoAtual.temposRecentesImagens.length;
    estadoAtual.tempoEstimadoRestanteSegundos =
      estadoAtual.tempoMedioPorImagemSegundos *
      estadoAtual.imagensPendentesGeral;
    estadoAtual.previsaoTermino =
      instanteAtual +
      estadoAtual.tempoEstimadoRestanteSegundos * 1000;
  }

  function atualizarDadosPython(dados, instanteAtual = agora()) {
    const historicoMensagens = estadoAtual.historicoMensagens;
    Object.assign(estadoAtual, dados);
    estadoAtual.historicoMensagens = historicoMensagens;
    registrarMensagem(dados.mensagem);

    if (
      dados.etapa === "processamento_imagens_iniciado" &&
      estadoAtual.inicioProcessamentoImagens === null
    ) {
      estadoAtual.inicioProcessamentoImagens = instanteAtual;
    }

    if (dados.etapa === "arquivo_concluido") {
      if (ultimaConclusaoImagem !== null) {
        const tempoImagemSegundos =
          (instanteAtual - ultimaConclusaoImagem) / 1000;
        if (
          Number.isFinite(tempoImagemSegundos) &&
          tempoImagemSegundos > 0
        ) {
          estadoAtual.temposRecentesImagens.push(
            tempoImagemSegundos,
          );
          estadoAtual.temposRecentesImagens =
            estadoAtual.temposRecentesImagens.slice(-10);
        }
      }
      ultimaConclusaoImagem = instanteAtual;
      recalcularEstimativa(instanteAtual);
    }

    atualizarTempoDecorrido(instanteAtual);
  }

  function finalizarConcluido(instanteFinal = agora()) {
    estadoAtual.estado = "concluido";
    estadoAtual.etapa = "concluido";
    estadoAtual.mensagem = "Organização concluída.";
    estadoAtual.fimProcessamento = instanteFinal;
    estadoAtual.tempoEstimadoRestanteSegundos = 0;
    estadoAtual.previsaoTermino = instanteFinal;
    estadoAtual.imagensPendentesGeral = 0;
    registrarMensagem(estadoAtual.mensagem);
    atualizarTempoDecorrido(instanteFinal);
  }

  function finalizarErro(mensagem, instanteFinal = agora()) {
    estadoAtual.estado = "erro";
    estadoAtual.etapa = "erro";
    estadoAtual.mensagem = mensagem;
    estadoAtual.fimProcessamento = instanteFinal;
    registrarMensagem(mensagem);
    atualizarTempoDecorrido(instanteFinal);
  }

  function obterEstado() {
    if (
      estadoAtual.estado === "processando" &&
      estadoAtual.inicioProcessamento !== null
    ) {
      atualizarTempoDecorrido(agora());
    }
    return structuredClone(estadoAtual);
  }

  return {
    criarEstadoInicial,
    reiniciarEstado,
    atualizarDadosPython,
    atualizarTempoDecorrido,
    finalizarConcluido,
    finalizarErro,
    obterEstado,
  };
}

const controleStatus = criarControleStatus();

module.exports = {
  criarEstadoInicial,
  criarControleStatus,
  reiniciarEstado: controleStatus.reiniciarEstado,
  atualizarDadosPython: controleStatus.atualizarDadosPython,
  atualizarTempoDecorrido: controleStatus.atualizarTempoDecorrido,
  finalizarConcluido: controleStatus.finalizarConcluido,
  finalizarErro: controleStatus.finalizarErro,
  obterEstado: controleStatus.obterEstado,
};
