const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  criarOrganizadorPythonService,
} = require("../services/organizador-python.service");

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
