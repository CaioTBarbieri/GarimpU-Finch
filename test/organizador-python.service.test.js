const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const {
  criarOrganizadorPythonService,
} = require("../services/organizador-python.service");
const { PASTA_FLORENCE } = require("../config");

function criarProcessoFalso() {
  const processo = new EventEmitter();
  processo.stdout = new EventEmitter();
  processo.stderr = new EventEmitter();
  return processo;
}

function proximaIteracao() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("processa STATUS_JSON quebrado em chunks e a última linha do buffer", async () => {
  const processo = criarProcessoFalso();
  const atualizacoes = [];
  let finalizacoesSucesso = 0;
  let argumentosSpawn;
  const estado = {
    reiniciarEstado() {},
    atualizarDadosPython(dados) {
      atualizacoes.push(dados);
    },
    finalizarConcluido() {
      finalizacoesSucesso += 1;
    },
    finalizarErro() {
      assert.fail("Não deveria finalizar com erro.");
    },
  };
  const service = criarOrganizadorPythonService({
    criarProcesso(comando, argumentos, opcoes) {
      argumentosSpawn = { comando, argumentos, opcoes };
      return processo;
    },
    localizarPython: async () => ({
      comando: "python teste.exe",
      argumentosIniciais: ["-3.12"],
      versao: "3.12.10",
    }),
    estado,
    sistemaArquivos: { existsSync: () => true },
    logger: { log() {}, warn() {}, error() {} },
    agora: () => 1000,
  });

  assert.equal(service.iniciarOrganizacao(), true);
  await proximaIteracao();

  processo.stdout.emit(
    "data",
    Buffer.from('STATUS_JSON:{"etapa":"carregando_'),
  );
  processo.stdout.emit(
    "data",
    Buffer.from(
      'clip","mensagem":"Primeira"}\n' +
        'STATUS_JSON:{"etapa":"arquivo_',
    ),
  );
  processo.stdout.emit(
    "data",
    Buffer.from('concluido","mensagem":"Segunda"}'),
  );
  processo.emit("close", 0);

  assert.deepEqual(atualizacoes, [
    { etapa: "carregando_clip", mensagem: "Primeira" },
    { etapa: "arquivo_concluido", mensagem: "Segunda" },
  ]);
  assert.equal(finalizacoesSucesso, 1);
  assert.equal(argumentosSpawn.comando, "python teste.exe");
  assert.deepEqual(argumentosSpawn.argumentos.slice(0, 3), [
    "-3.12",
    "-u",
    argumentosSpawn.argumentos[2],
  ]);
  assert.equal(argumentosSpawn.argumentos.at(-1), PASTA_FLORENCE);
  assert.equal(argumentosSpawn.opcoes.windowsHide, true);
  assert.equal(
    argumentosSpawn.opcoes.env.PYTHONIOENCODING,
    "utf-8",
  );
});

test("eventos error e close finalizam o estado somente uma vez", async () => {
  const processo = criarProcessoFalso();
  const erros = [];
  let sucessos = 0;
  const service = criarOrganizadorPythonService({
    criarProcesso: () => processo,
    localizarPython: async () => ({
      comando: "python",
      argumentosIniciais: [],
      versao: "3.12.10",
    }),
    estado: {
      reiniciarEstado() {},
      atualizarDadosPython() {},
      finalizarConcluido() {
        sucessos += 1;
      },
      finalizarErro(mensagem) {
        erros.push(mensagem);
      },
    },
    sistemaArquivos: { existsSync: () => true },
    logger: { log() {}, warn() {}, error() {} },
  });

  service.iniciarOrganizacao();
  await proximaIteracao();
  processo.emit("error", new Error("Falha ao iniciar"));
  processo.emit("close", 1);

  assert.deepEqual(erros, ["Falha ao iniciar"]);
  assert.equal(sucessos, 0);
  assert.equal(service.estaExecutando(), false);
});

test("usa a pasta real do executavel empacotado como cwd", async () => {
  const processo = criarProcessoFalso();
  const pastaExecutavel = path.resolve("teste-python-organizer");
  const executavel = path.join(
    pastaExecutavel,
    "organizar_hoteis.exe",
  );
  let opcoesSpawn;
  const service = criarOrganizadorPythonService({
    criarProcesso(_comando, _argumentos, opcoes) {
      opcoesSpawn = opcoes;
      return processo;
    },
    localizarPython: async () => ({
      comando: executavel,
      argumentosIniciais: [],
      versao: "empacotado",
      executavelEmpacotado: true,
    }),
    estado: {
      reiniciarEstado() {},
      atualizarDadosPython() {},
      finalizarConcluido() {},
      finalizarErro(mensagem) {
        assert.fail(`Nao deveria finalizar com erro: ${mensagem}`);
      },
    },
    sistemaArquivos: { existsSync: () => true },
    logger: { log() {}, warn() {}, error() {} },
  });

  service.iniciarOrganizacao();
  await proximaIteracao();

  assert.equal(opcoesSpawn.cwd, pastaExecutavel);
  processo.emit("close", 0);
});

test("repassa a opção de reorganizar ao processo Python", async () => {
  const processo = criarProcessoFalso();
  let argumentosSpawn;
  const service = criarOrganizadorPythonService({
    criarProcesso(_comando, argumentos) {
      argumentosSpawn = argumentos;
      return processo;
    },
    localizarPython: async () => ({
      comando: "python",
      argumentosIniciais: [],
      versao: "3.12.10",
    }),
    estado: {
      reiniciarEstado() {},
      atualizarDadosPython() {},
      finalizarConcluido() {},
      finalizarErro() {},
    },
    sistemaArquivos: { existsSync: () => true },
    logger: { log() {}, warn() {}, error() {} },
  });

  service.iniciarOrganizacao({ reorganizar: true });
  await proximaIteracao();

  assert.equal(argumentosSpawn.at(-1), "--reorganizar");
  processo.emit("close", 0);
});

test("repassa a pasta mãe selecionada ao processo Python", async () => {
  const processo = criarProcessoFalso();
  let argumentosSpawn;
  const pastaSelecionada = path.resolve("img", "Jericoacoara");
  const service = criarOrganizadorPythonService({
    criarProcesso(_comando, argumentos) {
      argumentosSpawn = argumentos;
      return processo;
    },
    localizarPython: async () => ({
      comando: "python",
      argumentosIniciais: [],
      versao: "3.12.10",
    }),
    estado: {
      reiniciarEstado() {},
      atualizarDadosPython() {},
      finalizarConcluido() {},
      finalizarErro() {},
    },
    sistemaArquivos: { existsSync: () => true },
    logger: { log() {}, warn() {}, error() {} },
  });

  service.iniciarOrganizacao({
    reorganizar: true,
    pastaImagens: pastaSelecionada,
  });
  await proximaIteracao();

  assert.equal(
    argumentosSpawn[argumentosSpawn.indexOf("--pasta") + 1],
    pastaSelecionada,
  );
  assert.equal(argumentosSpawn.at(-1), "--reorganizar");
  processo.emit("close", 0);
});
