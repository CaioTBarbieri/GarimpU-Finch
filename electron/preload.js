"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "garimpuDesktop",
  Object.freeze({
    obterConfiguracoes: () => ipcRenderer.invoke("configuracoes:obter"),
    selecionarPasta: (caminhoAtual) =>
      ipcRenderer.invoke("configuracoes:selecionar-pasta", caminhoAtual),
    salvarConfiguracoes: (configuracoes) =>
      ipcRenderer.invoke("configuracoes:salvar", configuracoes),
  }),
);
