const fs = require("fs");
const path = require("path");

const EXTENSOES_IMAGEM = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif",
]);
const PASTAS_CATEGORIAS = new Set([
  "entretenimento", "entreterimento", "gastronomia", "acomodacoes", "criancas",
]);

function normalizarNome(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function ehCategoria(nome) {
  return PASTAS_CATEGORIAS.has(normalizarNome(nome));
}

function listarPastasMaeFlorence(pastaBase, sistemaArquivos = fs) {
  if (!sistemaArquivos.existsSync(pastaBase)) return [];

  return sistemaArquivos
    .readdirSync(pastaBase, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory() && !entrada.name.startsWith("_"))
    .filter((entrada) => {
      const diretorio = path.join(pastaBase, entrada.name);
      const conteudo = sistemaArquivos.readdirSync(diretorio, {
        withFileTypes: true,
      });
      const pareceHotel = conteudo.some(
        (item) =>
          (item.isFile() && EXTENSOES_IMAGEM.has(path.extname(item.name).toLowerCase())) ||
          (item.isDirectory() && ehCategoria(item.name)),
      );
      const contemHoteis = conteudo.some(
        (item) =>
          item.isDirectory() &&
          !item.name.startsWith("_") &&
          !ehCategoria(item.name),
      );
      return !pareceHotel && contemHoteis;
    })
    .map((entrada) => entrada.name)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function resolverPastaMaeFlorence(
  pastaBase,
  pastaMae,
  sistemaArquivos = fs,
) {
  if (pastaMae == null || String(pastaMae).trim() === "") {
    return path.resolve(pastaBase);
  }
  const nome = String(pastaMae).trim();
  if (
    path.isAbsolute(nome) ||
    nome.includes("/") ||
    nome.includes("\\") ||
    nome === "." ||
    nome === ".."
  ) {
    throw new TypeError("Selecione uma pasta-mãe válida.");
  }
  if (!listarPastasMaeFlorence(pastaBase, sistemaArquivos).includes(nome)) {
    throw new TypeError("A pasta-mãe selecionada não foi encontrada.");
  }
  return path.resolve(pastaBase, nome);
}

module.exports = {
  listarPastasMaeFlorence,
  resolverPastaMaeFlorence,
};
