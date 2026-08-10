const HISTORICO_MAXIMO = 500;

const historico = [];
const assinantes = new Set();
let proximoId = 1;
let interceptado = false;

function formatarArgumento(valor) {
  if (valor instanceof Error) return valor.stack || valor.message;
  if (typeof valor === "string") return valor;
  try {
    return JSON.stringify(valor);
  } catch (e) {
    return String(valor);
  }
}

function emitir(nivel, mensagem) {
  const entrada = {
    id: proximoId++,
    timestamp: new Date().toISOString(),
    nivel,
    mensagem,
  };

  historico.push(entrada);
  if (historico.length > HISTORICO_MAXIMO) historico.shift();

  assinantes.forEach((callback) => {
    try {
      callback(entrada);
    } catch (e) {
      // Um assinante com problema não deve derrubar o log original nem os
      // demais assinantes.
    }
  });

  return entrada;
}

function inscrever(callback) {
  assinantes.add(callback);
  return () => assinantes.delete(callback);
}

function obterHistorico() {
  return historico.slice();
}

// Reaproveita os console.log/info/warn/error já espalhados pelo scraper
// (booking.provider.js, expedia.provider.js, scraper.service.js etc.) em vez
// de reescrever cada chamada para emitir também pela interface. Sempre
// invoca a implementação original primeiro, então terminal/arquivo de log
// continuam funcionando exatamente como antes.
function interceptarConsole() {
  if (interceptado) return;
  interceptado = true;

  const niveisPorMetodo = { log: "info", info: "info", warn: "warn", error: "error" };

  for (const [metodo, nivel] of Object.entries(niveisPorMetodo)) {
    const original = console[metodo].bind(console);
    console[metodo] = (...argumentos) => {
      original(...argumentos);
      emitir(nivel, argumentos.map(formatarArgumento).join(" "));
    };
  }
}

module.exports = {
  interceptarConsole,
  emitir,
  inscrever,
  obterHistorico,
};
