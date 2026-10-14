const fs = require("fs");
const path = require("path");

// Navegadores baseados em Chromium aceitos pelo Puppeteer, em ordem de preferência.
function candidatosNavegadorWindows(env = process.env) {
  const bases = [
    env.PROGRAMFILES,
    env["PROGRAMFILES(X86)"],
    env.LOCALAPPDATA,
  ].filter(Boolean);

  const relativos = [
    ["Google", "Chrome", "Application", "chrome.exe"],
    ["Microsoft", "Edge", "Application", "msedge.exe"],
    ["BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
    ["Chromium", "Application", "chrome.exe"],
  ];

  return bases.flatMap((base) =>
    relativos.map((partes) => path.join(base, ...partes)),
  );
}

function obterChromiumDoPuppeteer() {
  try {
    return require("puppeteer").executablePath();
  } catch {
    return null;
  }
}

// Define qual executável o Puppeteer deve usar. Um caminho configurado que não
// existe (ex.: erro de digitação) não derruba a busca: cai para o próximo.
function resolverExecutavelNavegador({
  configurado,
  existe = fs.existsSync,
  chromiumPuppeteer = obterChromiumDoPuppeteer,
  candidatos = candidatosNavegadorWindows,
  aviso = console.warn,
} = {}) {
  if (configurado) {
    if (existe(configurado)) return configurado;
    aviso(
      `[Navegador] Caminho configurado não encontrado: ${configurado}. Procurando outro navegador...`,
    );
  }

  const doPuppeteer = chromiumPuppeteer();
  if (doPuppeteer && existe(doPuppeteer)) return doPuppeteer;

  const instalado = candidatos().find((caminho) => existe(caminho));
  if (instalado) {
    aviso(`[Navegador] Usando navegador instalado: ${instalado}`);
    return instalado;
  }

  return undefined;
}

module.exports = { resolverExecutavelNavegador, candidatosNavegadorWindows };
