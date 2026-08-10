const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  CACHE_EMBEDDINGS,
  ORGANIZADOR_EXECUTABLE,
  PASTA_EXEMPLOS,
  PASTA_FLORENCE,
  PASTA_LOGS_FLORENCE,
  PYTHON_VERSION_ESPERADA,
  YOLO_MODEL,
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
    if (
      ORGANIZADOR_EXECUTABLE &&
      sistemaArquivos.existsSync(ORGANIZADOR_EXECUTABLE)
    ) {
      return ORGANIZADOR_EXECUTABLE;
    }

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

  async function prepararEIniciarProcesso({
    reorganizar = false,
    pastasImagens = [PASTA_FLORENCE],
  } = {}) {
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

      const argumentosPastas = pastasImagens.flatMap((pasta) => [
        "--pasta",
        pasta,
      ]);
      const argumentos = python.executavelEmpacotado
        ? argumentosPastas
        : [
            ...python.argumentosIniciais,
            "-u",
            scriptPython,
            ...argumentosPastas,
          ];
      if (reorganizar) argumentos.push("--reorganizar");
      const diretorioExecucao = python.executavelEmpacotado
        ? path.dirname(python.comando)
        : diretorioProjeto;
      const processo = criarProcesso(
        python.comando,
        argumentos,
        {
          cwd: diretorioExecucao,
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            PYTHON_VERSION_ESPERADA,
            PASTA_LOGS_FLORENCE,
            ...(PASTA_EXEMPLOS ? { PASTA_EXEMPLOS } : {}),
            ...(CACHE_EMBEDDINGS ? { CACHE_EMBEDDINGS } : {}),
            ...(YOLO_MODEL ? { YOLO_MODEL } : {}),
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

  function iniciarOrganizacao({
    reorganizar = false,
    pastaImagens = PASTA_FLORENCE,
    pastasImagens,
  } = {}) {
    if (estaExecutando()) return false;

    const destinos = Array.isArray(pastasImagens) && pastasImagens.length > 0
      ? [...new Set(pastasImagens)]
      : [pastaImagens];
    iniciando = true;
    const inicioOrganizacao = agora();
    estado.reiniciarEstado(inicioOrganizacao);
    logger.log(
      `\n[${new Date(inicioOrganizacao).toLocaleString("pt-BR")}] ` +
        `[+] Iniciando IA de Lote em ${destinos.length} pasta(s): ` +
        `${destinos.join(", ")}...`,
    );
    void prepararEIniciarProcesso({
      reorganizar,
      pastasImagens: destinos,
    });
    return true;
  }

  function encerrarOrganizacao() {
    iniciando = false;
    const processo = processoAtual;
    processoAtual = null;
    if (!processo) return false;

    try {
      processo.kill();
    } catch (erro) {
      logger.warn(
        `[-] Não foi possível encerrar o organizador: ${erro.message}`,
      );
    }
    return true;
  }

  return {
    iniciarOrganizacao,
    estaExecutando,
    encontrarScriptPython,
    encerrarOrganizacao,
  };
}

const organizadorPython = criarOrganizadorPythonService();

module.exports = {
  criarOrganizadorPythonService,
  iniciarOrganizacao: organizadorPython.iniciarOrganizacao,
  estaExecutando: organizadorPython.estaExecutando,
  encerrarOrganizacao: organizadorPython.encerrarOrganizacao,
};
