const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  PASTA_IMAGENS,
  PYTHON_VERSION_ESPERADA,
} = require("../config");
const statusOrganizacao = require("../state/status-organizacao");
const {
  localizarPythonCompativel,
} = require("./python-runtime.service");

const diretorioProjeto = path.resolve(__dirname, "..");

function criarOrganizadorPythonService({
  criarProcesso = spawn,
  localizarPython = localizarPythonCompativel,
  estado = statusOrganizacao,
  sistemaArquivos = fs,
  logger = console,
  agora = Date.now,
} = {}) {
  let processoAtual = null;
  let iniciando = false;

  function estaExecutando() {
    return iniciando || processoAtual !== null;
  }

  function encontrarScriptPython() {
    const scriptPython = path.resolve(
      diretorioProjeto,
      "organizar_hoteis.py",
    );
    if (!sistemaArquivos.existsSync(scriptPython)) {
      throw new Error(
        `Script Python não encontrado: ${scriptPython}`,
      );
    }
    return scriptPython;
  }

  function conectarProcesso(processo) {
    let bufferSaida = "";
    let finalizado = false;

    function processarLinha(linha) {
      if (linha.startsWith("STATUS_JSON:")) {
        try {
          const dados = JSON.parse(
            linha.slice("STATUS_JSON:".length),
          );
          estado.atualizarDadosPython(dados, agora());
        } catch (erro) {
          logger.warn(
            `[-] Status inválido do Python: ${erro.message}`,
          );
        }
      } else if (linha.trim()) {
        logger.log(linha);
      }
    }

    function processarBuffer(final = false) {
      const linhas = bufferSaida.split(/\r?\n/);
      bufferSaida = final ? "" : linhas.pop() || "";

      if (final) {
        for (const linha of linhas) processarLinha(linha);
      } else {
        for (const linha of linhas) processarLinha(linha);
      }
    }

    function finalizarUmaVez(tipo, detalhe) {
      if (finalizado) return;
      finalizado = true;

      if (processoAtual === processo) processoAtual = null;

      if (tipo === "sucesso") {
        estado.finalizarConcluido(agora());
        logger.log("[+] Processamento em Lote Concluído!");
      } else {
        estado.finalizarErro(detalhe, agora());
      }
    }

    processo.stdout.on("data", (chunk) => {
      bufferSaida += chunk.toString("utf8");
      processarBuffer();
    });

    processo.stderr.on("data", (chunk) => {
      const mensagem = chunk.toString("utf8").trim();
      if (mensagem) logger.error(mensagem);
    });

    processo.on("error", (erro) => {
      processarBuffer(true);
      finalizarUmaVez("erro", erro.message);
    });

    processo.on("close", (codigo) => {
      processarBuffer(true);
      if (codigo === 0) {
        finalizarUmaVez("sucesso");
      } else {
        finalizarUmaVez(
          "erro",
          `O organizador foi encerrado com o código ${codigo}.`,
        );
      }
    });
  }

  async function prepararEIniciarProcesso({ reorganizar = false } = {}) {
    try {
      const scriptPython = encontrarScriptPython();
      const python = await localizarPython();
      const comandoExibido = [
        python.comando,
        ...python.argumentosIniciais,
      ]
        .map((parte) => (parte.includes(" ") ? `"${parte}"` : parte))
        .join(" ");
      logger.log(
        `[+] Python selecionado: ${comandoExibido} ` +
          `(Python ${python.versao})`,
      );

      const argumentos = [
        ...python.argumentosIniciais,
        "-u",
        scriptPython,
        "--pasta",
        PASTA_IMAGENS,
      ];
      if (reorganizar) argumentos.push("--reorganizar");
      const processo = criarProcesso(
        python.comando,
        argumentos,
        {
          cwd: diretorioProjeto,
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            PYTHON_VERSION_ESPERADA,
          },
        },
      );

      processoAtual = processo;
      iniciando = false;
      conectarProcesso(processo);
    } catch (erro) {
      iniciando = false;
      processoAtual = null;
      estado.finalizarErro(erro.message, agora());
      logger.error(`[-] ${erro.message}`);
    }
  }

  function iniciarOrganizacao({ reorganizar = false } = {}) {
    if (estaExecutando()) return false;

    iniciando = true;
    const inicioOrganizacao = agora();
    estado.reiniciarEstado(inicioOrganizacao);
    logger.log(
      `\n[${new Date(inicioOrganizacao).toLocaleString("pt-BR")}] ` +
        "[+] Iniciando IA de Lote para TODOS os hotéis...",
    );
    void prepararEIniciarProcesso({ reorganizar });
    return true;
  }

  return {
    iniciarOrganizacao,
    estaExecutando,
    encontrarScriptPython,
  };
}

const organizadorPython = criarOrganizadorPythonService();

module.exports = {
  criarOrganizadorPythonService,
  iniciarOrganizacao: organizadorPython.iniciarOrganizacao,
  estaExecutando: organizadorPython.estaExecutando,
};
