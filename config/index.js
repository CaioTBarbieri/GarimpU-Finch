const fs = require("fs");
const path = require("path");

const diretorioProjeto = path.resolve(__dirname, "..");
const caminhoConfigLocal = path.resolve(__dirname, "local.js");
const configLocal = fs.existsSync(caminhoConfigLocal)
  ? require(caminhoConfigLocal)
  : {};

function obterValor(nome, valorPadrao) {
  if (Object.prototype.hasOwnProperty.call(process.env, nome)) {
    return process.env[nome];
  }

  if (Object.prototype.hasOwnProperty.call(configLocal, nome)) {
    return configLocal[nome];
  }

  return valorPadrao;
}

function validarNumero(nome, valor, minimo, maximo) {
  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero < minimo || numero > maximo) {
    throw new Error(
      `Configuração inválida: ${nome} deve ser um número entre ${minimo} e ${maximo}.`,
    );
  }

  return numero;
}

function validarTexto(nome, valor) {
  if (typeof valor !== "string" || !valor.trim()) {
    throw new Error(`Configuração inválida: ${nome} não pode ser vazio.`);
  }

  return valor.trim();
}

function encontrarArquivoRecursivo(diretorio, nomeArquivo) {
  if (!fs.existsSync(diretorio)) return null;
  const pendentes = [diretorio];

  while (pendentes.length > 0) {
    const atual = pendentes.pop();
    const entradas = fs.readdirSync(atual, { withFileTypes: true });

    for (const entrada of entradas) {
      const caminho = path.join(atual, entrada.name);
      if (
        entrada.isFile() &&
        entrada.name.toLowerCase() === nomeArquivo.toLowerCase()
      ) {
        return caminho;
      }
      if (entrada.isDirectory()) pendentes.push(caminho);
    }
  }

  return null;
}

const portaConfigurada = Number(obterValor("PORT", 3000));
if (
  !Number.isInteger(portaConfigurada) ||
  portaConfigurada <= 0 ||
  portaConfigurada > 65535
) {
  throw new Error(
    "Configuração inválida: PORT deve ser um número inteiro positivo entre 1 e 65535.",
  );
}

const pastaImagensConfigurada = validarTexto(
  "PASTA_IMAGENS",
  obterValor("PASTA_IMAGENS", path.resolve(diretorioProjeto, "img")),
);
const pastaLogsFlorenceConfigurada = validarTexto(
  "PASTA_LOGS_FLORENCE",
  obterValor(
    "PASTA_LOGS_FLORENCE",
    path.resolve(diretorioProjeto, "logs", "florence"),
  ),
);

const PORT = portaConfigurada;
const PASTA_IMAGENS = path.resolve(diretorioProjeto, pastaImagensConfigurada);
const pastaFlorenceConfigurada = validarTexto(
  "PASTA_FLORENCE",
  obterValor("PASTA_FLORENCE", PASTA_IMAGENS),
);
const PASTA_FLORENCE = path.resolve(
  diretorioProjeto,
  pastaFlorenceConfigurada,
);
const PASTA_LOGS_FLORENCE = path.resolve(
  diretorioProjeto,
  pastaLogsFlorenceConfigurada,
);
const LATITUDE_PADRAO = validarNumero(
  "LATITUDE_PADRAO",
  obterValor("LATITUDE_PADRAO", -14.815),
  -90,
  90,
);
const LONGITUDE_PADRAO = validarNumero(
  "LONGITUDE_PADRAO",
  obterValor("LONGITUDE_PADRAO", -39.0333),
  -180,
  180,
);
const pythonExecutableConfigurado = obterValor("PYTHON_EXECUTABLE", null);
const PYTHON_EXECUTABLE =
  pythonExecutableConfigurado === null ||
  pythonExecutableConfigurado === undefined
    ? null
    : validarTexto("PYTHON_EXECUTABLE", pythonExecutableConfigurado);
const PYTHON_VERSION_ESPERADA = validarTexto(
  "PYTHON_VERSION_ESPERADA",
  obterValor("PYTHON_VERSION_ESPERADA", "3.12"),
);
if (PYTHON_VERSION_ESPERADA !== "3.12") {
  throw new Error(
    "Configuração inválida: PYTHON_VERSION_ESPERADA deve ser 3.12.",
  );
}
const PUPPETEER_EXECUTABLE_PATH = obterValor(
  "PUPPETEER_EXECUTABLE_PATH",
  encontrarArquivoRecursivo(
    path.resolve(diretorioProjeto, "resources", "chromium", "chrome"),
    "chrome.exe",
  ),
);
const ORGANIZADOR_EXECUTABLE = obterValor("ORGANIZADOR_EXECUTABLE", null);
const PASTA_EXEMPLOS = obterValor("PASTA_EXEMPLOS", null);
const CACHE_EMBEDDINGS = obterValor("CACHE_EMBEDDINGS", null);
const YOLO_MODEL = obterValor("YOLO_MODEL", null);

module.exports = {
  PORT,
  PASTA_IMAGENS,
  PASTA_FLORENCE,
  PASTA_LOGS_FLORENCE,
  LATITUDE_PADRAO,
  LONGITUDE_PADRAO,
  PYTHON_EXECUTABLE,
  PYTHON_VERSION_ESPERADA,
  PUPPETEER_EXECUTABLE_PATH,
  ORGANIZADOR_EXECUTABLE,
  PASTA_EXEMPLOS,
  CACHE_EMBEDDINGS,
  YOLO_MODEL,
};
