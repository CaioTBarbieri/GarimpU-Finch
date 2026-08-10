const path = require("path");

module.exports = {
  PORT: 3000,
  PASTA_IMAGENS: path.resolve(__dirname, "..", "img"),
  PASTA_FLORENCE: path.resolve(__dirname, "..", "img"),
  PASTA_LOGS_FLORENCE: path.resolve(
    __dirname,
    "..",
    "logs",
    "florence",
  ),
  LATITUDE_PADRAO: -14.815,
  LONGITUDE_PADRAO: -39.0333,
  PYTHON_EXECUTABLE: path.resolve(
    __dirname,
    "..",
    ".venv",
    "Scripts",
    "python.exe",
  ),
  PYTHON_VERSION_ESPERADA: "3.12",
};
