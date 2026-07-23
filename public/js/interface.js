let dadosAtuais = null;
            let csvWix = null;
            let itensAcumulados = [];
            let intervaloStatusOrganizacao = null;
            let assinaturaColunasCsv = null;

            function normalizarNome(texto) {
                return String(texto || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-zA-Z0-9]/g, '')
                    .toLowerCase();
            }

            function assinaturaPalavrasNome(texto) {
                return Array.from(new Set(
                    String(texto || '')
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, ' ')
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean)
                )).sort().join('|');
            }

            function localizarItemWixPorNome(nomeHotel) {
                if (!csvWix) {
                    return { item: null, motivo: 'csv_nao_carregado' };
                }

                const nomeNormalizado = normalizarNome(nomeHotel);
                const candidatosExatos = csvWix.data.filter(
                    item => normalizarNome(item.Nome_Hotel) === nomeNormalizado
                );
                if (candidatosExatos.length === 1) {
                    return { item: candidatosExatos[0], motivo: null };
                }
                if (candidatosExatos.length > 1) {
                    return { item: null, motivo: 'repetido' };
                }

                const assinaturaHotel = assinaturaPalavrasNome(nomeHotel);
                const candidatosMesmasPalavras = csvWix.data.filter(
                    item => assinaturaPalavrasNome(item.Nome_Hotel) === assinaturaHotel
                );
                if (candidatosMesmasPalavras.length === 1) {
                    return { item: candidatosMesmasPalavras[0], motivo: null };
                }
                if (candidatosMesmasPalavras.length > 1) {
                    return { item: null, motivo: 'repetido' };
                }

                const candidatos = csvWix.data.filter(item => {
                    const nomeWix = normalizarNome(item.Nome_Hotel);
                    return nomeWix.length >= 6 &&
                        (nomeNormalizado.includes(nomeWix) ||
                            nomeWix.includes(nomeNormalizado));
                });

                if (candidatos.length === 1) {
                    return { item: candidatos[0], motivo: null };
                }

                return {
                    item: null,
                    motivo: candidatos.length > 1 ? 'repetido' : 'nao_encontrado'
                };
            }

            function encontrarItemWixPorNome(nomeHotel) {
                return localizarItemWixPorNome(nomeHotel).item;
            }

            function obterNomesColunasCsv() {
                const colunas = {
                    regime: document.getElementById('colunaRegimeCsv').value.trim(),
                    nota: document.getElementById('colunaNotaCsv').value.trim(),
                    tipo: document.getElementById('colunaTipoCsv').value.trim(),
                    bairros: document.getElementById('colunaBairrosCsv').value.trim(),
                    beiraMar: document.getElementById('colunaBeiraMarCsv').value.trim(),
                    endereco: document.getElementById('colunaEnderecoCsv').value.trim(),
                    plusCode: document.getElementById('colunaPlusCodeCsv').value.trim(),
                    distanciaNumero: document.getElementById('colunaDistanciaNumeroCsv').value.trim(),
                    distancia: document.getElementById('colunaDistanciaCsv').value.trim()
                };

                const nomes = Object.values(colunas);
                if (nomes.some(nome => !nome)) {
                    throw new Error('Os nomes das colunas do CSV não podem ficar vazios.');
                }

                const nomesNormalizados = nomes.map(normalizarNome);
                if (new Set(nomesNormalizados).size !== nomesNormalizados.length) {
                    throw new Error('Cada coluna do CSV precisa ter um nome diferente.');
                }

                if (nomesNormalizados.includes('id') || nomesNormalizados.includes('nomehotel')) {
                    throw new Error('ID e Nome_Hotel são campos reservados da integração com o Wix.');
                }

                return colunas;
            }

            function carregarCsvWix(arquivo) {
                const status = document.getElementById('csvWixStatus');
                if (!arquivo) {
                    csvWix = null;
                    status.innerText = 'Nenhum CSV carregado.';
                    return;
                }

                Papa.parse(arquivo, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (resultado) => {
                        const campos = resultado.meta.fields || [];
                        if (!campos.includes('ID') || !campos.includes('Nome_Hotel')) {
                            csvWix = null;
                            status.innerText = 'Arquivo inválido: faltam as colunas ID ou Nome_Hotel.';
                            status.className = 'text-xs text-red-400 mt-2';
                            return;
                        }

                        csvWix = resultado;
                        itensAcumulados = [];
                        assinaturaColunasCsv = null;
                        atualizarContadorCsv();
                        status.innerText = 'CSV carregado: ' + resultado.data.length + ' hotéis e ' + campos.length + ' colunas.';
                        status.className = 'text-xs text-emerald-400 mt-2';
                    },
                    error: (erro) => {
                        csvWix = null;
                        status.innerText = 'Erro ao ler o CSV: ' + erro.message;
                        status.className = 'text-xs text-red-400 mt-2';
                    }
                });
            }

            function atualizarContadorCsv() {
                const contador = document.getElementById('contadorCsv');
                const botaoExportar = document.getElementById('btnBaixarCSV');
                contador.innerText = itensAcumulados.length + (itensAcumulados.length === 1 ? ' hotel adicionado' : ' hotéis adicionados');
                contador.classList.toggle('hidden', itensAcumulados.length === 0);
                botaoExportar.classList.toggle('hidden', itensAcumulados.length === 0);
            }

            function adicionarAoCsv() {
                if (!dadosAtuais) return false;

                let colunasCsv;
                try {
                    colunasCsv = obterNomesColunasCsv();
                } catch (erro) {
                    alert(erro.message);
                    return false;
                }

                const assinaturaAtual = JSON.stringify(colunasCsv);
                if (assinaturaColunasCsv && assinaturaColunasCsv !== assinaturaAtual) {
                    alert('Os nomes das colunas foram alterados depois que hotéis já foram adicionados. Exporte a lista atual antes de usar uma nova configuração.');
                    return false;
                }
                assinaturaColunasCsv = assinaturaAtual;

                const distanciaEncontrada = String(dadosAtuais.aeroporto)
                    .match(/(\d+(?:[.,]\d+)?)\s*km/i);
                const distanciaAeroportoNumero = distanciaEncontrada
                    ? Number(distanciaEncontrada[1].replace(',', '.'))
                    : '';
                const distanciaAeroporto = distanciaAeroportoNumero
                    ? distanciaAeroportoNumero + ' km'
                    : '';
                const notaEncontrada = String(dadosAtuais.nota)
                    .match(/(?:10|[0-9])(?:[.,][0-9])?/);
                const notaAvaliacao = notaEncontrada
                    ? Number(notaEncontrada[0].replace(',', '.'))
                    : '';
                const regimeAlimentacao =
                    !dadosAtuais.regime ||
                    normalizarNome(dadosAtuais.regime) === 'naoinformado'
                        ? 'Café da manhã disponível'
                        : dadosAtuais.regime;
                const tinhaIdInformado = Boolean(dadosAtuais.idWix);
                if (!dadosAtuais.idWix) {
                    dadosAtuais.idWix = crypto.randomUUID();
                    document.getElementById('resIdWix').value = dadosAtuais.idWix;
                }

                const registro = {
                    ID: dadosAtuais.idWix,
                    Nome_Hotel: dadosAtuais.nome,
                    [colunasCsv.bairros]: dadosAtuais.bairro,
                    [colunasCsv.tipo]: dadosAtuais.tipoHotel,
                    [colunasCsv.beiraMar]: dadosAtuais.beiraMar,
                    [colunasCsv.nota]: notaAvaliacao,
                    [colunasCsv.endereco]: dadosAtuais.endereco,
                    [colunasCsv.plusCode]: dadosAtuais.plusCode,
                    [colunasCsv.distanciaNumero]: distanciaAeroportoNumero,
                    [colunasCsv.distancia]: distanciaAeroporto,
                    [colunasCsv.regime]: regimeAlimentacao
                };

                if (csvWix) {
                    const camposGarimpU = Object.values(colunasCsv);

                    camposGarimpU.forEach(campo => {
                        if (!csvWix.meta.fields.includes(campo)) {
                            csvWix.meta.fields.push(campo);
                            csvWix.data.forEach(item => { item[campo] = ''; });
                        }
                    });

                    let linha = csvWix.data.find(item => item.ID === registro.ID);
                    if (!linha) {
                        if (tinhaIdInformado) {
                            alert('O ID informado não existe no CSV. Apague o ID para cadastrar como hotel novo.');
                            return false;
                        }

                        linha = Object.fromEntries(csvWix.meta.fields.map(campo => [campo, '']));
                        linha.ID = registro.ID;
                        linha.Nome_Hotel = registro.Nome_Hotel;
                        csvWix.data.push(linha);
                    }

                    Object.assign(linha, {
                        [colunasCsv.bairros]: registro[colunasCsv.bairros],
                        [colunasCsv.tipo]: registro[colunasCsv.tipo],
                        [colunasCsv.beiraMar]: registro[colunasCsv.beiraMar],
                        [colunasCsv.nota]: registro[colunasCsv.nota],
                        [colunasCsv.endereco]: registro[colunasCsv.endereco],
                        [colunasCsv.plusCode]: registro[colunasCsv.plusCode],
                        [colunasCsv.distanciaNumero]: registro[colunasCsv.distanciaNumero],
                        [colunasCsv.distancia]: registro[colunasCsv.distancia],
                        [colunasCsv.regime]: registro[colunasCsv.regime]
                    });
                }

                const chave = registro.ID || normalizarNome(registro.Nome_Hotel);
                const indiceExistente = itensAcumulados.findIndex(item => (item.ID || normalizarNome(item.Nome_Hotel)) === chave);
                if (indiceExistente >= 0) itensAcumulados[indiceExistente] = registro;
                else itensAcumulados.push(registro);

                atualizarContadorCsv();
                const botao = document.getElementById('btnAdicionarCSV');
                const textoOriginal = botao.innerText;
                botao.innerText = '✓ Adicionado';
                setTimeout(() => { botao.innerText = textoOriginal; }, 1200);
                return true;
            }

            function baixarDadosCSV() {
                if (itensAcumulados.length === 0) {
                    alert('Adicione pelo menos um hotel ao CSV antes de baixar.');
                    return;
                }

                let conteudoCSV;
                let nomeArquivo;

                if (csvWix) {
                    const campos = csvWix.meta.fields;
                    const linhasOrdenadas = csvWix.data.map(item =>
                        campos.map(campo => item[campo] ?? '')
                    );

                    conteudoCSV = Papa.unparse({
                        fields: campos,
                        data: linhasOrdenadas
                    }, {
                        newline: '\r\n',
                        quotes: false
                    });
                    nomeArquivo = 'Hoteis_texto_atualizado.csv';
                } else {
                    conteudoCSV = Papa.unparse(itensAcumulados, {
                        newline: '\r\n',
                        quotes: false
                    });
                    nomeArquivo = 'Hoteis_Dados_Acumulados.csv';
                }

                const blob = new Blob(["\uFEFF" + conteudoCSV], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", nomeArquivo);
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            async function baixarGaleriaComoZip() {
                const btn = document.getElementById('btnBaixarTodas');
                const imagens = document.querySelectorAll('#galeriaGrid img');
                if (imagens.length === 0) return;

                const textoOriginal = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = `<div class="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>Aguarde, compactando centenas de imagens...`;

                const zip = new JSZip();
                const nomeHotel = document.getElementById('resNome').innerText.replace(/[^a-zA-Z0-9]/g, '_');

                try {
                    for (let i = 0; i < imagens.length; i++) {
                        const src = imagens[i].src;
                        const response = await fetch(src);
                        const blob = await response.blob();
                        zip.file(`foto_HD_${i + 1}.jpg`, blob);
                    }

                    const conteudoZip = await zip.generateAsync({ type: 'blob' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(conteudoZip);
                    link.download = `${nomeHotel}_galeria_HD_COMPLETA.zip`;
                    link.click();
                } catch (err) {
                    alert('Erro ao agrupar ficheiros: ' + err.message);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = textoOriginal;
                }
            }
