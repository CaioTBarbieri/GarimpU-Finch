"use strict";

const fs = require("fs");
const path = require("path");

function validarDiretorio(nome, valor) {
  if (typeof valor !== "string" || !valor.trim()) {
    throw new Error(`${nome} não pode ficar vazio.`);
  }

  const caminho = path.normalize(valor.trim());
  if (!path.isAbsolute(caminho)) {
    throw new Error(`${nome} deve ser um caminho absoluto.`);
  }
  return caminho;
}

function criarRepositorioConfiguracoes({
  arquivoConfiguracoes,
  pastaDocumentos,
  sistemaArquivos = fs,
  logger = console,
}) {
  const pastaPadrao = path.join(pastaDocumentos, "Imagens");
  const padroes = Object.freeze({
    pastaImagens: pastaPadrao,
    pastaFlorence: pastaPadrao,
  });

  function carregar() {
    if (!sistemaArquivos.existsSync(arquivoConfiguracoes)) {
      return { ...padroes };
    }

    try {
      const dados = JSON.parse(
        sistemaArquivos.readFileSync(arquivoConfiguracoes, "utf8"),
      );
      return {
        pastaImagens: validarDiretorio(
          "Pasta das imagens",
          dados.pastaImagens || padroes.pastaImagens,
        ),
        pastaFlorence: validarDiretorio(
          "Pasta do Florence",
          dados.pastaFlorence || dados.pastaImagens || padroes.pastaFlorence,
        ),
      };
    } catch (erro) {
      logger.warn(
        `[Configurações] Arquivo ignorado por ser inválido: ${erro.message}`,
      );
      return { ...padroes };
    }
  }

  function salvar(dados) {
    const configuracoes = {
      pastaImagens: validarDiretorio(
        "Pasta das imagens",
        dados?.pastaImagens,
      ),
      pastaFlorence: validarDiretorio(
        "Pasta do Florence",
        dados?.pastaFlorence,
      ),
    };

    sistemaArquivos.mkdirSync(configuracoes.pastaImagens, {
      recursive: true,
    });
    sistemaArquivos.mkdirSync(configuracoes.pastaFlorence, {
      recursive: true,
    });
    sistemaArquivos.mkdirSync(path.dirname(arquivoConfiguracoes), {
      recursive: true,
    });
    sistemaArquivos.writeFileSync(
      arquivoConfiguracoes,
      `${JSON.stringify(configuracoes, null, 2)}\n`,
      "utf8",
    );
    return configuracoes;
  }

  return {
    carregar,
    salvar,
    obterPadroes: () => ({ ...padroes }),
  };
}

module.exports = {
  criarRepositorioConfiguracoes,
  validarDiretorio,
};
