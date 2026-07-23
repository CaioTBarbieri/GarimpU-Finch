const { spawn } = require("child_process");
const express = require("express");
const path = require("path");

const router = express.Router();
const diretorioProjeto = path.resolve(__dirname, "..");

const criarStatusOrganizacao = () => ({
  estado: "ocioso",
  etapa: null,
  mensagem: "Aguardando início da organização.",
  hotel: null,
  imagem: null,
  imagemAtual: 0,
  totalImagens: 0,
  inicioProcessamento: null,
  inicioProcessamentoImagens: null,
  fimProcessamento: null,
  tempoDecorridoSegundos: 0,
  tempoMedioPorImagemSegundos: null,
  tempoEstimadoRestanteSegundos: null,
  previsaoTermino: null,
  imagensProcessadasGeral: 0,
  totalImagensGeral: 0,
  imagensPendentesGeral: 0,
  temposRecentesImagens: [],
});

let statusOrganizacao = criarStatusOrganizacao();
let ultimaConclusaoImagem = null;
let processoOrganizacao = null;

function atualizarTempoDecorridoOrganizacao(instanteFinal = Date.now()) {
  if (!statusOrganizacao.inicioProcessamento) return;
  statusOrganizacao.tempoDecorridoSegundos = Math.max(
    Math.floor(
      (instanteFinal - statusOrganizacao.inicioProcessamento) / 1000,
    ),
    0,
  );
}

function receberStatusPython(status) {
  const agora = Date.now();
  Object.assign(statusOrganizacao, status);

  if (
    status.etapa === "processamento_imagens_iniciado" &&
    !statusOrganizacao.inicioProcessamentoImagens
  ) {
    statusOrganizacao.inicioProcessamentoImagens = agora;
  }

  if (status.etapa === "arquivo_concluido") {
    if (ultimaConclusaoImagem !== null) {
      const tempoImagemSegundos = (agora - ultimaConclusaoImagem) / 1000;
      if (
        Number.isFinite(tempoImagemSegundos) &&
        tempoImagemSegundos > 0
      ) {
        statusOrganizacao.temposRecentesImagens.push(tempoImagemSegundos);
        statusOrganizacao.temposRecentesImagens =
          statusOrganizacao.temposRecentesImagens.slice(-10);
      }
    }
    ultimaConclusaoImagem = agora;

    if (
      statusOrganizacao.imagensProcessadasGeral >= 2 &&
      statusOrganizacao.temposRecentesImagens.length > 0
    ) {
      const soma = statusOrganizacao.temposRecentesImagens.reduce(
        (total, tempo) => total + tempo,
        0,
      );
      statusOrganizacao.tempoMedioPorImagemSegundos =
        soma / statusOrganizacao.temposRecentesImagens.length;
      statusOrganizacao.tempoEstimadoRestanteSegundos =
        statusOrganizacao.tempoMedioPorImagemSegundos *
        statusOrganizacao.imagensPendentesGeral;
      statusOrganizacao.previsaoTermino =
        agora + statusOrganizacao.tempoEstimadoRestanteSegundos * 1000;
    } else {
      statusOrganizacao.tempoMedioPorImagemSegundos = null;
      statusOrganizacao.tempoEstimadoRestanteSegundos = null;
      statusOrganizacao.previsaoTermino = null;
    }
  }

  atualizarTempoDecorridoOrganizacao(agora);
}

router.post("/api/organizar-tudo", (req, res) => {
  if (processoOrganizacao) {
    return res.status(409).json({
      erro: "Já existe uma organização de imagens em andamento.",
    });
  }

  const inicioOrganizacao = Date.now();
  statusOrganizacao = {
    ...criarStatusOrganizacao(),
    estado: "processando",
    etapa: "iniciando",
    mensagem: "Iniciando organização e carregamento dos modelos.",
    inicioProcessamento: inicioOrganizacao,
  };
  ultimaConclusaoImagem = null;

  console.log(
    `\n[${new Date(inicioOrganizacao).toLocaleString("pt-BR")}] ` +
      `[+] Iniciando IA de Lote para TODOS os hotéis...`,
  );

  const scriptPython = path.resolve(diretorioProjeto, "organizar_hoteis.py");
  processoOrganizacao = spawn("python", ["-u", scriptPython], {
    cwd: diretorioProjeto,
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    },
  });

  let bufferSaida = "";
  processoOrganizacao.stdout.on("data", (chunk) => {
    bufferSaida += chunk.toString("utf8");
    const linhas = bufferSaida.split(/\r?\n/);
    bufferSaida = linhas.pop() || "";

    for (const linha of linhas) {
      if (linha.startsWith("STATUS_JSON:")) {
        try {
          receberStatusPython(JSON.parse(linha.slice("STATUS_JSON:".length)));
        } catch (erro) {
          console.warn(`[-] Status inválido do Python: ${erro.message}`);
        }
      } else if (linha.trim()) {
        console.log(linha);
      }
    }
  });

  processoOrganizacao.stderr.on("data", (chunk) => {
    const mensagem = chunk.toString("utf8").trim();
    if (mensagem) console.error(mensagem);
  });

  processoOrganizacao.on("error", (erro) => {
    const fim = Date.now();
    statusOrganizacao.estado = "erro";
    statusOrganizacao.etapa = "erro";
    statusOrganizacao.mensagem = erro.message;
    statusOrganizacao.fimProcessamento = fim;
    atualizarTempoDecorridoOrganizacao(fim);
    processoOrganizacao = null;
  });

  processoOrganizacao.on("close", (codigo) => {
    const fim = Date.now();
    statusOrganizacao.fimProcessamento = fim;
    atualizarTempoDecorridoOrganizacao(fim);

    if (codigo === 0) {
      statusOrganizacao.estado = "concluido";
      statusOrganizacao.etapa = "concluido";
      statusOrganizacao.mensagem = "Organização concluída.";
      statusOrganizacao.tempoEstimadoRestanteSegundos = 0;
      statusOrganizacao.previsaoTermino = fim;
      statusOrganizacao.imagensPendentesGeral = 0;
      console.log(`[+] Processamento em Lote Concluído!`);
    } else {
      statusOrganizacao.estado = "erro";
      statusOrganizacao.etapa = "erro";
      statusOrganizacao.mensagem =
        statusOrganizacao.mensagem ||
        `O organizador foi encerrado com o código ${codigo}.`;
    }

    processoOrganizacao = null;
  });

  return res.status(202).json({
    sucesso: true,
    mensagem: "Organização iniciada.",
  });
});

router.get("/api/status-organizacao", (req, res) => {
  if (
    statusOrganizacao.estado === "processando" &&
    statusOrganizacao.inicioProcessamento
  ) {
    atualizarTempoDecorridoOrganizacao();
  }
  res.json(statusOrganizacao);
});

module.exports = router;
