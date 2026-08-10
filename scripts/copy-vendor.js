const fs = require("fs");
const path = require("path");

const raiz = path.resolve(__dirname, "..");
const destino = path.join(raiz, "public", "vendor");
fs.mkdirSync(destino, { recursive: true });

const arquivos = [
  [
    path.join(raiz, "node_modules", "jszip", "dist", "jszip.min.js"),
    path.join(destino, "jszip.min.js"),
  ],
  [
    path.join(
      raiz,
      "node_modules",
      "papaparse",
      "papaparse.min.js",
    ),
    path.join(destino, "papaparse.min.js"),
  ],
];

for (const [origem, alvo] of arquivos) {
  if (!fs.existsSync(origem)) {
    throw new Error(`Dependência de frontend não encontrada: ${origem}`);
  }
  fs.copyFileSync(origem, alvo);
}

console.log("[+] Bibliotecas de frontend copiadas para public/vendor.");
