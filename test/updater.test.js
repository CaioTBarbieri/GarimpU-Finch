"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const {
  ATRASO_VERIFICACAO_MS,
  INTERVALO_VERIFICACAO_MS,
  criarGerenciadorAtualizacoes,
} = require("../electron/updater");

function proximoCiclo() {
  return new Promise((resolve) => setImmediate(resolve));
}

function criarCenario({ empacotado = true, respostaDialogo = 0 } = {}) {
  const autoUpdater = new EventEmitter();
  const chamadas = {
    agendamentos: [],
    downloads: 0,
    encerramentos: 0,
    instalacoes: 0,
    progresso: [],
    verificacoes: 0,
  };

  autoUpdater.checkForUpdates = async () => {
    chamadas.verificacoes += 1;
  };
  autoUpdater.downloadUpdate = async () => {
    chamadas.downloads += 1;
  };
  autoUpdater.quitAndInstall = () => {
    chamadas.instalacoes += 1;
  };

  const janela = {
    isDestroyed: () => false,
    setProgressBar: (valor) => chamadas.progresso.push(valor),
  };
  const dialog = {
    showMessageBox: async () => ({ response: respostaDialogo }),
  };
  const app = {
    isPackaged: empacotado,
    getVersion: () => "1.2.0",
  };
  const log = {
    info: () => {},
    error: () => {},
  };
  const agendar = (funcao, atraso) => {
    chamadas.agendamentos.push({ tipo: "timeout", funcao, atraso });
    return { unref() {} };
  };
  const repetir = (funcao, atraso) => {
    chamadas.agendamentos.push({ tipo: "interval", funcao, atraso });
    return { unref() {} };
  };

  const gerenciador = criarGerenciadorAtualizacoes({
    app,
    autoUpdater,
    dialog,
    obterJanela: () => janela,
    prepararEncerramento: async () => {
      chamadas.encerramentos += 1;
    },
    log,
    agendar,
    repetir,
  });

  return { autoUpdater, chamadas, gerenciador };
}

test("agenda verificações somente no aplicativo empacotado", async () => {
  const desenvolvimento = criarCenario({ empacotado: false });
  desenvolvimento.gerenciador.iniciar();
  await desenvolvimento.gerenciador.verificarAtualizacoes();
  assert.equal(desenvolvimento.chamadas.agendamentos.length, 0);
  assert.equal(desenvolvimento.chamadas.verificacoes, 0);

  const producao = criarCenario();
  producao.gerenciador.iniciar();
  assert.deepEqual(
    producao.chamadas.agendamentos.map(({ tipo, atraso }) => ({
      tipo,
      atraso,
    })),
    [
      { tipo: "timeout", atraso: ATRASO_VERIFICACAO_MS },
      { tipo: "interval", atraso: INTERVALO_VERIFICACAO_MS },
    ],
  );

  await producao.chamadas.agendamentos[0].funcao();
  await proximoCiclo();
  assert.equal(producao.chamadas.verificacoes, 1);
});

test("baixa a atualização após confirmação do usuário", async () => {
  const { autoUpdater, chamadas } = criarCenario();
  autoUpdater.emit("update-available", { version: "1.2.0" });
  await proximoCiclo();
  assert.equal(chamadas.downloads, 1);
});

test("mostra o progresso na barra de tarefas", () => {
  const { autoUpdater, chamadas } = criarCenario();
  autoUpdater.emit("download-progress", {
    percent: 42.5,
    bytesPerSecond: 1024,
  });
  assert.deepEqual(chamadas.progresso, [0.425]);
});

test("encerra os recursos antes de reiniciar para instalar", async () => {
  const { autoUpdater, chamadas } = criarCenario();
  autoUpdater.emit("update-downloaded", { version: "1.2.0" });
  await proximoCiclo();
  assert.equal(chamadas.encerramentos, 1);
  assert.equal(chamadas.instalacoes, 1);
  assert.equal(chamadas.progresso.at(-1), -1);
});
