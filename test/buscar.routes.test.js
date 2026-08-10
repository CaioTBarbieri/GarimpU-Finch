const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");
const criarBuscarRouter = require("../routes/buscar.routes");

async function criarServidorTeste(t, rasparDadosHotel) {
  const app = express();
  app.use(express.json());
  app.use(
    criarBuscarRouter({
      rasparDadosHotel,
      latitudePadrao: -14.815,
      longitudePadrao: -39.0333,
      pastaImagensBase: path.resolve("img-teste"),
    }),
  );
  const servidor = await new Promise((resolve) => {
    const instancia = app.listen(0, "127.0.0.1", () => resolve(instancia));
  });
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  return `http://127.0.0.1:${servidor.address().port}`;
}

test("POST /api/buscar direciona o download para a pasta mãe", async (t) => {
  let argumentos;
  const baseUrl = await criarServidorTeste(t, async (...recebidos) => {
    argumentos = recebidos;
    return { sucesso: true, nome: "Hotel Teste", imagens: [] };
  });

  const resposta = await fetch(`${baseUrl}/api/buscar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nome: "Hotel Teste",
      baixarImagens: true,
      pastaMaeDownload: "Itacaré",
    }),
  });
  const dados = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(dados.pastaMaeDownload, "Itacaré");
  assert.equal(
    argumentos[5],
    path.resolve("img-teste", "Itacaré"),
  );
});

test("POST /api/buscar bloqueia caminho externo antes do scraper", async (t) => {
  let chamadas = 0;
  const baseUrl = await criarServidorTeste(t, async () => {
    chamadas += 1;
    return { sucesso: true };
  });

  const resposta = await fetch(`${baseUrl}/api/buscar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nome: "Hotel Teste",
      baixarImagens: true,
      pastaMaeDownload: "../fora",
    }),
  });
  const dados = await resposta.json();

  assert.equal(resposta.status, 400);
  assert.match(dados.erro, /pasta-mãe/);
  assert.equal(chamadas, 0);
});
