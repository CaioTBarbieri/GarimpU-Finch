const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const {
  criarRepositorioConfiguracoes,
} = require("./configuracoes");
const { criarGerenciadorAtualizacoes } = require("./updater");

let janelaPrincipal = null;
let servidor = null;
let recursosEncerrados = false;
let encerramentoEmAndamento = null;
let gerenciadorAtualizacoes = null;
let repositorioConfiguracoes = null;

const bloqueioInstancia = app.requestSingleInstanceLock();
if (!bloqueioInstancia) {
  app.quit();
}

function criarDiretorio(caminho) {
  fs.mkdirSync(caminho, { recursive: true });
  return caminho;
}

function configurarLog() {
  const pastaLogs = criarDiretorio(path.join(app.getPath("userData"), "logs"));
  const arquivoLog = path.join(pastaLogs, "garimpu-finch.log");
  const metodos = ["log", "info", "warn", "error"];

  for (const metodo of metodos) {
    const original = console[metodo].bind(console);
    console[metodo] = (...argumentos) => {
      original(...argumentos);
      const linha = argumentos
        .map((valor) =>
          valor instanceof Error
            ? valor.stack || valor.message
            : typeof valor === "string"
              ? valor
              : JSON.stringify(valor),
        )
        .join(" ");
      try {
        fs.appendFileSync(
          arquivoLog,
          `${new Date().toISOString()} [${metodo}] ${linha}\n`,
          "utf8",
        );
      } catch {
        // O console original continua disponível mesmo se o log falhar.
      }
    };
  }

  return arquivoLog;
}

function encontrarArquivoRecursivo(raiz, nomeArquivo) {
  if (!fs.existsSync(raiz)) return null;
  const pendentes = [raiz];

  while (pendentes.length > 0) {
    const atual = pendentes.pop();
    const entradas = fs.readdirSync(atual, { withFileTypes: true });
    for (const entrada of entradas) {
      const caminho = path.join(atual, entrada.name);
      if (entrada.isFile() && entrada.name.toLowerCase() === nomeArquivo) {
        return caminho;
      }
      if (entrada.isDirectory()) pendentes.push(caminho);
    }
  }

  return null;
}

function copiarSeNecessario(origem, destino) {
  if (fs.existsSync(destino)) return;
  criarDiretorio(path.dirname(destino));
  fs.copyFileSync(origem, destino);
}

function configurarAmbiente() {
  const raizProjeto = path.resolve(__dirname, "..");
  const raizRecursos = app.isPackaged ? process.resourcesPath : raizProjeto;
  const pastaDocumentos = criarDiretorio(
    path.join(app.getPath("documents"), "GarimpU Finch"),
  );
  const pastaDadosModelos = criarDiretorio(
    path.join(app.getPath("userData"), "modelos"),
  );
  const pastaRecursosOrganizador = app.isPackaged
    ? path.join(raizRecursos, "organizer-assets")
    : raizProjeto;

  repositorioConfiguracoes = criarRepositorioConfiguracoes({
    arquivoConfiguracoes: path.join(
      app.getPath("userData"),
      "configuracoes.json",
    ),
    pastaDocumentos,
  });
  const configuracoes = repositorioConfiguracoes.carregar();
  process.env.PASTA_IMAGENS = criarDiretorio(configuracoes.pastaImagens);
  process.env.PASTA_FLORENCE = criarDiretorio(
    configuracoes.pastaFlorence,
  );
  process.env.PASTA_LOGS_FLORENCE = criarDiretorio(
    path.join(pastaDocumentos, "Logs Florence"),
  );
  process.env.GARIMPU_EXPORTS_DIR = criarDiretorio(
    path.join(pastaDocumentos, "Exportacoes"),
  );
  if (app.isPackaged) {
    const modelosIncluidos = path.join(
      pastaRecursosOrganizador,
      "huggingface",
    );
    process.env.HF_HOME = modelosIncluidos;
    process.env.HUGGINGFACE_HUB_CACHE = path.join(modelosIncluidos, "hub");
    process.env.HF_HUB_OFFLINE = "1";
    process.env.TRANSFORMERS_OFFLINE = "1";
  }

  const cacheOrigem = path.join(
    pastaRecursosOrganizador,
    "cache_embeddings_treino.npz",
  );
  const cacheUsuario = path.join(
    pastaDadosModelos,
    "cache_embeddings_treino.npz",
  );
  copiarSeNecessario(cacheOrigem, cacheUsuario);
  process.env.CACHE_EMBEDDINGS = cacheUsuario;
  process.env.PASTA_EXEMPLOS = path.join(
    pastaRecursosOrganizador,
    "Fotos exemplos",
  );
  process.env.YOLO_MODEL = path.join(
    pastaRecursosOrganizador,
    "yolov8n.pt",
  );

  if (app.isPackaged) {
    const chromium = encontrarArquivoRecursivo(
      path.join(raizRecursos, "chromium"),
      "chrome.exe",
    );
    if (!chromium) {
      throw new Error(
        "O Chromium incluído na instalação não foi encontrado.",
      );
    }
    process.env.PUPPETEER_EXECUTABLE_PATH = chromium;

    const organizador = path.join(
      raizRecursos,
      "python-organizer",
      "organizar_hoteis.exe",
    );
    if (!fs.existsSync(organizador)) {
      throw new Error(
        "O organizador de imagens incluído na instalação não foi encontrado.",
      );
    }
    process.env.ORGANIZADOR_EXECUTABLE = organizador;
  } else {
    process.env.PUPPETEER_CACHE_DIR = path.join(
      raizProjeto,
      "resources",
      "chromium",
    );
    process.env.PUPPETEER_EXECUTABLE_PATH =
      require("puppeteer").executablePath();
  }

  return {
    pastaDocumentos,
    pastaExportacoes: process.env.GARIMPU_EXPORTS_DIR,
  };
}

function portaEstaLivre(porta) {
  return new Promise((resolve) => {
    const teste = net.createServer();
    teste.unref();
    teste.once("error", () => resolve(false));
    teste.listen(porta, "127.0.0.1", () => {
      teste.close(() => resolve(true));
    });
  });
}

async function encontrarPortaLivre(portaInicial = 3000) {
  for (let porta = portaInicial; porta < portaInicial + 50; porta += 1) {
    if (await portaEstaLivre(porta)) return porta;
  }
  throw new Error(
    `Nenhuma porta livre foi encontrada entre ${portaInicial} e ${
      portaInicial + 49
    }.`,
  );
}

function consultarSaude(url) {
  return new Promise((resolve) => {
    const requisicao = http.get(url, (resposta) => {
      resposta.resume();
      resolve(resposta.statusCode === 200);
    });
    requisicao.setTimeout(1000, () => {
      requisicao.destroy();
      resolve(false);
    });
    requisicao.once("error", () => resolve(false));
  });
}

async function aguardarServidor(url, limiteMs = 30000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    if (await consultarSaude(`${url}/api/health`)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("O servidor local não respondeu dentro do tempo esperado.");
}

function nomeDisponivel(pasta, nomeOriginal) {
  const nomeSeguro = path.basename(nomeOriginal).replace(/[<>:"/\\|?*]/g, "_");
  const extensao = path.extname(nomeSeguro);
  const base = path.basename(nomeSeguro, extensao);
  let candidato = path.join(pasta, nomeSeguro);
  let indice = 2;

  while (fs.existsSync(candidato)) {
    candidato = path.join(pasta, `${base} (${indice})${extensao}`);
    indice += 1;
  }
  return candidato;
}

function configurarDownloads(pastaExportacoes) {
  session.defaultSession.on("will-download", (evento, item) => {
    item.setSavePath(nomeDisponivel(pastaExportacoes, item.getFilename()));
  });
}

function criarJanela(url) {
  janelaPrincipal = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 700,
    show: false,
    backgroundColor: "#020617",
    title: "GarimpU Finch",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      sandbox: true,
    },
  });

  janelaPrincipal.removeMenu();
  janelaPrincipal.webContents.setWindowOpenHandler(({ url: destino }) => {
    if (/^https?:\/\//i.test(destino)) {
      void shell.openExternal(destino);
    }
    return { action: "deny" };
  });
  janelaPrincipal.once("ready-to-show", () => {
    janelaPrincipal.show();
  });
  janelaPrincipal.on("closed", () => {
    janelaPrincipal = null;
  });
  return janelaPrincipal.loadURL(url);
}

async function encerrarRecursos() {
  if (encerramentoEmAndamento) return encerramentoEmAndamento;
  encerramentoEmAndamento = (async () => {
    try {
      if (servidor) {
        await servidor.encerrarServidor();
        servidor = null;
      }
    } catch (erro) {
      console.error("Falha ao encerrar os recursos:", erro);
    }
  })();
  return encerramentoEmAndamento;
}

async function prepararEncerramentoParaAtualizacao() {
  await encerrarRecursos();
  recursosEncerrados = true;
}

async function reiniciarAplicacao() {
  await encerrarRecursos();
  recursosEncerrados = true;
  app.relaunch();
  app.quit();
}

function configurarIpcConfiguracoes() {
  ipcMain.handle("configuracoes:obter", () => ({
    ...repositorioConfiguracoes.carregar(),
    padroes: repositorioConfiguracoes.obterPadroes(),
  }));

  ipcMain.handle(
    "configuracoes:selecionar-pasta",
    async (evento, caminhoAtual) => {
      const janela = BrowserWindow.fromWebContents(evento.sender);
      const opcoes = {
        title: "Selecionar pasta",
        buttonLabel: "Usar esta pasta",
        properties: ["openDirectory", "createDirectory"],
        ...(typeof caminhoAtual === "string" && caminhoAtual.trim()
          ? { defaultPath: caminhoAtual }
          : {}),
      };
      const resultado = janela
        ? await dialog.showOpenDialog(janela, opcoes)
        : await dialog.showOpenDialog(opcoes);
      return resultado.canceled ? null : resultado.filePaths[0] || null;
    },
  );

  ipcMain.handle("configuracoes:salvar", (evento, configuracoes) => {
    const salvas = repositorioConfiguracoes.salvar(configuracoes);
    const reinicio = setTimeout(() => {
      void reiniciarAplicacao().catch((erro) => {
        console.error("Falha ao reiniciar após salvar configurações:", erro);
      });
    }, 600);
    reinicio.unref();
    return salvas;
  });
}

async function iniciar() {
  const arquivoLog = configurarLog();
  console.log(`[+] Log da aplicação: ${arquivoLog}`);

  try {
    const ambiente = configurarAmbiente();
    configurarIpcConfiguracoes();
    configurarDownloads(ambiente.pastaExportacoes);
    const portaPreferida = Number(process.env.PORT || 3000);
    const porta = await encontrarPortaLivre(portaPreferida);
    process.env.PORT = String(porta);

    servidor = require("../scraper");
    const resultado = await servidor.iniciarServidor({ porta });
    const url = `http://${resultado.host}:${resultado.porta}`;
    await aguardarServidor(url);
    await criarJanela(url);

    gerenciadorAtualizacoes = criarGerenciadorAtualizacoes({
      app,
      autoUpdater,
      dialog,
      obterJanela: () => janelaPrincipal,
      prepararEncerramento: prepararEncerramentoParaAtualizacao,
    });
    gerenciadorAtualizacoes.iniciar();
  } catch (erro) {
    console.error("Falha na inicialização:", erro);
    dialog.showErrorBox(
      "GarimpU Finch não pôde iniciar",
      `${erro.message}\n\nConsulte o log em:\n${arquivoLog}`,
    );
    recursosEncerrados = true;
    await encerrarRecursos();
    app.quit();
  }
}

if (bloqueioInstancia) {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.garimpu.finch");
  }

  app.on("second-instance", () => {
    if (!janelaPrincipal) return;
    if (janelaPrincipal.isMinimized()) janelaPrincipal.restore();
    janelaPrincipal.focus();
  });

  app.whenReady().then(iniciar);
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (evento) => {
    if (recursosEncerrados) return;
    evento.preventDefault();
    void encerrarRecursos().finally(() => {
      recursosEncerrados = true;
      app.quit();
    });
  });
}

process.on("uncaughtException", (erro) => {
  console.error("Erro não tratado:", erro);
});
process.on("unhandledRejection", (erro) => {
  console.error("Rejeição não tratada:", erro);
});
