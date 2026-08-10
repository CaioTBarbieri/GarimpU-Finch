const path = require("path");

const NOMES_RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const CARACTERES_INVALIDOS = /[<>:"/\\|?*\u0000-\u001f]/;

function normalizarNomePastaMaeDownload(valor) {
  const nome = String(valor || "").replace(/\s+/g, " ").trim();
  if (!nome) return "";

  if (
    nome.length > 100 ||
    nome === "." ||
    nome === ".." ||
    nome.endsWith(".") ||
    CARACTERES_INVALIDOS.test(nome) ||
    NOMES_RESERVADOS_WINDOWS.test(nome)
  ) {
    throw new TypeError(
      "Digite um nome válido para a pasta-mãe, sem barras ou caracteres especiais.",
    );
  }

  return nome;
}

function resolverPastaMaeDownload(pastaBase, valor) {
  const baseResolvida = path.resolve(pastaBase);
  const nome = normalizarNomePastaMaeDownload(valor);
  return {
    nome,
    caminho: nome ? path.join(baseResolvida, nome) : baseResolvida,
  };
}

module.exports = {
  normalizarNomePastaMaeDownload,
  resolverPastaMaeDownload,
};
