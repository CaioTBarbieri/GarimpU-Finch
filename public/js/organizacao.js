            function formatarDuracao(totalSegundos) {
                if (totalSegundos == null || !Number.isFinite(Number(totalSegundos))) {
                    return 'Calculando estimativa...';
                }

                const segundosValidos = Math.max(0, Math.floor(Number(totalSegundos)));
                const horas = Math.floor(segundosValidos / 3600);
                const minutos = Math.floor((segundosValidos % 3600) / 60);
                const segundos = segundosValidos % 60;

                return String(horas).padStart(2, '0') + ':' +
                    String(minutos).padStart(2, '0') + ':' +
                    String(segundos).padStart(2, '0');
            }

            function prepararPainelOrganizacao() {
                const loader = document.getElementById('loader');
                loader.innerHTML =
                    '<div class="max-w-2xl mx-auto text-left bg-slate-800 border border-purple-500/30 rounded-2xl p-6 shadow-xl">' +
                        '<div class="flex items-center gap-3 mb-5">' +
                            '<div id="statusSpinnerIA" class="w-8 h-8 border-4 border-t-purple-500 border-slate-700 rounded-full animate-spin"></div>' +
                            '<div><p class="text-xl text-purple-400 font-bold">Organização de imagens</p>' +
                            '<p id="statusMensagemIA" class="text-sm text-slate-400">Iniciando...</p></div>' +
                        '</div>' +
                        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">' +
                            '<p><span id="statusRotuloTempoIA" class="text-slate-400">Tempo decorrido:</span> <span id="statusTempoDecorridoIA" class="font-mono">00:00:00</span></p>' +
                            '<p><span class="text-slate-400">Média por imagem:</span> <span id="statusTempoMedioIA" class="font-mono">Calculando estimativa...</span></p>' +
                            '<p><span class="text-slate-400">Tempo restante estimado:</span> <span id="statusTempoRestanteIA" class="font-mono">Calculando estimativa...</span></p>' +
                            '<p><span class="text-slate-400">Conclusão prevista:</span> <span id="statusPrevisaoTerminoIA" class="font-mono">Calculando estimativa...</span></p>' +
                            '<p><span class="text-slate-400">Progresso geral:</span> <span id="statusProgressoGeralIA">0 de 0 imagens</span></p>' +
                            '<p><span class="text-slate-400">Pendentes:</span> <span id="statusImagensPendentesIA">0 imagens</span></p>' +
                        '</div>' +
                        '<div class="w-full bg-slate-950 rounded-full h-3 mt-5 overflow-hidden">' +
                            '<div id="statusBarraGeralIA" class="bg-purple-500 h-3 rounded-full transition-all duration-500" style="width: 0%"></div>' +
                        '</div>' +
                        '<p id="statusHotelAtualIA" class="text-xs text-slate-400 mt-3"></p>' +
                        '<p class="text-xs text-slate-500 mt-4">O tempo restante é uma estimativa baseada nas últimas imagens e pode variar.</p>' +
                    '</div>';
                loader.classList.remove('hidden', 'animate-pulse');
            }

            async function consultarStatusOrganizacao() {
                const response = await fetch('/api/status-organizacao');
                if (!response.ok) throw new Error('Não foi possível consultar o progresso.');
                const status = await response.json();

                document.getElementById('statusTempoDecorridoIA').textContent =
                    formatarDuracao(status.tempoDecorridoSegundos);
                document.getElementById('statusTempoMedioIA').textContent =
                    status.tempoMedioPorImagemSegundos == null
                        ? 'Calculando estimativa...'
                        : formatarDuracao(status.tempoMedioPorImagemSegundos);
                document.getElementById('statusTempoRestanteIA').textContent =
                    status.tempoEstimadoRestanteSegundos == null
                        ? 'Calculando estimativa...'
                        : formatarDuracao(status.tempoEstimadoRestanteSegundos);

                let previsao = 'Calculando estimativa...';
                if (status.estado === 'concluido' && status.fimProcessamento) {
                    previsao = 'Concluído às ' + new Date(status.fimProcessamento)
                        .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                } else if (status.previsaoTermino) {
                    previsao = new Date(status.previsaoTermino)
                        .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                }
                document.getElementById('statusPrevisaoTerminoIA').textContent = previsao;
                document.getElementById('statusProgressoGeralIA').textContent =
                    status.imagensProcessadasGeral + ' de ' +
                    status.totalImagensGeral + ' imagens';
                document.getElementById('statusImagensPendentesIA').textContent =
                    status.imagensPendentesGeral + ' imagens';
                document.getElementById('statusMensagemIA').textContent =
                    status.mensagem || 'Processando...';

                const progressoGeral = status.totalImagensGeral > 0
                    ? (status.imagensProcessadasGeral / status.totalImagensGeral) * 100
                    : 0;
                document.getElementById('statusBarraGeralIA').style.width =
                    Math.min(Math.max(progressoGeral, 0), 100) + '%';
                document.getElementById('statusHotelAtualIA').textContent =
                    status.hotel
                        ? 'Hotel atual: ' + status.hotel +
                          (status.imagem ? ' — ' + status.imagem : '')
                        : '';

                if (status.estado === 'concluido' || status.estado === 'erro') {
                    clearInterval(intervaloStatusOrganizacao);
                    intervaloStatusOrganizacao = null;
                    document.getElementById('statusSpinnerIA').classList.remove('animate-spin');
                    document.getElementById('statusRotuloTempoIA').textContent =
                        status.estado === 'concluido' ? 'Tempo total:' : 'Tempo decorrido:';

                    const btn = document.getElementById('btnOrganizarTudo');
                    btn.disabled = false;
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');

                    if (status.estado === 'erro') {
                        document.getElementById('statusMensagemIA').className =
                            'text-sm text-red-400';
                    }
                }
            }

            async function organizarLoteIA() {
                const confirmacao = confirm("Isto irá ativar a IA para TODOS os hotéis salvos na sua pasta. O processo pode levar vários minutos (ou horas, dependendo do volume). Deseja continuar?");
                if (!confirmacao) return;

                const btn = document.getElementById('btnOrganizarTudo');
                const resultadoContainer = document.getElementById('resultadoContainer');

                resultadoContainer.classList.add('hidden');
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                prepararPainelOrganizacao();

                try {
                    const response = await fetch('/api/organizar-tudo', { method: 'POST' });
                    const dados = await response.json();
                    if (!response.ok) throw new Error(dados.erro || 'Falha ao organizar em lote');

                    await consultarStatusOrganizacao();
                    intervaloStatusOrganizacao = setInterval(() => {
                        consultarStatusOrganizacao().catch((erro) => {
                            console.error(erro);
                        });
                    }, 1000);
                } catch (err) {
                    document.getElementById('statusMensagemIA').textContent =
                        'Erro: ' + err.message;
                    document.getElementById('statusMensagemIA').className =
                        'text-sm text-red-400';
                    btn.disabled = false;
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }
