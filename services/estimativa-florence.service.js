const fs = require("fs");
const path = require("path");

const EXTENSOES_IMAGEM = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".tiff",
  ".tif",
]);

function listarImagensSoltas(diretorio, sistemaArquivos = fs) {
  return sistemaArquivos
    .readdirSync(diretorio, { withFileTypes: true })
    .filter(
      (entrada) =>
        entrada.isFile() &&
        EXTENSOES_IMAGEM.has(path.extname(entrada.name).toLowerCase()),
    )
    .map((entrada) => {
      const caminho = path.join(diretorio, entrada.name);
      let tamanhoBytes = 0;
      try {
        tamanhoBytes = sistemaArquivos.statSync(caminho).size;
      } catch (_) {
        // Arquivos inacessíveis contam como zero bytes, mas continuam no lote.
      }
      return { nome: entrada.name, tamanhoBytes };
    });
}

function inventariarLoteFlorence(pastaImagens, sistemaArquivos = fs) {
  const imagensRaiz = listarImagensSoltas(
    pastaImagens,
    sistemaArquivos,
  );
  let hoteis;

  if (imagensRaiz.length > 0) {
    hoteis = [
      {
        nome: path.basename(pastaImagens),
        imagens: imagensRaiz,
      },
    ];
  } else {
    hoteis = sistemaArquivos
      .readdirSync(pastaImagens, { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory())
      .map((entrada) => {
        const diretorio = path.join(pastaImagens, entrada.name);
        return {
          nome: entrada.name,
          imagens: listarImagensSoltas(diretorio, sistemaArquivos),
        };
      })
      .filter((hotel) => hotel.imagens.length > 0);
  }

  const imagens = hoteis.flatMap((hotel) => hotel.imagens);
  return {
    numeroHoteis: hoteis.length,
    numeroImagens: imagens.length,
    tamanhoTotalBytes: imagens.reduce(
      (total, imagem) => total + imagem.tamanhoBytes,
      0,
    ),
  };
}

function analisarCsv(conteudo, delimitador = ";") {
  const linhas = [];
  let linha = [];
  let campo = "";
  let entreAspas = false;

  for (let indice = 0; indice < conteudo.length; indice += 1) {
    const caractere = conteudo[indice];
    const proximo = conteudo[indice + 1];

    if (caractere === '"') {
      if (entreAspas && proximo === '"') {
        campo += '"';
        indice += 1;
      } else {
        entreAspas = !entreAspas;
      }
    } else if (caractere === delimitador && !entreAspas) {
      linha.push(campo);
      campo = "";
    } else if ((caractere === "\n" || caractere === "\r") && !entreAspas) {
      if (caractere === "\r" && proximo === "\n") indice += 1;
      linha.push(campo);
      campo = "";
      if (linha.some((valor) => valor !== "")) linhas.push(linha);
      linha = [];
    } else {
      campo += caractere;
    }
  }

  linha.push(campo);
  if (linha.some((valor) => valor !== "")) linhas.push(linha);
  if (linhas.length === 0) return [];

  const cabecalhos = linhas.shift().map((valor, indice) =>
    indice === 0 ? valor.replace(/^\uFEFF/, "") : valor,
  );
  return linhas.map((valores) =>
    Object.fromEntries(
      cabecalhos.map((cabecalho, indice) => [
        cabecalho,
        valores[indice] ?? "",
      ]),
    ),
  );
}

function obterTamanhoTotalRegistro(registro) {
  const totalInformado = Number(registro.tamanho_total_bytes);
  if (Number.isFinite(totalInformado) && totalInformado >= 0) {
    return totalInformado;
  }

  try {
    const tamanhos = JSON.parse(registro.tamanhos_imagens_bytes || "[]");
    if (!Array.isArray(tamanhos)) return 0;
    return tamanhos.reduce(
      (total, imagem) => total + Math.max(0, Number(imagem.bytes) || 0),
      0,
    );
  } catch (_) {
    return 0;
  }
}

function lerExecucoesHistoricas(pastaLogs, sistemaArquivos = fs) {
  if (!sistemaArquivos.existsSync(pastaLogs)) return [];

  const grupos = new Map();
  const arquivos = sistemaArquivos
    .readdirSync(pastaLogs, { withFileTypes: true })
    .filter(
      (entrada) =>
        entrada.isFile() &&
        entrada.name.toLowerCase().endsWith(".csv") &&
        !entrada.name.toLowerCase().endsWith(".example.csv"),
    );

  for (const arquivo of arquivos) {
    const caminho = path.join(pastaLogs, arquivo.name);
    const registros = analisarCsv(
      sistemaArquivos.readFileSync(caminho, "utf8"),
    );

    registros.forEach((registro, indice) => {
      if (registro.status && registro.status !== "concluido") return;

      const duracao = Number(
        String(registro.duracao_segundos || "").replace(",", "."),
      );
      const numeroImagens = Number(
        registro.numero_imagens || registro.total_imagens,
      );
      const numeroHoteis = Number(registro.numero_hoteis) || 1;
      if (
        !Number.isFinite(duracao) ||
        duracao <= 0 ||
        !Number.isFinite(numeroImagens) ||
        numeroImagens <= 0
      ) {
        return;
      }

      const chave =
        registro.execucao_id || `${arquivo.name}:${indice + 1}`;
      const grupo = grupos.get(chave) || {
        execucaoId: chave,
        duracaoSegundos: 0,
        numeroImagens: 0,
        tamanhoTotalBytes: 0,
        numeroHoteis: 0,
      };
      grupo.duracaoSegundos += duracao;
      grupo.numeroImagens += numeroImagens;
      grupo.tamanhoTotalBytes += obterTamanhoTotalRegistro(registro);
      grupo.numeroHoteis = Math.max(grupo.numeroHoteis, numeroHoteis);
      grupos.set(chave, grupo);
    });
  }

  return [...grupos.values()];
}

function calcularEstimativaFlorence({
  pastaImagens,
  pastaLogs,
  sistemaArquivos = fs,
}) {
  const inventario = inventariarLoteFlorence(
    pastaImagens,
    sistemaArquivos,
  );
  const execucoes = lerExecucoesHistoricas(
    pastaLogs,
    sistemaArquivos,
  );
  const base = {
    ...inventario,
    execucoesHistoricas: execucoes.length,
  };

  if (inventario.numeroImagens === 0) {
    return {
      disponivel: false,
      motivo: "Nenhuma imagem pendente de classificação foi encontrada.",
      ...base,
    };
  }
  if (execucoes.length === 0) {
    return {
      disponivel: false,
      motivo: "Ainda não existem logs históricos válidos.",
      ...base,
    };
  }

  const totais = execucoes.reduce(
    (acumulado, execucao) => ({
      duracao: acumulado.duracao + execucao.duracaoSegundos,
      imagens: acumulado.imagens + execucao.numeroImagens,
      bytes: acumulado.bytes + execucao.tamanhoTotalBytes,
      hoteis: acumulado.hoteis + execucao.numeroHoteis,
    }),
    { duracao: 0, imagens: 0, bytes: 0, hoteis: 0 },
  );
  const componentes = [
    {
      peso: 0.55,
      valor:
        inventario.numeroImagens * (totais.duracao / totais.imagens),
    },
    {
      peso: totais.bytes > 0 ? 0.3 : 0,
      valor:
        totais.bytes > 0
          ? inventario.tamanhoTotalBytes *
            (totais.duracao / totais.bytes)
          : 0,
    },
    {
      peso: totais.hoteis > 0 ? 0.15 : 0,
      valor:
        totais.hoteis > 0
          ? inventario.numeroHoteis *
            (totais.duracao / totais.hoteis)
          : 0,
    },
  ].filter((componente) => componente.peso > 0);
  const pesoTotal = componentes.reduce(
    (total, componente) => total + componente.peso,
    0,
  );
  const tempoEstimadoSegundos = Math.max(
    1,
    Math.round(
      componentes.reduce(
        (total, componente) =>
          total + componente.valor * componente.peso,
        0,
      ) / pesoTotal,
    ),
  );

  return {
    disponivel: true,
    ...base,
    tempoEstimadoSegundos,
    faixaMinimaSegundos: Math.max(
      1,
      Math.round(tempoEstimadoSegundos * 0.8),
    ),
    faixaMaximaSegundos: Math.max(
      1,
      Math.round(tempoEstimadoSegundos * 1.2),
    ),
  };
}

module.exports = {
  analisarCsv,
  calcularEstimativaFlorence,
  inventariarLoteFlorence,
  lerExecucoesHistoricas,
};
