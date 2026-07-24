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

module.exports = {
  PORT,
  PASTA_IMAGENS,
  PASTA_LOGS_FLORENCE,
  LATITUDE_PADRAO,
  LONGITUDE_PADRAO,
  PYTHON_EXECUTABLE,
  PYTHON_VERSION_ESPERADA,
};
