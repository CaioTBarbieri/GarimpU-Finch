// Copia o Chrome usado pelo Puppeteer para resources/chromium, de onde o
// electron-builder o empacota (extraResources). Sem isso o instalador sai
// sem navegador e o app nao consegue iniciar.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const raizProjeto = path.resolve(__dirname, "..");
const executavel = puppeteer.executablePath();

if (!fs.existsSync(executavel)) {
  console.error(`Chrome do Puppeteer nao encontrado em: ${executavel}`);
  console.error("Rode: npx puppeteer browsers install chrome");
  process.exit(1);
}

// .../chrome/<versao>/chrome-win64/chrome.exe -> .../chrome/<versao>
const pastaVersao = path.dirname(path.dirname(executavel));
const versao = path.basename(pastaVersao);
const destino = path.join(raizProjeto, "resources", "chromium", "chrome");
const destinoVersao = path.join(destino, versao);

const destinoExe = path.join(
  destinoVersao,
  path.relative(pastaVersao, executavel),
);
if (fs.existsSync(destinoExe)) {
  console.log(`[=] Chromium reutilizado: ${versao}`);
  process.exit(0);
}

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });
fs.cpSync(pastaVersao, destinoVersao, { recursive: true });
console.log(`[+] Chromium copiado: ${versao}`);
