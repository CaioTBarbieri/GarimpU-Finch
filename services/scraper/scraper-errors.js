class ScraperError extends Error {
  constructor(mensagem, opcoes = {}) {
    super(mensagem);
    this.name = this.constructor.name;
    this.tipo = opcoes.tipo || "processamento";
    if (opcoes.causa) this.causa = opcoes.causa;
  }
}

// Entrada inválida do usuário: nunca deve acionar o fallback Booking -> Expedia.
class ErroEntrada extends ScraperError {
  constructor(mensagem, opcoes = {}) {
    super(mensagem, { ...opcoes, tipo: "entrada" });
  }
}

// Falha da fonte de dados (Booking ou Expedia): pode acionar o fallback.
class ErroFonte extends ScraperError {
  constructor(mensagem, opcoes = {}) {
    super(mensagem, { ...opcoes, tipo: "fonte" });
    this.fonte = opcoes.fonte || null;
    this.acionaFallback = opcoes.acionaFallback !== false;
  }
}

// Erro interno de processamento não relacionado à fonte pesquisada.
class ErroProcessamento extends ScraperError {
  constructor(mensagem, opcoes = {}) {
    super(mensagem, { ...opcoes, tipo: "processamento" });
  }
}

// Falha ao gravar dados/imagens em disco depois que o hotel já foi encontrado.
class ErroArmazenamento extends ScraperError {
  constructor(mensagem, opcoes = {}) {
    super(mensagem, { ...opcoes, tipo: "armazenamento" });
  }
}

class ErroCancelamento extends ErroEntrada {
  constructor(mensagem = "Operação cancelada.", opcoes = {}) {
    super(mensagem, opcoes);
  }
}

function ehErroFonte(erro) {
  return erro instanceof ErroFonte;
}

function ehErroQueAcionaFallback(erro) {
  return ehErroFonte(erro) && erro.acionaFallback !== false;
}

module.exports = {
  ScraperError,
  ErroEntrada,
  ErroFonte,
  ErroProcessamento,
  ErroArmazenamento,
  ErroCancelamento,
  ehErroFonte,
  ehErroQueAcionaFallback,
};
