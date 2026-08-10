const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  ORGANIZADOR_EXECUTABLE,
  PYTHON_EXECUTABLE,
  PYTHON_VERSION_ESPERADA,
} = require("../config");

const diretorioProjeto = path.resolve(__dirname, "..");
const MENSAGEM_PYTHON_NAO_ENCONTRADO =
  "Python 3.12 não foi encontrado. Crie o ambiente com:\n" +
  "py -3.12 -m venv .venv";

function verificarVersao({ comando, argumentosIniciais }) {
  return new Promise((resolve) => {
    let saida = "";
    let concluido = false;
    let temporizador;

    const finalizar = (resultado) => {
      if (concluido) return;
      concluido = true;
      clearTimeout(temporizador);
      resolve(resultado);
    };

    let processo;
    try {
      processo = spawn(
        comando,
        [...argumentosIniciais, "--version"],
        {
          cwd: diretorioProjeto,
          windowsHide: true,
          shell: false,
        },
      );
    } catch {
      finalizar(null);
      return;
    }

    temporizador = setTimeout(() => {
      processo.kill();
      finalizar(null);
    }, 10000);

    processo.stdout.on("data", (chunk) => {
      saida += chunk.toString("utf8");
    });
    processo.stderr.on("data", (chunk) => {
      saida += chunk.toString("utf8");
    });
    processo.on("error", () => finalizar(null));
    processo.on("close", (codigo) => {
      if (codigo !== 0) {
        finalizar(null);
        return;
      }

      const correspondencia = saida.match(
        /Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i,
      );
      if (!correspondencia) {
        finalizar(null);
        return;
      }

      const versaoPrincipal = `${correspondencia[1]}.${correspondencia[2]}`;
      if (versaoPrincipal !== PYTHON_VERSION_ESPERADA) {
        finalizar(null);
        return;
      }

      finalizar({
        comando,
        argumentosIniciais,
        versao: [
          correspondencia[1],
          correspondencia[2],
          correspondencia[3],
        ]
          .filter((parte) => parte !== undefined)
          .join("."),
      });
    });
  });
}

function criarCandidatos() {
  const candidatos = [];

  if (PYTHON_EXECUTABLE) {
    candidatos.push({
      comando: PYTHON_EXECUTABLE,
      argumentosIniciais: [],
    });
  }

  const pythonDotVenv = path.resolve(
    diretorioProjeto,
    ".venv",
    "Scripts",
    "python.exe",
  );
  const pythonVenv = path.resolve(
    diretorioProjeto,
    "venv",
    "Scripts",
    "python.exe",
  );

  if (fs.existsSync(pythonDotVenv)) {
    candidatos.push({
      comando: pythonDotVenv,
      argumentosIniciais: [],
    });
  }

  if (fs.existsSync(pythonVenv)) {
    candidatos.push({
      comando: pythonVenv,
      argumentosIniciais: [],
    });
  }

  if (process.platform === "win32") {
    candidatos.push({
      comando: "py",
      argumentosIniciais: ["-3.12"],
    });
  }

  candidatos.push({
    comando: "python",
    argumentosIniciais: [],
  });

  const chavesEncontradas = new Set();
  return candidatos.filter((candidato) => {
    const chave = JSON.stringify(candidato);
    if (chavesEncontradas.has(chave)) return false;
    chavesEncontradas.add(chave);
    return true;
  });
}

async function localizarPythonCompativel() {
  if (
    ORGANIZADOR_EXECUTABLE &&
    fs.existsSync(ORGANIZADOR_EXECUTABLE)
  ) {
    return {
      comando: ORGANIZADOR_EXECUTABLE,
      argumentosIniciais: [],
      versao: "empacotado",
      executavelEmpacotado: true,
    };
  }

  for (const candidato of criarCandidatos()) {
    const encontrado = await verificarVersao(candidato);
    if (encontrado) return encontrado;
  }

  throw new Error(MENSAGEM_PYTHON_NAO_ENCONTRADO);
}

module.exports = {
  localizarPythonCompativel,
  MENSAGEM_PYTHON_NAO_ENCONTRADO,
};
