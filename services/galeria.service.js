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
const PASTAS_CATEGORIAS = new Set([
  "entretenimento",
  "entreterimento",
  "gastronomia",
  "acomodacoes",
  "criancas",
  "_com_humanos",
  "_revisar",
]);

function compararNomes(a, b) {
  return a.localeCompare(b, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function normalizarNomePasta(nome) {
  return String(nome)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function ehPastaCategoria(nome) {
  return PASTAS_CATEGORIAS.has(normalizarNomePasta(nome));
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

function criarCaminhoRelativo(pastaBase, caminhoAbsoluto) {
  return path.relative(pastaBase, caminhoAbsoluto).split(path.sep).join("/");
}

function resolverCaminhoInterno(pastaBase, caminhoRelativo) {
  if (
    typeof caminhoRelativo !== "string" ||
    caminhoRelativo.trim() === "" ||
    path.isAbsolute(caminhoRelativo)
  ) {
    throw new Error("Caminho de arquivo inválido.");
  }

  const pastaResolvida = path.resolve(pastaBase);
  const caminhoResolvido = path.resolve(
    pastaResolvida,
    ...caminhoRelativo.split("/"),
  );
  const relativoValidado = path.relative(pastaResolvida, caminhoResolvido);

  if (
    relativoValidado === "" ||
    relativoValidado.startsWith(`..${path.sep}`) ||
    relativoValidado === ".." ||
    path.isAbsolute(relativoValidado)
  ) {
    throw new Error("O arquivo informado está fora da pasta de imagens.");
  }

  return caminhoResolvido;
}

function validarCaminhoFisicoInterno(pastaBase, caminhoAbsoluto) {
  const pastaReal = fs.realpathSync(pastaBase);
  const caminhoReal = fs.realpathSync(caminhoAbsoluto);
  const relativo = path.relative(pastaReal, caminhoReal);

  if (
    relativo === "" ||
    relativo.startsWith(`..${path.sep}`) ||
    relativo === ".." ||
    path.isAbsolute(relativo)
  ) {
    throw new Error("O arquivo informado está fora da pasta de imagens.");
  }
}

function validarArquivoImagem(caminhoAbsoluto) {
  if (
    !fs.existsSync(caminhoAbsoluto) ||
    !fs.statSync(caminhoAbsoluto).isFile() ||
    !EXTENSOES_IMAGEM.has(path.extname(caminhoAbsoluto).toLowerCase())
  ) {
    throw new Error("A foto informada não foi encontrada.");
  }
}

function normalizarNovoNome(novoNome, extensaoOriginal) {
  if (typeof novoNome !== "string") {
    throw new Error("Informe um nome válido para a foto.");
  }

  let nome = novoNome.trim();
  if (nome.toLowerCase().endsWith(extensaoOriginal.toLowerCase())) {
    nome = nome.slice(0, -extensaoOriginal.length).trim();
  }

  nome = nome
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!nome || nome === "." || nome === "..") {
    throw new Error("O novo nome ficou vazio após remover caracteres inválidos.");
  }

  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(nome.split(".")[0])) {
    throw new Error("Esse nome é reservado pelo Windows.");
  }

  return `${nome}${extensaoOriginal}`;
}

function renomearFoto(pastaBase, caminhoRelativo, novoNome) {
  const origem = resolverCaminhoInterno(pastaBase, caminhoRelativo);
  validarArquivoImagem(origem);
  validarCaminhoFisicoInterno(pastaBase, origem);

  const extensao = path.extname(origem);
  const nomeNormalizado = normalizarNovoNome(novoNome, extensao);
  const destino = path.join(path.dirname(origem), nomeNormalizado);

  if (origem.toLowerCase() !== destino.toLowerCase() && fs.existsSync(destino)) {
    throw new Error(`Já existe uma foto chamada "${nomeNormalizado}".`);
  }

  if (origem !== destino) fs.renameSync(origem, destino);

  return {
    nome: nomeNormalizado,
    caminho: criarCaminhoRelativo(pastaBase, destino),
    url: criarUrlImagem(pastaBase, destino),
  };
}

function excluirFoto(pastaBase, caminhoRelativo) {
  const caminho = resolverCaminhoInterno(pastaBase, caminhoRelativo);
  validarArquivoImagem(caminho);
  validarCaminhoFisicoInterno(pastaBase, caminho);
  fs.unlinkSync(caminho);
}

function excluirPastaHotel(pastaBase, nomePasta) {
  const partesPasta =
    typeof nomePasta === "string"
      ? nomePasta.replace(/\\/g, "/").split("/")
      : [];
  if (
    typeof nomePasta !== "string" ||
    nomePasta.trim() === "" ||
    path.isAbsolute(nomePasta) ||
    partesPasta.some(
      (parte) => parte === "" || parte === "." || parte === "..",
    )
  ) {
    throw new Error("Pasta de hotel inválida.");
  }

  const pastaHotel = resolverCaminhoInterno(pastaBase, nomePasta);
  if (!fs.existsSync(pastaHotel) || !fs.statSync(pastaHotel).isDirectory()) {
    throw new Error("A pasta do hotel não foi encontrada.");
  }
  validarCaminhoFisicoInterno(pastaBase, pastaHotel);

  fs.rmSync(pastaHotel, { recursive: true, force: false });
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
      caminho: criarCaminhoRelativo(pastaBase, caminhoAbsoluto),
      url: criarUrlImagem(pastaBase, caminhoAbsoluto),
    });
  }

  return imagens;
}

function listarImagensHotel(pastaBase, diretorio) {
  const entradas = fs
    .readdirSync(diretorio, { withFileTypes: true })
    .sort((a, b) => compararNomes(a.name, b.name));
  const imagens = [];

  for (const entrada of entradas) {
    const caminhoAbsoluto = path.join(diretorio, entrada.name);
    if (entrada.isDirectory() && ehPastaCategoria(entrada.name)) {
      imagens.push(
        ...listarImagensRecursivo(
          pastaBase,
          caminhoAbsoluto,
          [entrada.name],
        ),
      );
    } else if (
      entrada.isFile() &&
      EXTENSOES_IMAGEM.has(path.extname(entrada.name).toLowerCase())
    ) {
      imagens.push({
        nome: entrada.name,
        categoria: "Sem categoria",
        caminho: criarCaminhoRelativo(pastaBase, caminhoAbsoluto),
        url: criarUrlImagem(pastaBase, caminhoAbsoluto),
      });
    }
  }

  return imagens;
}

function criarGrupoHotel(pastaBase, diretorio) {
  const imagens = listarImagensHotel(pastaBase, diretorio);
  const nomePasta = criarCaminhoRelativo(pastaBase, diretorio);

  return {
    nome: path.basename(diretorio).replace(/_/g, " "),
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
      caminho: criarCaminhoRelativo(
        pastaBase,
        path.join(pastaBase, entrada.name),
      ),
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

  function encontrarHoteis(diretorio) {
    const grupo = criarGrupoHotel(pastaBase, diretorio);
    if (grupo.totalImagens > 0) hoteis.push(grupo);

    const subpastas = fs
      .readdirSync(diretorio, { withFileTypes: true })
      .filter(
        (entrada) =>
          entrada.isDirectory() && !ehPastaCategoria(entrada.name),
      )
      .sort((a, b) => compararNomes(a.name, b.name));

    for (const subpasta of subpastas) {
      encontrarHoteis(path.join(diretorio, subpasta.name));
    }
  }

  for (const entrada of entradas) {
    if (entrada.isDirectory() && !ehPastaCategoria(entrada.name)) {
      encontrarHoteis(path.join(pastaBase, entrada.name));
    }
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
  excluirFoto,
  excluirPastaHotel,
  listarGaleriaHoteis,
  normalizarNovoNome,
  renomearFoto,
  resolverCaminhoInterno,
};
