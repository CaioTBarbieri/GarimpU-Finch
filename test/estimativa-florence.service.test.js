const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  calcularEstimativaFlorence,
  lerExecucoesHistoricas,
} = require("../services/estimativa-florence.service");

function criarArquivo(caminho, tamanho) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, Buffer.alloc(tamanho));
}

test("agrupa logs por execução e estima usando imagens, bytes e hotéis", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "estimativa-florence-"));
  const pastaImagens = path.join(raiz, "img");
  const pastaLogs = path.join(raiz, "logs");
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));

  criarArquivo(path.join(pastaImagens, "Hotel A", "1.jpg"), 100);
  criarArquivo(path.join(pastaImagens, "Hotel A", "2.jpg"), 100);
  criarArquivo(path.join(pastaImagens, "Hotel B", "1.jpg"), 100);
  fs.mkdirSync(pastaLogs, { recursive: true });
  fs.writeFileSync(
    path.join(pastaLogs, "historico.csv"),
    [
      "execucao_id;hotel;duracao_segundos;numero_imagens;tamanho_total_bytes;numero_hoteis;status",
      "exec-1;HOTEL A;60;6;600;2;concluido",
      "exec-1;HOTEL B;40;4;400;2;concluido",
    ].join("\n"),
  );

  const execucoes = lerExecucoesHistoricas(pastaLogs);
  const estimativa = calcularEstimativaFlorence({
    pastaImagens,
    pastaLogs,
  });

  assert.equal(execucoes.length, 1);
  assert.equal(execucoes[0].duracaoSegundos, 100);
  assert.equal(estimativa.disponivel, true);
  assert.equal(estimativa.numeroImagens, 3);
  assert.equal(estimativa.tamanhoTotalBytes, 300);
  assert.equal(estimativa.numeroHoteis, 2);
  assert.equal(estimativa.tempoEstimadoSegundos, 41);
});

test("informa quando não existem logs históricos", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "sem-log-florence-"));
  const pastaImagens = path.join(raiz, "img");
  const pastaLogs = path.join(raiz, "logs");
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));

  criarArquivo(path.join(pastaImagens, "Hotel", "foto.jpg"), 50);
  fs.mkdirSync(pastaLogs, { recursive: true });

  const resultado = calcularEstimativaFlorence({
    pastaImagens,
    pastaLogs,
  });

  assert.equal(resultado.disponivel, false);
  assert.match(resultado.motivo, /logs históricos/i);
});
