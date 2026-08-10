const test = require("node:test");
const assert = require("node:assert/strict");
const { criarCoordenadorScraper } = require("../services/scraper.service");
const { ErroFonte, ErroEntrada } = require("../services/scraper/scraper-errors");

function criarFakePage() {
  return {
    setDefaultNavigationTimeout() {},
    async close() {},
  };
}

function criarFakeBrowser(paginas) {
  return {
    async newPage() {
      const page = criarFakePage();
      paginas.push(page);
      return page;
    },
    async close() {},
  };
}

function criarCoordenadorDeTeste({ buscarNaBooking, buscarNaExpedia }) {
  const paginas = [];
  const coordenador = criarCoordenadorScraper({
    buscarNaBooking,
    buscarNaExpedia,
    lancarBrowser: async () => criarFakeBrowser(paginas),
    pastaImagensBase: "/tmp/nao-usado",
    latitudePadrao: -14.815,
    longitudePadrao: -39.0333,
  });
  return { coordenador, paginas };
}

const RESULTADO_BOOKING_OK = {
  sucesso: true,
  nome: "HOTEL EXEMPLO",
  endereco: "Rua Exemplo, 123",
  bairro: "Centro",
  tipoHotel: "Hotel",
  beiraMar: "Não",
  coordenadas: "-3.1, -38.5",
  plusCode: "ABC123",
  nota: "9,0",
  regime: "Café da manhã incluído",
  aeroporto: "10 km (Booking)",
  imagens: [],
  altTexts: {},
  baixouLocal: false,
  fonte: "Booking",
  urlFonte: "https://www.booking.com/hotel/br/exemplo.pt-br.html",
};

// 15. Booking funcionando não deve acionar a Expedia
test("rasparDadosHotel: usa Booking com sucesso e não chama Expedia", async () => {
  let chamouExpedia = false;
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async () => RESULTADO_BOOKING_OK,
    buscarNaExpedia: async () => {
      chamouExpedia = true;
      throw new Error("não deveria ser chamado");
    },
  });

  const resultado = await coordenador.rasparDadosHotel("Hotel Exemplo");

  assert.equal(resultado.sucesso, true);
  assert.equal(resultado.fonte, "Booking");
  assert.equal(chamouExpedia, false);
});

test("rasparDadosHotel: repassa a pasta mãe como destino sem alterar a raiz pública", async () => {
  let opcoesRecebidas;
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async (_page, opcoes) => {
      opcoesRecebidas = opcoes;
      return RESULTADO_BOOKING_OK;
    },
    buscarNaExpedia: async () => RESULTADO_BOOKING_OK,
  });

  await coordenador.rasparDadosHotel(
    "Hotel Exemplo",
    true,
    -14.815,
    -39.0333,
    { modo: "nenhum" },
    "/tmp/nao-usado/Itacaré",
  );

  assert.equal(opcoesRecebidas.pastaImagensBase, "/tmp/nao-usado");
  assert.equal(
    opcoesRecebidas.pastaImagensDestino,
    "/tmp/nao-usado/Itacaré",
  );
});

// 16. Booking falhando e Expedia funcionando aciona o fallback
test("rasparDadosHotel: Booking falha e Expedia assume com sucesso", async () => {
  const chamadas = [];
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async () => {
      chamadas.push("booking");
      throw new ErroFonte("nenhum resultado", { fonte: "Booking" });
    },
    buscarNaExpedia: async () => {
      chamadas.push("expedia");
      return {
        ...RESULTADO_BOOKING_OK,
        fonte: "Expedia",
        urlFonte: "https://www.expedia.com.br/Hotel-Exemplo.h1.Hotel-Information",
      };
    },
  });

  const resultado = await coordenador.rasparDadosHotel("Hotel Exemplo");

  assert.equal(resultado.sucesso, true);
  assert.equal(resultado.fonte, "Expedia");
  assert.deepEqual(chamadas, ["booking", "expedia"]);
});

// 17. Booking e Expedia falhando: retorna erro combinado, sem esconder a falha da Booking
test("rasparDadosHotel: Booking e Expedia falham e o erro combinado cita as duas fontes", async () => {
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async () => {
      throw new ErroFonte("nenhum resultado após 3 tentativas", {
        fonte: "Booking",
      });
    },
    buscarNaExpedia: async () => {
      throw new ErroFonte("nenhum resultado compatível", { fonte: "Expedia" });
    },
  });

  const resultado = await coordenador.rasparDadosHotel("Hotel Exemplo");

  assert.equal(resultado.sucesso, false);
  assert.match(resultado.erro, /Booking/);
  assert.match(resultado.erro, /Expedia/);
  assert.match(resultado.erro, /nenhum resultado após 3 tentativas/);
  assert.match(resultado.erro, /nenhum resultado compatível/);
});

// 18. Erro de entrada não aciona a Expedia
test("rasparDadosHotel: erro de entrada na Booking não aciona a Expedia", async () => {
  let chamouExpedia = false;
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async () => {
      throw new ErroEntrada("Latitude de referência inválida.");
    },
    buscarNaExpedia: async () => {
      chamouExpedia = true;
      return RESULTADO_BOOKING_OK;
    },
  });

  const resultado = await coordenador.rasparDadosHotel("Hotel Exemplo");

  assert.equal(resultado.sucesso, false);
  assert.equal(chamouExpedia, false);
});

test("rasparDadosHotel: domínio não permitido é rejeitado antes de acionar qualquer fonte", async () => {
  let chamouBooking = false;
  let chamouExpedia = false;
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async () => {
      chamouBooking = true;
      return RESULTADO_BOOKING_OK;
    },
    buscarNaExpedia: async () => {
      chamouExpedia = true;
      return RESULTADO_BOOKING_OK;
    },
  });

  const resultado = await coordenador.rasparDadosHotel(
    "https://www.exemplo-malicioso.com/hotel",
  );

  assert.equal(resultado.sucesso, false);
  assert.equal(chamouBooking, false);
  assert.equal(chamouExpedia, false);
});

// 19. Resposta final contendo fonte e urlFonte
test("rasparDadosHotel: resposta de sucesso contém fonte e urlFonte", async () => {
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async () => RESULTADO_BOOKING_OK,
    buscarNaExpedia: async () => RESULTADO_BOOKING_OK,
  });

  const resultado = await coordenador.rasparDadosHotel("Hotel Exemplo");

  assert.equal(resultado.fonte, "Booking");
  assert.equal(
    resultado.urlFonte,
    "https://www.booking.com/hotel/br/exemplo.pt-br.html",
  );
});

// 20. Preservação do contrato atual do scraper
test("rasparDadosHotel: preserva a assinatura pública e os campos do contrato", async () => {
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async () => RESULTADO_BOOKING_OK,
    buscarNaExpedia: async () => RESULTADO_BOOKING_OK,
  });

  // nomeHotel é obrigatório; os demais têm valores padrão (não contam em .length)
  assert.equal(coordenador.rasparDadosHotel.length, 1);

  const resultado = await coordenador.rasparDadosHotel(
    "Hotel Exemplo",
    false,
    -3.1,
    -38.5,
  );

  const camposEsperados = [
    "sucesso",
    "nome",
    "endereco",
    "bairro",
    "tipoHotel",
    "beiraMar",
    "coordenadas",
    "plusCode",
    "nota",
    "regime",
    "aeroporto",
    "imagens",
    "altTexts",
    "baixouLocal",
    "fonte",
    "urlFonte",
  ];
  camposEsperados.forEach((campo) => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(resultado, campo),
      `campo ausente: ${campo}`,
    );
  });
});

test("rasparDadosHotel: nome do hotel vazio retorna erro sem acionar nenhuma fonte", async () => {
  let chamouAlguma = false;
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async () => {
      chamouAlguma = true;
      return RESULTADO_BOOKING_OK;
    },
    buscarNaExpedia: async () => {
      chamouAlguma = true;
      return RESULTADO_BOOKING_OK;
    },
  });

  const resultado = await coordenador.rasparDadosHotel("   ");

  assert.equal(resultado.sucesso, false);
  assert.equal(chamouAlguma, false);
});

// 22. Hotel encontrado longe da referência é sinalizado (evita aceitar em
// silêncio um homônimo de outra cidade/país, já que o casamento por nome
// não valida localização)
test("rasparDadosHotel: hotel encontrado longe da referência é sinalizado como fora da área", async () => {
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async () => ({
      ...RESULTADO_BOOKING_OK,
      coordenadas: "40.4168, -3.7038", // Madrid, Espanha
    }),
    buscarNaExpedia: async () => RESULTADO_BOOKING_OK,
  });

  // Referência padrão do coordenador de teste fica no Brasil.
  const resultado = await coordenador.rasparDadosHotel("Hotel Exemplo");

  assert.equal(resultado.localizacaoForaDaArea, true);
  assert.ok(resultado.distanciaReferenciaKm > 300);
});

test("rasparDadosHotel: hotel encontrado perto da referência não é sinalizado", async () => {
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async () => RESULTADO_BOOKING_OK,
    buscarNaExpedia: async () => RESULTADO_BOOKING_OK,
  });

  const resultado = await coordenador.rasparDadosHotel(
    "Hotel Exemplo",
    true,
    -3.1,
    -38.5, // mesma coordenada de RESULTADO_BOOKING_OK
  );

  assert.equal(resultado.localizacaoForaDaArea, false);
  assert.equal(resultado.distanciaReferenciaKm, 0);
});

test("rasparDadosHotel: link direto da Expedia vai direto para a Expedia sem tentar Booking", async () => {
  let chamouBooking = false;
  const { coordenador } = criarCoordenadorDeTeste({
    buscarNaBooking: async () => {
      chamouBooking = true;
      return RESULTADO_BOOKING_OK;
    },
    buscarNaExpedia: async () => ({
      ...RESULTADO_BOOKING_OK,
      fonte: "Expedia",
      urlFonte: "https://www.expedia.com.br/Hotel-Exemplo.h1.Hotel-Information",
    }),
  });

  const resultado = await coordenador.rasparDadosHotel(
    "https://www.expedia.com.br/Hotel-Exemplo.h1.Hotel-Information",
  );

  assert.equal(chamouBooking, false);
  assert.equal(resultado.fonte, "Expedia");
});
