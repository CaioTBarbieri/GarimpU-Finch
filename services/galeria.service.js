const fs = require("fs");
const path = require("path");

const EXTENSOES_IMAGEM = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".tiff",
  ".tif",
]);

function compararNomes(a, b) {
  return a.localeCompare(b, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function criarUrlImagem(pastaBase, caminhoAbsoluto) {
  const caminhoRelativo = path.relative(pastaBase, caminhoAbsoluto);
  return (
    "/img/" +
    caminhoRelativo
      .split(path.sep)
      .map(encodeURIComponent)
      .join("/")
  );
}

function listarImagensRecursivo(pastaBase, diretorio, categorias = []) {
  const imagens = [];
  const entradas = fs
    .readdirSync(diretorio, { withFileTypes: true })
    .sort((a, b) => compararNomes(a.name, b.name));

  for (const entrada of entradas) {
    const caminhoAbsoluto = path.join(diretorio, entrada.name);

    if (entrada.isDirectory()) {
      imagens.push(
        ...listarImagensRecursivo(pastaBase, caminhoAbsoluto, [
          ...categorias,
          entrada.name,
        ]),
      );
      continue;
    }

    if (
      !entrada.isFile() ||
      !EXTENSOES_IMAGEM.has(path.extname(entrada.name).toLowerCase())
    ) {
      continue;
    }

    imagens.push({
      nome: entrada.name,
      categoria:
        categorias.length > 0 ? categorias.join(" / ") : "Sem categoria",
      url: criarUrlImagem(pastaBase, caminhoAbsoluto),
    });
  }

  return imagens;
}

function criarGrupoHotel(pastaBase, nomePasta, nomeExibicao, diretorio) {
  const imagens = listarImagensRecursivo(pastaBase, diretorio);

  return {
    nome: nomeExibicao,
    pasta: nomePasta,
    totalImagens: imagens.length,
    imagemCapa: imagens[0]?.url || null,
    imagens,
  };
}

function listarGaleriaHoteis(pastaBase) {
  const entradas = fs
    .readdirSync(pastaBase, { withFileTypes: true })
    .sort((a, b) => compararNomes(a.name, b.name));
  const hoteis = [];

  const imagensSoltas = entradas
    .filter(
      (entrada) =>
        entrada.isFile() &&
        EXTENSOES_IMAGEM.has(path.extname(entrada.name).toLowerCase()),
    )
    .map((entrada) => ({
      nome: entrada.name,
      categoria: "Sem categoria",
      url: criarUrlImagem(pastaBase, path.join(pastaBase, entrada.name)),
    }));

  if (imagensSoltas.length > 0) {
    hoteis.push({
      nome: "Imagens soltas",
      pasta: null,
      totalImagens: imagensSoltas.length,
      imagemCapa: imagensSoltas[0].url,
      imagens: imagensSoltas,
    });
  }

  for (const entrada of entradas) {
    if (!entrada.isDirectory()) continue;

    const grupo = criarGrupoHotel(
      pastaBase,
      entrada.name,
      entrada.name.replace(/_/g, " "),
      path.join(pastaBase, entrada.name),
    );

    if (grupo.totalImagens > 0) hoteis.push(grupo);
  }

  return {
    totalHoteis: hoteis.length,
    totalImagens: hoteis.reduce(
      (total, hotel) => total + hotel.totalImagens,
      0,
    ),
    hoteis,
  };
}

module.exports = {
  EXTENSOES_IMAGEM,
  listarGaleriaHoteis,
};
