const test = require("node:test");
const assert = require("node:assert/strict");
const {
  criarEstadoInicial,
  criarControleStatus,
} = require("../state/status-organizacao");

function criarControleComRelogio() {
  let instante = 0;
  const controle = criarControleStatus({
    agora: () => instante,
  });
  return {
    controle,
    definirInstante: (novoInstante) => {
      instante = novoInstante;
    },
  };
}

test("cria o estado inicial com todos os campos", () => {
  assert.deepEqual(criarEstadoInicial(), {
    estado: "ocioso",
    etapa: null,
    mensagem: "Aguardando início da organização.",
    hotel: null,
    imagem: null,
    imagemAtual: 0,
    totalImagens: 0,
    inicioProcessamento: null,
    inicioProcessamentoImagens: null,
    fimProcessamento: null,
    tempoDecorridoSegundos: 0,
    tempoMedioPorImagemSegundos: null,
    tempoEstimadoRestanteSegundos: null,
    previsaoTermino: null,
    imagensProcessadasGeral: 0,
    totalImagensGeral: 0,
    imagensPendentesGeral: 0,
    temposRecentesImagens: [],
    historicoMensagens: [],
  });
});

test("atualiza parcialmente sem apagar propriedades", () => {
  const { controle } = criarControleComRelogio();
  controle.reiniciarEstado();
  controle.atualizarDadosPython({
    etapa: "carregando_clip",
    hotel: "Hotel Teste",
  });

  const estado = controle.obterEstado();
  assert.equal(estado.etapa, "carregando_clip");
  assert.equal(estado.hotel, "Hotel Teste");
  assert.equal(estado.estado, "processando");
  assert.equal(
    estado.mensagem,
    "Iniciando organização e carregamento dos modelos.",
  );
});

test("calcula a média móvel dos tempos das imagens", () => {
  const { controle, definirInstante } = criarControleComRelogio();
  controle.reiniciarEstado();

  definirInstante(1000);
  controle.atualizarDadosPython({
    etapa: "arquivo_concluido",
    imagensProcessadasGeral: 1,
    imagensPendentesGeral: 3,
  });
  definirInstante(3000);
  controle.atualizarDadosPython({
    etapa: "arquivo_concluido",
    imagensProcessadasGeral: 2,
    imagensPendentesGeral: 2,
  });

  assert.equal(
    controle.obterEstado().tempoMedioPorImagemSegundos,
    2,
  );
});

test("calcula tempo restante e previsão de conclusão", () => {
  const { controle, definirInstante } = criarControleComRelogio();
  controle.reiniciarEstado();

  definirInstante(1000);
  controle.atualizarDadosPython({
    etapa: "arquivo_concluido",
    imagensProcessadasGeral: 1,
    imagensPendentesGeral: 4,
  });
  definirInstante(3000);
  controle.atualizarDadosPython({
    etapa: "arquivo_concluido",
    imagensProcessadasGeral: 2,
    imagensPendentesGeral: 3,
  });

  const estado = controle.obterEstado();
  assert.equal(estado.tempoEstimadoRestanteSegundos, 6);
  assert.equal(estado.previsaoTermino, 9000);
});

test("limita os tempos recentes às últimas 10 imagens", () => {
  const { controle, definirInstante } = criarControleComRelogio();
  controle.reiniciarEstado();
  let instante = 0;

  controle.atualizarDadosPython({
    etapa: "arquivo_concluido",
    imagensProcessadasGeral: 1,
    imagensPendentesGeral: 11,
  });

  for (let intervalo = 1; intervalo <= 11; intervalo += 1) {
    instante += intervalo * 1000;
    definirInstante(instante);
    controle.atualizarDadosPython({
      etapa: "arquivo_concluido",
      imagensProcessadasGeral: intervalo + 1,
      imagensPendentesGeral: 11 - intervalo,
    });
  }

  assert.deepEqual(
    controle.obterEstado().temposRecentesImagens,
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  );
});

test("limita o histórico às últimas 10 mensagens", () => {
  const { controle } = criarControleComRelogio();
  controle.reiniciarEstado();
  for (let indice = 1; indice <= 12; indice += 1) {
    controle.atualizarDadosPython({
      mensagem: `Mensagem ${indice}`,
    });
  }

  const historico = controle.obterEstado().historicoMensagens;
  assert.equal(historico.length, 10);
  assert.equal(historico[0], "Mensagem 3");
  assert.equal(historico[9], "Mensagem 12");
});

test("finaliza com sucesso", () => {
  const { controle, definirInstante } = criarControleComRelogio();
  controle.reiniciarEstado();
  definirInstante(5000);
  controle.finalizarConcluido();

  const estado = controle.obterEstado();
  assert.equal(estado.estado, "concluido");
  assert.equal(estado.etapa, "concluido");
  assert.equal(estado.mensagem, "Organização concluída.");
  assert.equal(estado.fimProcessamento, 5000);
  assert.equal(estado.tempoEstimadoRestanteSegundos, 0);
  assert.equal(estado.previsaoTermino, 5000);
  assert.equal(estado.imagensPendentesGeral, 0);
});

test("finaliza com erro", () => {
  const { controle, definirInstante } = criarControleComRelogio();
  controle.reiniciarEstado();
  definirInstante(4000);
  controle.finalizarErro("Falha controlada");

  const estado = controle.obterEstado();
  assert.equal(estado.estado, "erro");
  assert.equal(estado.etapa, "erro");
  assert.equal(estado.mensagem, "Falha controlada");
  assert.equal(estado.fimProcessamento, 4000);
});

test("fornece uma cópia segura do estado", () => {
  const { controle } = criarControleComRelogio();
  controle.reiniciarEstado();
  const copia = controle.obterEstado();
  copia.estado = "alterado";
  copia.historicoMensagens.push("Mensagem externa");

  const estado = controle.obterEstado();
  assert.equal(estado.estado, "processando");
  assert.deepEqual(estado.historicoMensagens, [
    "Iniciando organização e carregamento dos modelos.",
  ]);
});
