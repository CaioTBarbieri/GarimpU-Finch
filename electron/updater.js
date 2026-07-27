"use strict";

const ATRASO_VERIFICACAO_MS = 5000;
const INTERVALO_VERIFICACAO_MS = 4 * 60 * 60 * 1000;

function mostrarMensagem(dialog, janela, opcoes) {
  if (janela && !janela.isDestroyed()) {
    return dialog.showMessageBox(janela, opcoes);
  }
  return dialog.showMessageBox(opcoes);
}

function criarGerenciadorAtualizacoes({
  app,
  autoUpdater,
  dialog,
  obterJanela,
  prepararEncerramento,
  log = console,
  agendar = setTimeout,
  repetir = setInterval,
}) {
  let downloadEmAndamento = false;
  let atualizacaoBaixada = false;
  let iniciado = false;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = log;

  function registrarErro(contexto, erro) {
    log.error(`[Atualização] ${contexto}:`, erro);
  }

  function atualizarProgresso(valor) {
    const janela = obterJanela();
    if (janela && !janela.isDestroyed()) {
      janela.setProgressBar(valor);
    }
  }

  autoUpdater.on("checking-for-update", () => {
    log.info("[Atualização] Verificando nova versão...");
  });

  autoUpdater.on("update-not-available", (informacoes) => {
    log.info(
      `[Atualização] Aplicativo atualizado (${informacoes?.version || app.getVersion()}).`,
    );
  });

  autoUpdater.on("update-available", async (informacoes) => {
    log.info(`[Atualização] Nova versão disponível: ${informacoes.version}.`);
    if (downloadEmAndamento || atualizacaoBaixada) return;

    try {
      const { response } = await mostrarMensagem(dialog, obterJanela(), {
        type: "info",
        title: "Atualização disponível",
        message: `A versão ${informacoes.version} do GarimpU Finch está disponível.`,
        detail:
          `Versão instalada: ${app.getVersion()}\n\n` +
          "Deseja baixar a atualização agora? Você pode continuar usando o aplicativo durante o download.",
        buttons: ["Baixar agora", "Depois"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });

      if (response !== 0) return;
      downloadEmAndamento = true;
      await autoUpdater.downloadUpdate();
    } catch (erro) {
      downloadEmAndamento = false;
      atualizarProgresso(-1);
      registrarErro("Falha ao iniciar o download", erro);
    }
  });

  autoUpdater.on("download-progress", (progresso) => {
    atualizarProgresso(Math.max(0, Math.min(1, progresso.percent / 100)));
    log.info(
      `[Atualização] Download: ${Math.round(progresso.percent)}% ` +
        `(${Math.round(progresso.bytesPerSecond / 1024)} KiB/s).`,
    );
  });

  autoUpdater.on("update-downloaded", async (informacoes) => {
    downloadEmAndamento = false;
    atualizacaoBaixada = true;
    atualizarProgresso(-1);
    log.info(`[Atualização] Versão ${informacoes.version} baixada.`);

    try {
      const { response } = await mostrarMensagem(dialog, obterJanela(), {
        type: "info",
        title: "Atualização pronta",
        message: `A versão ${informacoes.version} está pronta para instalar.`,
        detail:
          "O aplicativo precisa reiniciar para concluir a atualização. Seus arquivos e configurações serão mantidos.",
        buttons: ["Reiniciar e instalar", "Instalar ao sair"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });

      if (response !== 0) return;
      await prepararEncerramento();
      autoUpdater.quitAndInstall(false, true);
    } catch (erro) {
      registrarErro("Falha ao instalar a atualização", erro);
    }
  });

  autoUpdater.on("error", (erro) => {
    downloadEmAndamento = false;
    atualizarProgresso(-1);
    registrarErro("Erro no atualizador", erro);
  });

  async function verificarAtualizacoes() {
    if (!app.isPackaged || downloadEmAndamento || atualizacaoBaixada) return;
    try {
      await autoUpdater.checkForUpdates();
    } catch (erro) {
      registrarErro("Não foi possível verificar atualizações", erro);
    }
  }

  function iniciar() {
    if (iniciado || !app.isPackaged) return;
    iniciado = true;

    const primeiraVerificacao = agendar(
      () => void verificarAtualizacoes(),
      ATRASO_VERIFICACAO_MS,
    );
    primeiraVerificacao?.unref?.();

    const verificacaoPeriodica = repetir(
      () => void verificarAtualizacoes(),
      INTERVALO_VERIFICACAO_MS,
    );
    verificacaoPeriodica?.unref?.();
  }

  return {
    iniciar,
    verificarAtualizacoes,
  };
}

module.exports = {
  ATRASO_VERIFICACAO_MS,
  INTERVALO_VERIFICACAO_MS,
  criarGerenciadorAtualizacoes,
};
