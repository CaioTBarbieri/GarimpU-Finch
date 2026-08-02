(() => {
    'use strict';

    const TEMAS_COM_EFEITO = Object.freeze([
        'singularidade', 'artico', 'galaxia', 'aurora', 'vulcanico', 'sakura', 'tempestade', 'dimensao',
        'pulsar', 'supernova', 'oceano', 'noir', 'titanio', 'cyberpunk', 'tempo', 'virus', 'multiverso',
    ]);

    let canvas = null;
    let contexto = null;
    let frameId = null;
    let temaAtivo = null;
    let estado = null;
    let ultimoTempoDesenhado = 0;

    const ORCAMENTO_TEMAS_ESPECIAIS = Object.freeze({
        cyberpunk: { fps: 18, pixelsMaximos: 900000 },
        tempo: { fps: 18, pixelsMaximos: 900000 },
        virus: { fps: 18, pixelsMaximos: 900000 },
        multiverso: { fps: 15, pixelsMaximos: 850000 },
    });

    function medirViewport() {
        return {
            largura: window.innerWidth,
            altura: window.innerHeight,
        };
    }

    function obterFpsTemaEspecial(tema) {
        const padrao = ORCAMENTO_TEMAS_ESPECIAIS[tema]?.fps || 15;
        const configurado = Number(document.documentElement.dataset.specialThemeFps);
        if (!Number.isFinite(configurado)) return padrao;
        return Math.min(30, Math.max(5, Math.round(configurado)));
    }

    function ajustarTamanhoCanvas() {
        if (!canvas || !contexto) return;
        const { largura, altura } = medirViewport();
        // Os fundos especiais são decorativos e ficam atrás de painéis opacos.
        // Um buffer limitado evita milhões de pixels extras em telas Full HD/4K.
        const orcamentoEspecial = ORCAMENTO_TEMAS_ESPECIAIS[temaAtivo];
        const escalaEspecial = orcamentoEspecial
            ? Math.min(1, Math.sqrt(orcamentoEspecial.pixelsMaximos / Math.max(1, largura * altura)))
            : 1;
        const escala = orcamentoEspecial
            ? escalaEspecial
            : Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(largura * escala));
        canvas.height = Math.max(1, Math.round(altura * escala));
        contexto.setTransform(escala, 0, 0, escala, 0, 0);
    }

    // --- Tema "Buraco Negro" (singularidade): disco de acreção orbitando um horizonte de eventos ---
    function criarEstadoBuracoNegro() {
        const { largura, altura } = medirViewport();
        const centroX = largura * 0.78;
        const centroY = altura * 0.22;
        const raioHorizonte = Math.min(largura, altura) * 0.08;
        const raioMaximo = Math.min(largura, altura) * 0.36;

        const particulas = [];
        for (let i = 0; i < 260; i += 1) {
            const raio = raioHorizonte + Math.random() * (raioMaximo - raioHorizonte);
            particulas.push({
                angulo: Math.random() * Math.PI * 2,
                raioBase: raio,
                velocidade: 0.0006 + (raioMaximo - raio) / raioMaximo * 0.014,
                achatamento: 0.26 + Math.random() * 0.08,
                espessura: 0.8 + Math.random() * 1.8,
                fase: Math.random() * Math.PI * 2,
            });
        }

        const estrelas = Array.from({ length: 110 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            raio: 0.4 + Math.random() * 1.1,
            fase: Math.random() * Math.PI * 2,
            velocidadeCintilo: 0.001 + Math.random() * 0.0018,
        }));

        const jatos = Array.from({ length: 40 }, () => ({
            lado: Math.random() < 0.5 ? -1 : 1,
            distancia: Math.random() * raioMaximo * 0.9,
            velocidade: 0.9 + Math.random() * 1.4,
            desvio: (Math.random() - 0.5) * raioHorizonte * 0.6,
            espessura: 0.6 + Math.random() * 1.2,
        }));

        return { centroX, centroY, raioHorizonte, raioMaximo, particulas, estrelas, jatos };
    }

    function corParticulaBuracoNegro(raio, raioHorizonte, raioMaximo, brilhoDoppler) {
        const proximidade = 1 - Math.min(1, Math.max(0, (raio - raioHorizonte) / (raioMaximo - raioHorizonte)));
        const intensidade = proximidade * brilhoDoppler;
        const g = Math.round(140 + intensidade * 100);
        const b = Math.round(50 + (1 - proximidade) * 120 + brilhoDoppler * 30);
        return `rgba(255, ${Math.min(255, g)}, ${Math.min(255, b)}, ${(0.16 + intensidade * 0.55).toFixed(3)})`;
    }

    function desenharBuracoNegro(tempo) {
        const { centroX, centroY, raioHorizonte, raioMaximo, particulas, estrelas, jatos } = estado;

        contexto.save();
        for (const estrela of estrelas) {
            contexto.globalAlpha = 0.25 + Math.abs(Math.sin(tempo * estrela.velocidadeCintilo + estrela.fase)) * 0.45;
            contexto.fillStyle = '#f4ecdd';
            contexto.beginPath();
            contexto.arc(estrela.x, estrela.y, estrela.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        // Disco de acreção com "beaming" relativístico: o lado que gira em nossa
        // direção (seno positivo do ângulo) parece bem mais brilhante que o oposto,
        // como nas simulações reais de buracos negros.
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const p of particulas) {
            p.angulo += p.velocidade;
            const oscilacao = Math.sin(tempo * 0.0005 + p.fase) * p.raioBase * 0.02;
            const raio = p.raioBase + oscilacao;
            const x = centroX + Math.cos(p.angulo) * raio;
            const y = centroY + Math.sin(p.angulo) * raio * p.achatamento;
            const brilhoDoppler = 0.45 + 0.55 * ((Math.sin(p.angulo) + 1) / 2);

            contexto.beginPath();
            contexto.fillStyle = corParticulaBuracoNegro(raio, raioHorizonte, raioMaximo, brilhoDoppler);
            contexto.arc(x, y, p.espessura * (0.7 + brilhoDoppler * 0.5), 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        // Jatos bipolares finos saindo dos polos, perpendiculares ao disco.
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const jato of jatos) {
            jato.distancia += jato.velocidade;
            if (jato.distancia > raioMaximo * 0.9) jato.distancia = 0;
            const alfa = Math.max(0, 1 - jato.distancia / (raioMaximo * 0.9)) * 0.4;
            const y = centroY - jato.lado * (raioHorizonte * 1.1 + jato.distancia);
            contexto.fillStyle = `rgba(190, 220, 255, ${alfa.toFixed(3)})`;
            contexto.beginPath();
            contexto.arc(centroX + jato.desvio, y, jato.espessura, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        // Anel de fóton: um arco de luz curvado pela gravidade, visível "atrás" e
        // acima da sombra do horizonte de eventos — a marca registrada de Interstellar.
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        contexto.strokeStyle = 'rgba(255, 235, 200, 0.75)';
        contexto.lineWidth = 1.6;
        contexto.shadowColor = 'rgba(255, 220, 170, 0.8)';
        contexto.shadowBlur = 10;
        contexto.beginPath();
        contexto.ellipse(
            centroX, centroY - raioHorizonte * 0.05,
            raioHorizonte * 1.16, raioHorizonte * 0.34,
            0, Math.PI * 1.04, Math.PI * 1.96,
        );
        contexto.stroke();
        contexto.restore();

        contexto.save();
        contexto.fillStyle = 'rgba(0, 0, 0, 0.92)';
        contexto.beginPath();
        contexto.arc(centroX, centroY, raioHorizonte, 0, Math.PI * 2);
        contexto.fill();

        const halo = contexto.createRadialGradient(
            centroX, centroY, raioHorizonte * 0.85,
            centroX, centroY, raioHorizonte * 1.5,
        );
        halo.addColorStop(0, 'rgba(255, 190, 120, 0.35)');
        halo.addColorStop(1, 'rgba(255, 190, 120, 0)');
        contexto.fillStyle = halo;
        contexto.beginPath();
        contexto.arc(centroX, centroY, raioHorizonte * 1.5, 0, Math.PI * 2);
        contexto.fill();
        contexto.restore();
    }

    // --- Tema "Nexo Ártico": auroras e flocos de gelo à deriva ---
    function criarEstadoArtico() {
        const { largura, altura } = medirViewport();
        const flocos = [];
        for (let i = 0; i < 90; i += 1) {
            flocos.push({
                x: Math.random() * largura,
                y: Math.random() * altura,
                raio: 0.6 + Math.random() * 1.8,
                velocidadeY: 0.08 + Math.random() * 0.18,
                deriva: Math.random() * Math.PI * 2,
                velocidadeDeriva: 0.15 + Math.random() * 0.25,
            });
        }
        const faixas = [];
        for (let i = 0; i < 3; i += 1) {
            faixas.push({
                offset: Math.random() * Math.PI * 2,
                altura: altura * (0.12 + i * 0.08),
                amplitude: 40 + i * 18,
                velocidade: 0.00018 + i * 0.00006,
                matiz: 175 + i * 25,
            });
        }
        return { flocos, faixas };
    }

    function desenharArtico(tempo) {
        const { largura, altura } = medirViewport();
        const { flocos, faixas } = estado;

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const faixa of faixas) {
            const gradiente = contexto.createLinearGradient(0, faixa.altura - 60, 0, faixa.altura + 120);
            gradiente.addColorStop(0, `hsla(${faixa.matiz}, 85%, 60%, 0)`);
            gradiente.addColorStop(0.5, `hsla(${faixa.matiz}, 85%, 60%, 0.10)`);
            gradiente.addColorStop(1, `hsla(${faixa.matiz}, 85%, 60%, 0)`);
            contexto.fillStyle = gradiente;

            contexto.beginPath();
            contexto.moveTo(0, faixa.altura);
            const passo = 40;
            for (let x = 0; x <= largura + passo; x += passo) {
                const y = faixa.altura + Math.sin(x * 0.006 + tempo * faixa.velocidade + faixa.offset) * faixa.amplitude;
                contexto.lineTo(x, y);
            }
            contexto.lineTo(largura, faixa.altura + 160);
            contexto.lineTo(0, faixa.altura + 160);
            contexto.closePath();
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        contexto.fillStyle = 'rgba(214, 240, 255, 0.75)';
        for (const floco of flocos) {
            floco.deriva += 0.003 * floco.velocidadeDeriva;
            floco.y += floco.velocidadeY;
            floco.x += Math.sin(floco.deriva) * 0.25;
            if (floco.y > altura + 4) {
                floco.y = -4;
                floco.x = Math.random() * largura;
            }
            contexto.globalAlpha = 0.4 + Math.sin(floco.deriva) * 0.2;
            contexto.beginPath();
            contexto.arc(floco.x, floco.y, floco.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();
    }

    // --- Tema "Galáxia Nexo": campo de estrelas com núcleo espiral ---
    function criarEstadoGalaxia() {
        const { largura, altura } = medirViewport();
        const centroX = largura * 0.78;
        const centroY = altura * 0.22;

        const estrelas = [];
        for (let i = 0; i < 160; i += 1) {
            estrelas.push({
                x: Math.random() * largura,
                y: Math.random() * altura,
                raio: 0.4 + Math.random() * 1.3,
                fase: Math.random() * Math.PI * 2,
                velocidadeCintilo: 0.001 + Math.random() * 0.002,
            });
        }

        const bracos = [];
        for (let i = 0; i < 140; i += 1) {
            const angulo = Math.random() * Math.PI * 2;
            const raio = Math.pow(Math.random(), 0.6) * Math.min(largura, altura) * 0.28;
            bracos.push({
                angulo,
                raio,
                velocidade: 0.00025 + (1 - raio / (Math.min(largura, altura) * 0.28)) * 0.0009,
                espessura: 0.6 + Math.random() * 1.6,
                matiz: 260 + Math.random() * 60,
            });
        }

        return { centroX, centroY, estrelas, bracos };
    }

    function desenharGalaxia(tempo) {
        const { centroX, centroY, estrelas, bracos } = estado;

        contexto.save();
        for (const estrela of estrelas) {
            const cintilo = 0.35 + Math.abs(Math.sin(tempo * estrela.velocidadeCintilo + estrela.fase)) * 0.5;
            contexto.globalAlpha = cintilo;
            contexto.fillStyle = '#e6e6ff';
            contexto.beginPath();
            contexto.arc(estrela.x, estrela.y, estrela.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        const nucleo = contexto.createRadialGradient(centroX, centroY, 0, centroX, centroY, 90);
        nucleo.addColorStop(0, 'rgba(200, 170, 255, 0.35)');
        nucleo.addColorStop(1, 'rgba(200, 170, 255, 0)');
        contexto.fillStyle = nucleo;
        contexto.beginPath();
        contexto.arc(centroX, centroY, 90, 0, Math.PI * 2);
        contexto.fill();

        for (const ponto of bracos) {
            ponto.angulo += ponto.velocidade;
            const raioEspiral = ponto.raio + Math.sin(ponto.angulo * 3) * 6;
            const x = centroX + Math.cos(ponto.angulo) * raioEspiral;
            const y = centroY + Math.sin(ponto.angulo) * raioEspiral * 0.55;

            contexto.beginPath();
            contexto.fillStyle = `hsla(${ponto.matiz}, 85%, 78%, 0.5)`;
            contexto.arc(x, y, ponto.espessura, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();
    }

    // --- Tema "Aurora Polar": mesma construção do "Nexo Ártico" (faixas onduladas +
    // neve), mas com paleta de aurora real e cristais de gelo cintilantes no lugar
    // do azul-ciano único do Ártico. ---
    function criarEstadoBoreal() {
        const { largura, altura } = medirViewport();

        const flocos = [];
        for (let i = 0; i < 90; i += 1) {
            flocos.push({
                x: Math.random() * largura,
                y: Math.random() * altura,
                raio: 0.6 + Math.random() * 1.8,
                velocidadeY: 0.08 + Math.random() * 0.18,
                deriva: Math.random() * Math.PI * 2,
                velocidadeDeriva: 0.15 + Math.random() * 0.25,
            });
        }

        // Tons de aurora real: verde dominante (oxigênio em baixa altitude) evoluindo
        // para turquesa e um azul profundo — nada de ciano único como no Ártico.
        const matizesAurora = [128, 150, 172, 208];
        const faixas = [];
        for (let i = 0; i < 4; i += 1) {
            faixas.push({
                offset: Math.random() * Math.PI * 2,
                altura: altura * (0.08 + i * 0.09),
                amplitude: 46 + i * 20,
                velocidade: 0.00016 + i * 0.00005,
                matiz: matizesAurora[i % matizesAurora.length],
            });
        }

        const cristais = [];
        for (let i = 0; i < 34; i += 1) {
            cristais.push({
                x: Math.random() * largura,
                y: Math.random() * altura,
                tamanho: 3 + Math.random() * 5,
                velocidadeY: 0.05 + Math.random() * 0.1,
                deriva: Math.random() * Math.PI * 2,
                velocidadeDeriva: 0.1 + Math.random() * 0.2,
                fase: Math.random() * Math.PI * 2,
                velocidadeCintilo: 0.0015 + Math.random() * 0.002,
                rotacao: Math.random() * Math.PI,
                velocidadeRotacao: (Math.random() - 0.5) * 0.0006,
            });
        }

        return { flocos, faixas, cristais };
    }

    function desenharCristalGelo(cristal, alfa) {
        const tamanho = cristal.tamanho;
        contexto.save();
        contexto.translate(cristal.x, cristal.y);
        contexto.rotate(cristal.rotacao);
        contexto.globalAlpha = alfa;
        contexto.strokeStyle = '#eaf9ff';
        contexto.lineWidth = 0.6;

        // Sextavado simples: três eixos cruzados imitando a simetria de um floco de gelo.
        for (let eixo = 0; eixo < 3; eixo += 1) {
            const angulo = (Math.PI / 3) * eixo;
            const dx = Math.cos(angulo) * tamanho;
            const dy = Math.sin(angulo) * tamanho;
            contexto.beginPath();
            contexto.moveTo(-dx, -dy);
            contexto.lineTo(dx, dy);
            contexto.stroke();
        }

        contexto.fillStyle = '#ffffff';
        contexto.beginPath();
        contexto.arc(0, 0, tamanho * 0.16, 0, Math.PI * 2);
        contexto.fill();
        contexto.restore();
    }

    function desenharBoreal(tempo) {
        const { largura, altura } = medirViewport();
        const { flocos, faixas, cristais } = estado;

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const faixa of faixas) {
            const gradiente = contexto.createLinearGradient(0, faixa.altura - 70, 0, faixa.altura + 150);
            gradiente.addColorStop(0, `hsla(${faixa.matiz}, 85%, 58%, 0)`);
            gradiente.addColorStop(0.5, `hsla(${faixa.matiz}, 85%, 58%, 0.13)`);
            gradiente.addColorStop(1, `hsla(${faixa.matiz}, 85%, 58%, 0)`);
            contexto.fillStyle = gradiente;

            contexto.beginPath();
            contexto.moveTo(0, faixa.altura);
            const passo = 40;
            for (let x = 0; x <= largura + passo; x += passo) {
                const y = faixa.altura + Math.sin(x * 0.006 + tempo * faixa.velocidade + faixa.offset) * faixa.amplitude;
                contexto.lineTo(x, y);
            }
            contexto.lineTo(largura, faixa.altura + 190);
            contexto.lineTo(0, faixa.altura + 190);
            contexto.closePath();
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        contexto.fillStyle = 'rgba(214, 240, 255, 0.75)';
        for (const floco of flocos) {
            floco.deriva += 0.003 * floco.velocidadeDeriva;
            floco.y += floco.velocidadeY;
            floco.x += Math.sin(floco.deriva) * 0.25;
            if (floco.y > altura + 4) {
                floco.y = -4;
                floco.x = Math.random() * largura;
            }
            contexto.globalAlpha = 0.4 + Math.sin(floco.deriva) * 0.2;
            contexto.beginPath();
            contexto.arc(floco.x, floco.y, floco.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const cristal of cristais) {
            cristal.deriva += 0.003 * cristal.velocidadeDeriva;
            cristal.y += cristal.velocidadeY;
            cristal.x += Math.sin(cristal.deriva) * 0.18;
            cristal.rotacao += cristal.velocidadeRotacao;
            if (cristal.y > altura + 6) {
                cristal.y = -6;
                cristal.x = Math.random() * largura;
            }
            const cintilo = 0.25 + Math.abs(Math.sin(tempo * cristal.velocidadeCintilo + cristal.fase)) * 0.65;
            desenharCristalGelo(cristal, cintilo);
        }
        contexto.restore();
    }

    // --- Tema "Vulcânico Nexo": brilho de lava no horizonte com brasas subindo ---
    function criarEstadoVulcanico() {
        const { largura, altura } = medirViewport();

        const faixas = [];
        const matizesLava = [10, 24, 38];
        for (let i = 0; i < 3; i += 1) {
            faixas.push({
                offset: Math.random() * Math.PI * 2,
                altura: altura * (0.82 + i * 0.05),
                amplitude: 26 + i * 12,
                velocidade: 0.00022 + i * 0.00009,
                matiz: matizesLava[i],
            });
        }

        const brasas = [];
        for (let i = 0; i < 70; i += 1) {
            brasas.push({
                x: Math.random() * largura,
                y: altura + Math.random() * altura * 0.3,
                raio: 0.7 + Math.random() * 1.6,
                velocidadeY: -(0.18 + Math.random() * 0.4),
                deriva: Math.random() * Math.PI * 2,
                velocidadeDeriva: 0.15 + Math.random() * 0.3,
                fase: Math.random() * Math.PI * 2,
                velocidadeCintilo: 0.0018 + Math.random() * 0.0026,
            });
        }

        return { faixas, brasas };
    }

    function desenharVulcanico(tempo) {
        const { largura, altura } = medirViewport();
        const { faixas, brasas } = estado;

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const faixa of faixas) {
            const gradiente = contexto.createLinearGradient(0, faixa.altura - 90, 0, altura);
            gradiente.addColorStop(0, `hsla(${faixa.matiz}, 92%, 52%, 0)`);
            gradiente.addColorStop(0.45, `hsla(${faixa.matiz}, 92%, 52%, 0.2)`);
            gradiente.addColorStop(1, `hsla(${faixa.matiz}, 92%, 46%, 0.08)`);
            contexto.fillStyle = gradiente;

            contexto.beginPath();
            contexto.moveTo(0, altura);
            contexto.lineTo(0, faixa.altura);
            const passo = 40;
            for (let x = 0; x <= largura + passo; x += passo) {
                const y = faixa.altura + Math.sin(x * 0.007 + tempo * faixa.velocidade + faixa.offset) * faixa.amplitude;
                contexto.lineTo(x, y);
            }
            contexto.lineTo(largura, altura);
            contexto.closePath();
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const brasa of brasas) {
            brasa.deriva += 0.004 * brasa.velocidadeDeriva;
            brasa.y += brasa.velocidadeY;
            brasa.x += Math.sin(brasa.deriva) * 0.35;
            if (brasa.y < -6) {
                brasa.y = altura + 6;
                brasa.x = Math.random() * largura;
            }

            const cintilo = 0.4 + Math.abs(Math.sin(tempo * brasa.velocidadeCintilo + brasa.fase)) * 0.6;
            contexto.globalAlpha = cintilo;

            const halo = contexto.createRadialGradient(brasa.x, brasa.y, 0, brasa.x, brasa.y, brasa.raio * 3.2);
            halo.addColorStop(0, 'rgba(255, 214, 140, 0.85)');
            halo.addColorStop(1, 'rgba(255, 90, 40, 0)');
            contexto.fillStyle = halo;
            contexto.beginPath();
            contexto.arc(brasa.x, brasa.y, brasa.raio * 3.2, 0, Math.PI * 2);
            contexto.fill();

            contexto.fillStyle = '#fff3d6';
            contexto.beginPath();
            contexto.arc(brasa.x, brasa.y, brasa.raio * 0.6, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();
    }

    // --- Tema "Sakura Noturna": pétalas à deriva sob um leve brilho difuso ---
    function criarEstadoSakura() {
        const { largura, altura } = medirViewport();

        const petalas = [];
        for (let i = 0; i < 70; i += 1) {
            petalas.push({
                x: Math.random() * largura,
                y: Math.random() * altura,
                tamanho: 4 + Math.random() * 5,
                velocidadeY: 0.28 + Math.random() * 0.45,
                deriva: Math.random() * Math.PI * 2,
                velocidadeDeriva: 0.15 + Math.random() * 0.3,
                rotacao: Math.random() * Math.PI * 2,
                velocidadeRotacao: (Math.random() - 0.5) * 0.02,
                matiz: 330 + Math.random() * 25,
                alfaBase: 0.5 + Math.random() * 0.35,
            });
        }

        const brilhos = [];
        for (let i = 0; i < 36; i += 1) {
            brilhos.push({
                x: Math.random() * largura,
                y: Math.random() * altura,
                raio: 0.8 + Math.random() * 1.6,
                fase: Math.random() * Math.PI * 2,
                velocidadeCintilo: 0.0008 + Math.random() * 0.0016,
            });
        }

        return { petalas, brilhos };
    }

    function desenharPetalaSakura(petala, alfa) {
        contexto.save();
        contexto.translate(petala.x, petala.y);
        contexto.rotate(petala.rotacao);
        contexto.globalAlpha = alfa;
        contexto.fillStyle = `hsla(${petala.matiz}, 78%, 74%, 0.92)`;
        contexto.beginPath();
        contexto.moveTo(0, -petala.tamanho);
        contexto.quadraticCurveTo(petala.tamanho * 0.85, 0, 0, petala.tamanho);
        contexto.quadraticCurveTo(-petala.tamanho * 0.85, 0, 0, -petala.tamanho);
        contexto.fill();
        contexto.restore();
    }

    function desenharSakura(tempo) {
        const { largura, altura } = medirViewport();
        const { petalas, brilhos } = estado;

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const brilho of brilhos) {
            const alfa = 0.15 + Math.abs(Math.sin(tempo * brilho.velocidadeCintilo + brilho.fase)) * 0.35;
            contexto.globalAlpha = alfa;
            contexto.fillStyle = '#ffd9e8';
            contexto.beginPath();
            contexto.arc(brilho.x, brilho.y, brilho.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        for (const petala of petalas) {
            petala.deriva += 0.003 * petala.velocidadeDeriva;
            petala.y += petala.velocidadeY;
            petala.x += Math.sin(petala.deriva) * 0.6;
            petala.rotacao += petala.velocidadeRotacao;
            if (petala.y > altura + 8) {
                petala.y = -8;
                petala.x = Math.random() * largura;
            }
            if (petala.x > largura + 8) petala.x = -8;
            if (petala.x < -8) petala.x = largura + 8;

            const alfa = petala.alfaBase * (0.7 + Math.sin(petala.deriva * 1.2) * 0.3);
            desenharPetalaSakura(petala, alfa);
        }
        contexto.restore();
    }

    // --- Tema "Tempestade Nexo": céu carregado, chuva torrencial e raios procedurais ---
    function gerarSegmentosRaio(x1, y1, x2, y2, deslocamento, segmentosOut, profundidade) {
        if (deslocamento < 7 || profundidade > 6) {
            segmentosOut.push([x1, y1, x2, y2]);
            return;
        }
        const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * deslocamento;
        const my = (y1 + y2) / 2 + (Math.random() - 0.5) * deslocamento * 0.3;
        gerarSegmentosRaio(x1, y1, mx, my, deslocamento / 2, segmentosOut, profundidade + 1);
        gerarSegmentosRaio(mx, my, x2, y2, deslocamento / 2, segmentosOut, profundidade + 1);
        if (Math.random() < 0.28 && profundidade < 4) {
            const bx = mx + (Math.random() - 0.5) * deslocamento * 1.6;
            const by = my + Math.random() * deslocamento * 1.6;
            gerarSegmentosRaio(mx, my, bx, by, deslocamento / 2.4, segmentosOut, profundidade + 2);
        }
    }

    function criarEstadoTempestade() {
        const { largura, altura } = medirViewport();

        const nuvens = Array.from({ length: 5 }, () => ({
            x: Math.random() * largura,
            y: altura * (0.03 + Math.random() * 0.28),
            raio: 130 + Math.random() * 170,
            velocidade: 0.12 + Math.random() * 0.22,
        }));

        const chuva = Array.from({ length: 150 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            comprimento: 12 + Math.random() * 18,
            velocidade: 8 + Math.random() * 7,
            vento: 2 + Math.random() * 1.5,
            alfa: 0.22 + Math.random() * 0.33,
        }));

        return {
            nuvens,
            chuva,
            relampago: { segmentos: [], vida: 0, flash: 0, proximo: 90 + Math.random() * 180 },
        };
    }

    function desenharTempestade() {
        const { largura, altura } = medirViewport();
        const { nuvens, chuva, relampago } = estado;

        contexto.save();
        for (const nuvem of nuvens) {
            nuvem.x += nuvem.velocidade;
            if (nuvem.x - nuvem.raio > largura) nuvem.x = -nuvem.raio;
            const gradiente = contexto.createRadialGradient(nuvem.x, nuvem.y, 0, nuvem.x, nuvem.y, nuvem.raio);
            gradiente.addColorStop(0, 'rgba(18, 24, 36, 0.55)');
            gradiente.addColorStop(1, 'rgba(18, 24, 36, 0)');
            contexto.fillStyle = gradiente;
            contexto.beginPath();
            contexto.arc(nuvem.x, nuvem.y, nuvem.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        relampago.proximo -= 1;
        if (relampago.proximo <= 0 && relampago.vida <= 0) {
            const xInicio = largura * (0.2 + Math.random() * 0.6);
            const xFim = xInicio + (Math.random() - 0.5) * largura * 0.22;
            const segmentos = [];
            gerarSegmentosRaio(xInicio, 0, xFim, altura * (0.42 + Math.random() * 0.28), 90, segmentos, 0);
            relampago.segmentos = segmentos;
            relampago.vida = 9;
            relampago.flash = 0.85;
            relampago.proximo = 260 + Math.random() * 480;
        }

        if (relampago.vida > 0) {
            const alfaRaio = Math.min(1, relampago.vida / 4);
            contexto.save();
            contexto.globalCompositeOperation = 'lighter';
            contexto.strokeStyle = `rgba(224, 234, 255, ${alfaRaio})`;
            contexto.lineWidth = 2.2;
            contexto.shadowColor = 'rgba(150, 190, 255, 0.9)';
            contexto.shadowBlur = 20;
            for (const [x1, y1, x2, y2] of relampago.segmentos) {
                contexto.beginPath();
                contexto.moveTo(x1, y1);
                contexto.lineTo(x2, y2);
                contexto.stroke();
            }
            contexto.restore();

            if (relampago.flash > 0) {
                contexto.save();
                contexto.fillStyle = `rgba(180, 200, 255, ${relampago.flash * 0.32})`;
                contexto.fillRect(0, 0, largura, altura);
                contexto.restore();
                relampago.flash -= 0.28;
            }
            relampago.vida -= 1;
        }

        contexto.save();
        contexto.lineWidth = 1;
        for (const gota of chuva) {
            gota.y += gota.velocidade;
            gota.x -= gota.vento;
            if (gota.y > altura) {
                gota.y = -gota.comprimento;
                gota.x = Math.random() * largura + largura * 0.1;
            }
            contexto.globalAlpha = gota.alfa;
            contexto.strokeStyle = 'rgba(200, 220, 255, 1)';
            contexto.beginPath();
            contexto.moveTo(gota.x, gota.y);
            contexto.lineTo(gota.x - gota.vento * 2, gota.y + gota.comprimento);
            contexto.stroke();
        }
        contexto.restore();
    }

    // --- Tema "Dimensão Nexo": fenda entre realidades sugando fragmentos e luz ---
    function criarEstadoDimensao() {
        const { largura, altura } = medirViewport();
        const centroX = largura * 0.5;
        const centroY = altura * 0.46;
        const raioBase = Math.min(largura, altura) * 0.15;

        const bordaFenda = Array.from({ length: 26 }, (_valor, indice) => ({
            angulo: (indice / 26) * Math.PI * 2,
            jitter: 0.72 + Math.random() * 0.56,
            fase: Math.random() * Math.PI * 2,
            velocidade: 0.0012 + Math.random() * 0.0018,
        }));

        const particulas = Array.from({ length: 150 }, () => {
            const raioMax = raioBase * 1.4 + Math.random() * Math.min(largura, altura) * 0.4;
            return {
                angulo: Math.random() * Math.PI * 2,
                raio: Math.random() * raioMax,
                raioMax,
                velocidadeAngular: 0.006 + Math.random() * 0.014,
                velocidadeRaio: 0.35 + Math.random() * 1.1,
                tamanho: 0.6 + Math.random() * 1.8,
                corMix: Math.random(),
            };
        });

        const fragmentos = Array.from({ length: 9 }, () => ({
            angulo: Math.random() * Math.PI * 2,
            raio: raioBase * (1.8 + Math.random() * 1.8),
            velocidadeAngular: (Math.random() - 0.5) * 0.0018,
            tamanho: 10 + Math.random() * 22,
            rotacao: Math.random() * Math.PI * 2,
            velocidadeRotacao: (Math.random() - 0.5) * 0.012,
            lados: 3 + Math.floor(Math.random() * 3),
            corMix: Math.random(),
        }));

        return {
            centroX,
            centroY,
            raioBase,
            bordaFenda,
            particulas,
            fragmentos,
            pulso: Math.random() * Math.PI * 2,
            glitch: { restante: 0, y: 0, altura: 0 },
            proximoGlitch: 140 + Math.random() * 260,
        };
    }

    function corDimensao(mix, alfa) {
        const magenta = [193, 75, 255];
        const ciano = [53, 229, 255];
        const r = Math.round(magenta[0] + (ciano[0] - magenta[0]) * mix);
        const g = Math.round(magenta[1] + (ciano[1] - magenta[1]) * mix);
        const b = Math.round(magenta[2] + (ciano[2] - magenta[2]) * mix);
        return `rgba(${r}, ${g}, ${b}, ${alfa})`;
    }

    function desenharPoligono(cx, cy, raio, lados, rotacao) {
        contexto.beginPath();
        for (let i = 0; i <= lados; i += 1) {
            const angulo = rotacao + (i / lados) * Math.PI * 2;
            const x = cx + Math.cos(angulo) * raio;
            const y = cy + Math.sin(angulo) * raio;
            if (i === 0) contexto.moveTo(x, y);
            else contexto.lineTo(x, y);
        }
        contexto.closePath();
    }

    function desenharDimensao(tempo) {
        const { centroX, centroY, raioBase, bordaFenda, particulas, fragmentos } = estado;
        const { largura, altura } = medirViewport();
        const pulso = 0.7 + Math.sin(tempo * 0.0012 + estado.pulso) * 0.25;

        // Partículas espiralando para dentro da fenda.
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const particula of particulas) {
            particula.angulo += particula.velocidadeAngular;
            particula.raio -= particula.velocidadeRaio;
            if (particula.raio < raioBase * 0.5) {
                particula.raio = particula.raioMax;
                particula.angulo = Math.random() * Math.PI * 2;
            }
            const x = centroX + Math.cos(particula.angulo) * particula.raio;
            const y = centroY + Math.sin(particula.angulo) * particula.raio * 0.85;
            const proximidade = 1 - Math.min(1, particula.raio / particula.raioMax);
            contexto.fillStyle = corDimensao(particula.corMix, 0.25 + proximidade * 0.55);
            contexto.beginPath();
            contexto.arc(x, y, particula.tamanho, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        // Fragmentos geométricos orbitando a fenda, como destroços de outra dimensão.
        contexto.save();
        for (const fragmento of fragmentos) {
            fragmento.angulo += fragmento.velocidadeAngular;
            fragmento.rotacao += fragmento.velocidadeRotacao;
            const x = centroX + Math.cos(fragmento.angulo) * fragmento.raio;
            const y = centroY + Math.sin(fragmento.angulo) * fragmento.raio * 0.85;
            contexto.strokeStyle = corDimensao(fragmento.corMix, 0.55 * pulso);
            contexto.fillStyle = corDimensao(fragmento.corMix, 0.08);
            contexto.lineWidth = 1.1;
            desenharPoligono(x, y, fragmento.tamanho, fragmento.lados, fragmento.rotacao);
            contexto.fill();
            contexto.stroke();
        }
        contexto.restore();

        // A fenda: borda irregular brilhante em torno de um vazio absoluto.
        contexto.save();
        contexto.beginPath();
        bordaFenda.forEach((ponto, indice) => {
            const raio = raioBase * ponto.jitter * (1 + 0.07 * Math.sin(tempo * ponto.velocidade + ponto.fase));
            const x = centroX + Math.cos(ponto.angulo) * raio;
            const y = centroY + Math.sin(ponto.angulo) * raio * 0.85;
            if (indice === 0) contexto.moveTo(x, y);
            else contexto.lineTo(x, y);
        });
        contexto.closePath();
        contexto.fillStyle = 'rgba(2, 0, 6, 0.94)';
        contexto.fill();

        contexto.globalCompositeOperation = 'lighter';
        contexto.shadowColor = 'rgba(193, 75, 255, 0.8)';
        contexto.shadowBlur = 24 * pulso;
        contexto.lineWidth = 2.2;
        contexto.strokeStyle = corDimensao(0.5 + Math.sin(tempo * 0.0009) * 0.5, 0.85 * pulso);
        contexto.stroke();
        contexto.restore();

        // Halo de energia vazando pela fenda.
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        const halo = contexto.createRadialGradient(centroX, centroY, raioBase * 0.7, centroX, centroY, raioBase * 2.4);
        halo.addColorStop(0, corDimensao(0.2, 0.28 * pulso));
        halo.addColorStop(0.6, corDimensao(0.8, 0.12 * pulso));
        halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        contexto.fillStyle = halo;
        contexto.beginPath();
        contexto.ellipse(centroX, centroY, raioBase * 2.4, raioBase * 2.1, 0, 0, Math.PI * 2);
        contexto.fill();
        contexto.restore();

        // Glitch ocasional: uma fatia horizontal da tela "desalinha" com aberração cromática.
        estado.proximoGlitch -= 1;
        if (estado.proximoGlitch <= 0 && estado.glitch.restante <= 0) {
            estado.glitch = {
                restante: 4 + Math.floor(Math.random() * 5),
                y: Math.random() * altura,
                altura: 16 + Math.random() * 50,
            };
            estado.proximoGlitch = 220 + Math.random() * 420;
        }
        if (estado.glitch.restante > 0) {
            const { y, altura: altoFaixa } = estado.glitch;
            contexto.save();
            contexto.globalCompositeOperation = 'lighter';
            contexto.globalAlpha = 0.22;
            contexto.fillStyle = 'rgba(193, 75, 255, 1)';
            contexto.fillRect(-6, y, largura, altoFaixa);
            contexto.fillStyle = 'rgba(53, 229, 255, 1)';
            contexto.fillRect(6, y, largura, altoFaixa);
            contexto.restore();
            estado.glitch.restante -= 1;
        }
    }

    // --- Tema "Pulsar Nexo": estrela de nêutrons girando, varrendo o céu com feixes ---
    function criarEstadoPulsar() {
        const { largura, altura } = medirViewport();
        const centroX = largura * 0.5;
        const centroY = altura * 0.44;

        const estrelas = Array.from({ length: 130 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            raio: 0.4 + Math.random() * 1.2,
            fase: Math.random() * Math.PI * 2,
            velocidadeCintilo: 0.001 + Math.random() * 0.002,
        }));

        return {
            centroX,
            centroY,
            estrelas,
            anguloBase: Math.random() * Math.PI * 2,
            pulsos: [],
            proximoPulso: 40,
        };
    }

    function desenharFeixePulsar(centroX, centroY, angulo, abertura, alcance, cor) {
        const gradiente = contexto.createRadialGradient(centroX, centroY, 0, centroX, centroY, alcance);
        gradiente.addColorStop(0, cor.replace('ALPHA', '0.5'));
        gradiente.addColorStop(0.4, cor.replace('ALPHA', '0.16'));
        gradiente.addColorStop(1, cor.replace('ALPHA', '0'));
        contexto.fillStyle = gradiente;
        contexto.beginPath();
        contexto.moveTo(centroX, centroY);
        contexto.arc(centroX, centroY, alcance, angulo - abertura / 2, angulo + abertura / 2);
        contexto.closePath();
        contexto.fill();
    }

    function desenharPulsar(tempo) {
        const { largura, altura } = medirViewport();
        const { centroX, centroY, estrelas, anguloBase } = estado;
        const alcance = Math.min(largura, altura) * 0.62;

        contexto.save();
        for (const estrela of estrelas) {
            contexto.globalAlpha = 0.3 + Math.abs(Math.sin(tempo * estrela.velocidadeCintilo + estrela.fase)) * 0.5;
            contexto.fillStyle = '#eaf2ff';
            contexto.beginPath();
            contexto.arc(estrela.x, estrela.y, estrela.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        const angulo = anguloBase + tempo * 0.0016;
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        desenharFeixePulsar(centroX, centroY, angulo, 1.1, alcance, 'rgba(127, 212, 255, ALPHA)');
        desenharFeixePulsar(centroX, centroY, angulo + Math.PI, 1.1, alcance, 'rgba(127, 212, 255, ALPHA)');
        contexto.restore();

        estado.proximoPulso -= 1;
        if (estado.proximoPulso <= 0) {
            estado.pulsos.push({ raio: 10, alfa: 0.5 });
            estado.proximoPulso = 70 + Math.random() * 30;
        }
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (let i = estado.pulsos.length - 1; i >= 0; i -= 1) {
            const pulso = estado.pulsos[i];
            pulso.raio += 3;
            pulso.alfa -= 0.008;
            if (pulso.alfa <= 0) {
                estado.pulsos.splice(i, 1);
                continue;
            }
            contexto.strokeStyle = `rgba(185, 139, 255, ${pulso.alfa})`;
            contexto.lineWidth = 1.6;
            contexto.beginPath();
            contexto.arc(centroX, centroY, pulso.raio, 0, Math.PI * 2);
            contexto.stroke();
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        const nucleoPulso = 0.75 + Math.sin(tempo * 0.01) * 0.25;
        const halo = contexto.createRadialGradient(centroX, centroY, 0, centroX, centroY, 52 * nucleoPulso);
        halo.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        halo.addColorStop(0.4, 'rgba(160, 220, 255, 0.55)');
        halo.addColorStop(1, 'rgba(160, 220, 255, 0)');
        contexto.fillStyle = halo;
        contexto.beginPath();
        contexto.arc(centroX, centroY, 52 * nucleoPulso, 0, Math.PI * 2);
        contexto.fill();

        contexto.fillStyle = '#ffffff';
        contexto.beginPath();
        contexto.arc(centroX, centroY, 6, 0, Math.PI * 2);
        contexto.fill();
        contexto.restore();
    }

    // --- Tema "Supernova Nexo": explosão estelar com onda de choque e destroços ---
    function criarEstadoSupernova() {
        const { largura, altura } = medirViewport();
        const centroX = largura * 0.5;
        const centroY = altura * 0.44;
        const raioMax = Math.max(largura, altura) * 0.62;

        const estrelas = Array.from({ length: 100 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            raio: 0.4 + Math.random() * 1.1,
            fase: Math.random() * Math.PI * 2,
            velocidadeCintilo: 0.001 + Math.random() * 0.002,
        }));

        const nebulosa = Array.from({ length: 4 }, () => ({
            x: centroX + (Math.random() - 0.5) * raioMax * 1.2,
            y: centroY + (Math.random() - 0.5) * raioMax * 0.9,
            raio: raioMax * (0.35 + Math.random() * 0.35),
            matiz: 8 + Math.random() * 320,
        }));

        const destrocos = Array.from({ length: 90 }, () => {
            const angulo = Math.random() * Math.PI * 2;
            return {
                angulo,
                raio: Math.random() * raioMax,
                raioMax,
                velocidadeRaio: 0.6 + Math.random() * 1.6,
                tamanho: 0.7 + Math.random() * 1.6,
                fase: Math.random() * Math.PI * 2,
                velocidadeCintilo: 0.0015 + Math.random() * 0.0025,
            };
        });

        return {
            centroX,
            centroY,
            raioMax,
            estrelas,
            nebulosa,
            destrocos,
            ondas: [],
            proximaOnda: 10,
        };
    }

    function corExplosao(proximidade, alfa) {
        // Núcleo branco-quente esfriando para amarelo, laranja e vermelho nas bordas.
        const paradas = [
            [255, 255, 255],
            [255, 224, 150],
            [255, 150, 60],
            [200, 40, 30],
        ];
        const posicao = Math.min(0.999, Math.max(0, proximidade)) * (paradas.length - 1);
        const indice = Math.floor(posicao);
        const fracao = posicao - indice;
        const [r1, g1, b1] = paradas[indice];
        const [r2, g2, b2] = paradas[indice + 1];
        const r = Math.round(r1 + (r2 - r1) * fracao);
        const g = Math.round(g1 + (g2 - g1) * fracao);
        const b = Math.round(b1 + (b2 - b1) * fracao);
        return `rgba(${r}, ${g}, ${b}, ${alfa})`;
    }

    function desenharSupernova(tempo) {
        const { centroX, centroY, raioMax, estrelas, nebulosa, destrocos } = estado;

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const nuvem of nebulosa) {
            const gradiente = contexto.createRadialGradient(nuvem.x, nuvem.y, 0, nuvem.x, nuvem.y, nuvem.raio);
            gradiente.addColorStop(0, `hsla(${nuvem.matiz}, 85%, 55%, 0.08)`);
            gradiente.addColorStop(1, `hsla(${nuvem.matiz}, 85%, 55%, 0)`);
            contexto.fillStyle = gradiente;
            contexto.beginPath();
            contexto.arc(nuvem.x, nuvem.y, nuvem.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        for (const estrela of estrelas) {
            contexto.globalAlpha = 0.3 + Math.abs(Math.sin(tempo * estrela.velocidadeCintilo + estrela.fase)) * 0.5;
            contexto.fillStyle = '#fff2e8';
            contexto.beginPath();
            contexto.arc(estrela.x, estrela.y, estrela.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        estado.proximaOnda -= 1;
        if (estado.proximaOnda <= 0) {
            estado.ondas.push({ raio: 10, alfa: 0.8 });
            estado.proximaOnda = 130 + Math.random() * 90;
        }
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (let i = estado.ondas.length - 1; i >= 0; i -= 1) {
            const onda = estado.ondas[i];
            onda.raio += 2.6;
            onda.alfa -= 0.007;
            if (onda.alfa <= 0 || onda.raio > raioMax * 1.3) {
                estado.ondas.splice(i, 1);
                continue;
            }
            const proximidade = 1 - Math.min(1, onda.raio / raioMax);
            contexto.strokeStyle = corExplosao(proximidade, onda.alfa);
            contexto.lineWidth = 2.4;
            contexto.beginPath();
            contexto.arc(centroX, centroY, onda.raio, 0, Math.PI * 2);
            contexto.stroke();
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const destroco of destrocos) {
            destroco.raio += destroco.velocidadeRaio;
            if (destroco.raio > destroco.raioMax) {
                destroco.raio = 0;
                destroco.angulo = Math.random() * Math.PI * 2;
            }
            const proximidade = 1 - Math.min(1, destroco.raio / destroco.raioMax);
            const cintilo = 0.5 + Math.abs(Math.sin(tempo * destroco.velocidadeCintilo + destroco.fase)) * 0.5;
            const x = centroX + Math.cos(destroco.angulo) * destroco.raio;
            const y = centroY + Math.sin(destroco.angulo) * destroco.raio * 0.85;

            const halo = contexto.createRadialGradient(x, y, 0, x, y, destroco.tamanho * 3);
            halo.addColorStop(0, corExplosao(proximidade, 0.85 * cintilo));
            halo.addColorStop(1, corExplosao(proximidade, 0));
            contexto.fillStyle = halo;
            contexto.beginPath();
            contexto.arc(x, y, destroco.tamanho * 3, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        const pulsoNucleo = 0.8 + Math.sin(tempo * 0.006) * 0.2;
        const nucleo = contexto.createRadialGradient(centroX, centroY, 0, centroX, centroY, 60 * pulsoNucleo);
        nucleo.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        nucleo.addColorStop(0.35, 'rgba(255, 210, 140, 0.55)');
        nucleo.addColorStop(1, 'rgba(255, 122, 61, 0)');
        contexto.fillStyle = nucleo;
        contexto.beginPath();
        contexto.arc(centroX, centroY, 60 * pulsoNucleo, 0, Math.PI * 2);
        contexto.fill();
        contexto.restore();
    }

    // --- Tema "Oceano Nexo": raios de luz subaquáticos, bolhas e plâncton à deriva ---
    function criarEstadoOceano() {
        const { largura, altura } = medirViewport();

        const raios = Array.from({ length: 4 }, (_valor, indice) => ({
            x: (largura / 4) * indice + largura * 0.12,
            largura: largura * (0.22 + Math.random() * 0.12),
            fase: Math.random() * Math.PI * 2,
            velocidade: 0.0004 + Math.random() * 0.0004,
            amplitude: 40 + Math.random() * 40,
        }));

        const bolhas = Array.from({ length: 55 }, () => ({
            x: Math.random() * largura,
            y: altura + Math.random() * altura * 0.3,
            raio: 1.5 + Math.random() * 4,
            velocidadeY: 0.35 + Math.random() * 0.55,
            deriva: Math.random() * Math.PI * 2,
            velocidadeDeriva: 0.15 + Math.random() * 0.3,
        }));

        const plancton = Array.from({ length: 60 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            raio: 0.5 + Math.random() * 1,
            fase: Math.random() * Math.PI * 2,
            velocidadeCintilo: 0.0006 + Math.random() * 0.0012,
            velocidadeDeriva: 0.1 + Math.random() * 0.15,
        }));

        return { raios, bolhas, plancton };
    }

    function desenharOceano(tempo) {
        const { largura, altura } = medirViewport();
        const { raios, bolhas, plancton } = estado;

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const raio of raios) {
            const deslocamento = Math.sin(tempo * raio.velocidade + raio.fase) * raio.amplitude;
            const gradiente = contexto.createLinearGradient(raio.x, 0, raio.x + deslocamento * 1.6, altura);
            gradiente.addColorStop(0, 'rgba(126, 240, 255, 0.12)');
            gradiente.addColorStop(0.6, 'rgba(34, 195, 212, 0.05)');
            gradiente.addColorStop(1, 'rgba(34, 195, 212, 0)');
            contexto.fillStyle = gradiente;
            contexto.beginPath();
            contexto.moveTo(raio.x - raio.largura / 2 + deslocamento * 0.2, 0);
            contexto.lineTo(raio.x + raio.largura / 2 + deslocamento * 0.2, 0);
            contexto.lineTo(raio.x + raio.largura * 1.4 + deslocamento, altura);
            contexto.lineTo(raio.x - raio.largura * 1.4 + deslocamento, altura);
            contexto.closePath();
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        for (const especk of plancton) {
            especk.x += Math.sin(tempo * 0.0006 + especk.fase) * especk.velocidadeDeriva * 0.1;
            contexto.globalAlpha = 0.2 + Math.abs(Math.sin(tempo * especk.velocidadeCintilo + especk.fase)) * 0.35;
            contexto.fillStyle = '#bff3ff';
            contexto.beginPath();
            contexto.arc(especk.x, especk.y, especk.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        contexto.strokeStyle = 'rgba(200, 250, 255, 0.55)';
        contexto.lineWidth = 1;
        for (const bolha of bolhas) {
            bolha.deriva += 0.004 * bolha.velocidadeDeriva;
            bolha.y -= bolha.velocidadeY;
            bolha.x += Math.sin(bolha.deriva) * 0.5;
            if (bolha.y < -8) {
                bolha.y = altura + 8;
                bolha.x = Math.random() * largura;
            }
            contexto.globalAlpha = 0.35 + Math.sin(bolha.deriva) * 0.15;
            contexto.beginPath();
            contexto.arc(bolha.x, bolha.y, bolha.raio, 0, Math.PI * 2);
            contexto.stroke();
        }
        contexto.restore();
    }

    // --- Tema "Noir Nexo": chuva monocromática, luz de veneziana e neblina rasteira ---
    function criarEstadoNoir() {
        const { largura, altura } = medirViewport();

        const chuva = Array.from({ length: 90 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            comprimento: 10 + Math.random() * 16,
            velocidade: 6 + Math.random() * 6,
            vento: 0.6 + Math.random() * 0.6,
            alfa: 0.12 + Math.random() * 0.18,
        }));

        const venezianas = { deslocamento: 0, velocidade: 0.012 + Math.random() * 0.008 };

        const neblina = Array.from({ length: 3 }, (_valor, indice) => ({
            x: Math.random() * largura,
            y: altura * (0.78 + indice * 0.05),
            raio: largura * (0.28 + Math.random() * 0.18),
            velocidade: 0.06 + Math.random() * 0.1,
        }));

        return { chuva, venezianas, neblina };
    }

    function desenharNoir(tempo) {
        const { largura, altura } = medirViewport();
        const { chuva, venezianas, neblina } = estado;

        contexto.save();
        for (const nuvem of neblina) {
            nuvem.x += nuvem.velocidade;
            if (nuvem.x - nuvem.raio > largura) nuvem.x = -nuvem.raio;
            const gradiente = contexto.createRadialGradient(nuvem.x, nuvem.y, 0, nuvem.x, nuvem.y, nuvem.raio);
            gradiente.addColorStop(0, 'rgba(200, 200, 205, 0.08)');
            gradiente.addColorStop(1, 'rgba(200, 200, 205, 0)');
            contexto.fillStyle = gradiente;
            contexto.beginPath();
            contexto.arc(nuvem.x, nuvem.y, nuvem.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        venezianas.deslocamento += venezianas.velocidade;
        const faixa = 46;
        contexto.save();
        contexto.fillStyle = 'rgba(0, 0, 0, 0.28)';
        const inclinacao = 0.35;
        for (let x = -altura * inclinacao; x < largura + faixa * 2; x += faixa * 2) {
            const deslocado = x + (venezianas.deslocamento % (faixa * 2));
            contexto.beginPath();
            contexto.moveTo(deslocado, 0);
            contexto.lineTo(deslocado + faixa, 0);
            contexto.lineTo(deslocado + faixa - altura * inclinacao, altura);
            contexto.lineTo(deslocado - altura * inclinacao, altura);
            contexto.closePath();
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        contexto.strokeStyle = 'rgba(220, 220, 225, 1)';
        contexto.lineWidth = 1;
        for (const gota of chuva) {
            gota.y += gota.velocidade;
            gota.x -= gota.vento;
            if (gota.y > altura) {
                gota.y = -gota.comprimento;
                gota.x = Math.random() * largura + largura * 0.1;
            }
            contexto.globalAlpha = gota.alfa;
            contexto.beginPath();
            contexto.moveTo(gota.x, gota.y);
            contexto.lineTo(gota.x - gota.vento * 2, gota.y + gota.comprimento);
            contexto.stroke();
        }
        contexto.restore();
    }

    // --- Tema "Titânio Lunar": céu lunar prateado com reflexo metálico varrendo a tela ---
    function criarEstadoTitanio() {
        const { largura, altura } = medirViewport();

        const estrelas = Array.from({ length: 90 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            raio: 0.4 + Math.random() * 1.1,
            fase: Math.random() * Math.PI * 2,
            velocidadeCintilo: 0.001 + Math.random() * 0.0018,
        }));

        return {
            estrelas,
            detritos: [],
            proximoDetrito: 120 + Math.random() * 200,
        };
    }

    function desenharTitanio(tempo) {
        const { largura, altura } = medirViewport();
        const { estrelas, detritos } = estado;

        contexto.save();
        for (const estrela of estrelas) {
            contexto.globalAlpha = 0.3 + Math.abs(Math.sin(tempo * estrela.velocidadeCintilo + estrela.fase)) * 0.5;
            contexto.fillStyle = '#f1f1ff';
            contexto.beginPath();
            contexto.arc(estrela.x, estrela.y, estrela.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        const largoFeixe = largura * 0.3;
        const percurso = largura + largoFeixe * 2;
        const posicao = ((tempo * 0.05) % percurso) - largoFeixe;
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        const gradiente = contexto.createLinearGradient(posicao - largoFeixe, 0, posicao + largoFeixe, altura);
        gradiente.addColorStop(0, 'rgba(216, 216, 213, 0)');
        gradiente.addColorStop(0.5, 'rgba(216, 216, 213, 0.09)');
        gradiente.addColorStop(1, 'rgba(216, 216, 213, 0)');
        contexto.fillStyle = gradiente;
        contexto.fillRect(posicao - largoFeixe, 0, largoFeixe * 2, altura);
        contexto.restore();

        estado.proximoDetrito -= 1;
        if (estado.proximoDetrito <= 0) {
            estado.proximoDetrito = 200 + Math.random() * 300;
            detritos.push({
                x: Math.random() * largura * 0.4,
                y: Math.random() * altura * 0.4,
                vx: 3 + Math.random() * 2,
                vy: 1.4 + Math.random() * 1,
                vida: 1,
            });
        }
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (let i = detritos.length - 1; i >= 0; i -= 1) {
            const detrito = detritos[i];
            detrito.x += detrito.vx;
            detrito.y += detrito.vy;
            detrito.vida -= 0.018;
            if (detrito.vida <= 0 || detrito.x > largura + 40) {
                detritos.splice(i, 1);
                continue;
            }
            const cauda = contexto.createLinearGradient(
                detrito.x, detrito.y,
                detrito.x - detrito.vx * 8, detrito.y - detrito.vy * 8,
            );
            cauda.addColorStop(0, `rgba(230, 230, 235, ${detrito.vida})`);
            cauda.addColorStop(1, 'rgba(230, 230, 235, 0)');
            contexto.strokeStyle = cauda;
            contexto.lineWidth = 1.2;
            contexto.beginPath();
            contexto.moveTo(detrito.x, detrito.y);
            contexto.lineTo(detrito.x - detrito.vx * 8, detrito.y - detrito.vy * 8);
            contexto.stroke();
        }
        contexto.restore();
    }

    // --- Tema especial "Cyberpunk Nexo": skyline neon com prédios, chuva e glitch ---
    function gerarPrediosCyberpunk(largura, altura, alturaMin, alturaMax) {
        const predios = [];
        let x = -70;
        while (x < largura + 20) {
            const largo = 72 + Math.random() * 100;
            const alt = alturaMin + Math.random() * (alturaMax - alturaMin);
            const estilo = Math.floor(Math.random() * 5);
            const predio = {
                x,
                largura: largo,
                altura: alt,
                estilo,
                antena: 8 + Math.random() * 28,
                ladoIluminado: Math.random() < 0.5 ? 'esquerdo' : 'direito',
                faixaY: 0.2 + Math.random() * 0.48,
                faixaMatiz: Math.random() < 0.5 ? 188 : 318,
                janelas: [],
            };
            const colunas = Math.max(2, Math.floor((largo - 20) / 20));
            const linhas = Math.max(3, Math.floor((alt - 32) / 26));
            const padraoApagado = 3 + Math.floor(Math.random() * 3);
            for (let c = 0; c < colunas; c += 1) {
                for (let l = 0; l < linhas; l += 1) {
                    const janelaEstrutural = (c + l * 2 + estilo) % padraoApagado !== 0;
                    if (janelaEstrutural && Math.random() < 0.42) {
                        predio.janelas.push({
                            ox: 10 + c * 20,
                            oy: 28 + l * 26,
                            largura: 8 + Math.random() * 5,
                            altura: 2.5 + Math.random() * 1.5,
                            fase: Math.random() * Math.PI * 2,
                            velocidade: 0.00045 + Math.random() * 0.0011,
                            matiz: Math.random() < 0.62 ? 42 : (Math.random() < 0.5 ? 188 : 318),
                        });
                    }
                }
            }
            predios.push(predio);
            x += largo + 24 + Math.random() * 36;
        }
        return predios;
    }

    function criarEstadoCyberpunk() {
        const { largura, altura } = medirViewport();

        const prediosDistantes = gerarPrediosCyberpunk(largura, altura, altura * 0.16, altura * 0.32);
        const prediosProximos = gerarPrediosCyberpunk(largura, altura, altura * 0.24, altura * 0.5);

        const letreiros = Array.from({ length: 5 }, () => ({
            x: Math.random() * largura,
            y: altura * (0.22 + Math.random() * 0.35),
            largura: 26 + Math.random() * 40,
            altura: 8 + Math.random() * 14,
            matiz: Math.random() < 0.5 ? 320 : 185,
            fase: Math.random() * Math.PI * 2,
            velocidadePulso: 0.0015 + Math.random() * 0.002,
        }));

        const carros = Array.from({ length: 10 }, () => ({
            x: Math.random() * largura,
            y: altura * (0.15 + Math.random() * 0.35),
            velocidade: 1.2 + Math.random() * 2.2,
            comprimento: 20 + Math.random() * 30,
            matiz: Math.random() < 0.5 ? 320 : 190,
        }));

        const chuva = Array.from({ length: 110 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            comprimento: 10 + Math.random() * 16,
            velocidade: 7 + Math.random() * 7,
            vento: 1 + Math.random(),
            alfa: 0.1 + Math.random() * 0.16,
        }));

        const drones = Array.from({ length: 2 }, () => ({
            faseX: Math.random() * Math.PI * 2,
            faseY: Math.random() * Math.PI * 2,
            velocidadeX: 0.00022 + Math.random() * 0.00015,
            velocidadeY: 0.00035 + Math.random() * 0.0002,
            centroX: largura * (0.25 + Math.random() * 0.5),
            centroY: altura * (0.1 + Math.random() * 0.18),
            amplitudeX: largura * (0.18 + Math.random() * 0.15),
            amplitudeY: altura * 0.06,
            velocidadePisca: 0.006 + Math.random() * 0.004,
        }));

        const alfabetoDados = '01A7F9NX<>/';
        const fluxosDados = Array.from({ length: 18 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            velocidade: 0.35 + Math.random() * 0.7,
            espacamento: 11 + Math.random() * 5,
            alfa: 0.05 + Math.random() * 0.09,
            caracteres: Array.from(
                { length: 4 + Math.floor(Math.random() * 5) },
                () => alfabetoDados[Math.floor(Math.random() * alfabetoDados.length)],
            ),
        }));

        const hud = {
            x: largura * 0.78,
            y: altura * 0.24,
            raio: Math.min(largura, altura) * 0.095,
        };

        return {
            prediosDistantes,
            prediosProximos,
            letreiros,
            carros,
            chuva,
            drones,
            fluxosDados,
            hud,
            scanline: 0,
            proximoGlitch: 200 + Math.random() * 300,
            glitch: { restante: 0, y: 0, altura: 0 },
        };
    }

    function tracarSilhuetaPredioCyberpunk(predio, altura) {
        const esquerda = predio.x;
        const direita = predio.x + predio.largura;
        const topo = altura - predio.altura;
        contexto.beginPath();
        contexto.moveTo(esquerda, altura + 4);

        if (predio.estilo === 0) {
            contexto.lineTo(esquerda, topo + 22);
            contexto.lineTo(esquerda + predio.largura * 0.16, topo + 22);
            contexto.lineTo(esquerda + predio.largura * 0.16, topo + 9);
            contexto.lineTo(esquerda + predio.largura * 0.38, topo + 9);
            contexto.lineTo(esquerda + predio.largura * 0.38, topo);
            contexto.lineTo(direita - predio.largura * 0.18, topo);
            contexto.lineTo(direita - predio.largura * 0.18, topo + 14);
            contexto.lineTo(direita, topo + 14);
        } else if (predio.estilo === 1) {
            contexto.lineTo(esquerda, topo + 14);
            contexto.lineTo(esquerda + predio.largura * 0.37, topo + 14);
            contexto.lineTo(esquerda + predio.largura * 0.5, topo - 9);
            contexto.lineTo(esquerda + predio.largura * 0.63, topo + 14);
            contexto.lineTo(direita, topo + 14);
        } else if (predio.estilo === 2) {
            contexto.lineTo(esquerda, topo + 24);
            contexto.lineTo(esquerda + predio.largura * 0.68, topo);
            contexto.lineTo(direita, topo + 17);
        } else if (predio.estilo === 3) {
            contexto.lineTo(esquerda, topo + 17);
            contexto.lineTo(esquerda + predio.largura * 0.34, topo + 17);
            contexto.lineTo(esquerda + predio.largura * 0.34, topo);
            contexto.lineTo(esquerda + predio.largura * 0.49, topo);
            contexto.lineTo(esquerda + predio.largura * 0.49, topo + 28);
            contexto.lineTo(esquerda + predio.largura * 0.63, topo + 28);
            contexto.lineTo(esquerda + predio.largura * 0.63, topo + 7);
            contexto.lineTo(esquerda + predio.largura * 0.84, topo + 7);
            contexto.lineTo(esquerda + predio.largura * 0.84, topo + 17);
            contexto.lineTo(direita, topo + 17);
        } else {
            contexto.lineTo(esquerda, topo + 12);
            contexto.lineTo(esquerda + predio.largura * 0.22, topo + 12);
            contexto.lineTo(esquerda + predio.largura * 0.28, topo);
            contexto.lineTo(esquerda + predio.largura * 0.72, topo);
            contexto.lineTo(esquerda + predio.largura * 0.78, topo + 12);
            contexto.lineTo(direita, topo + 12);
        }

        contexto.lineTo(direita, altura + 4);
        contexto.closePath();
    }

    function desenharCamadaPrediosCyberpunk(predios, altura, baseAlpha, tempo) {
        contexto.save();
        for (const predio of predios) {
            const topo = altura - predio.altura;
            tracarSilhuetaPredioCyberpunk(predio, altura);
            contexto.fillStyle = `rgba(10, 8, 24, ${baseAlpha})`;
            contexto.fill();
            contexto.strokeStyle = `rgba(82, 72, 126, ${(baseAlpha * 0.38).toFixed(3)})`;
            contexto.lineWidth = 0.8;
            contexto.stroke();

            const larguraLateral = Math.max(8, predio.largura * 0.12);
            contexto.fillStyle = predio.ladoIluminado === 'direito'
                ? `rgba(45, 226, 255, ${(baseAlpha * 0.035).toFixed(3)})`
                : `rgba(255, 46, 196, ${(baseAlpha * 0.028).toFixed(3)})`;
            contexto.beginPath();
            contexto.moveTo(predio.x + predio.largura - larguraLateral, topo + 18);
            contexto.lineTo(predio.x + predio.largura, topo + 13);
            contexto.lineTo(predio.x + predio.largura, altura);
            contexto.lineTo(predio.x + predio.largura - larguraLateral, altura);
            contexto.closePath();
            contexto.fill();

            contexto.strokeStyle = `hsla(${predio.faixaMatiz}, 100%, 67%, ${(baseAlpha * 0.34).toFixed(3)})`;
            contexto.lineWidth = 1;
            const faixaY = topo + predio.altura * predio.faixaY;
            contexto.beginPath();
            contexto.moveTo(predio.x + 5, faixaY);
            contexto.lineTo(predio.x + predio.largura - 5, faixaY);
            contexto.stroke();

            contexto.strokeStyle = `rgba(112, 98, 162, ${(baseAlpha * 0.16).toFixed(3)})`;
            for (let divisao = 1; divisao <= 2; divisao += 1) {
                const dx = predio.x + (predio.largura * divisao) / 3;
                contexto.beginPath();
                contexto.moveTo(dx, topo + 24);
                contexto.lineTo(dx, altura);
                contexto.stroke();
            }

            if (predio.estilo === 1 || predio.estilo === 4) {
                const antenaX = predio.x + predio.largura * 0.5;
                contexto.strokeStyle = `rgba(126, 232, 255, ${(baseAlpha * 0.42).toFixed(3)})`;
                contexto.beginPath();
                contexto.moveTo(antenaX, topo);
                contexto.lineTo(antenaX, topo - predio.antena);
                contexto.stroke();
                contexto.fillStyle = `rgba(255, 46, 196, ${(baseAlpha * 0.7).toFixed(3)})`;
                contexto.fillRect(antenaX - 1, topo - predio.antena - 2, 2, 2);
            }
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const predio of predios) {
            const py = altura - predio.altura;
            for (const janela of predio.janelas) {
                const cintilo = 0.45 + Math.abs(Math.sin(tempo * janela.velocidade + janela.fase)) * 0.4;
                contexto.fillStyle = `hsla(${janela.matiz}, 88%, 65%, ${(cintilo * baseAlpha * 0.7).toFixed(3)})`;
                contexto.fillRect(
                    predio.x + janela.ox,
                    py + janela.oy,
                    janela.largura,
                    janela.altura,
                );
            }
        }
        contexto.restore();
    }

    function desenharCyberpunk(tempo) {
        const { largura, altura } = medirViewport();
        const { prediosDistantes, prediosProximos, letreiros, carros, chuva, drones, fluxosDados, hud } = estado;

        // Fluxos discretos de telemetria atravessam o céu ao fundo.
        contexto.save();
        contexto.font = '10px "Share Tech Mono", "JetBrains Mono", monospace';
        contexto.textAlign = 'center';
        contexto.globalCompositeOperation = 'lighter';
        for (const fluxo of fluxosDados) {
            fluxo.y += fluxo.velocidade;
            if (fluxo.y - fluxo.caracteres.length * fluxo.espacamento > altura) {
                fluxo.y = -20;
                fluxo.x = Math.random() * largura;
            }
            for (let i = 0; i < fluxo.caracteres.length; i += 1) {
                const alfa = fluxo.alfa * (1 - i / fluxo.caracteres.length);
                contexto.fillStyle = i % 3 === 0
                    ? `rgba(255, 46, 196, ${alfa.toFixed(3)})`
                    : `rgba(45, 226, 255, ${alfa.toFixed(3)})`;
                contexto.fillText(
                    fluxo.caracteres[i],
                    fluxo.x,
                    fluxo.y - i * fluxo.espacamento,
                );
            }
        }
        contexto.restore();

        // HUD de rastreamento, com anéis independentes e retículo pulsante.
        contexto.save();
        contexto.translate(hud.x, hud.y);
        contexto.globalCompositeOperation = 'lighter';
        const pulsoHud = 0.55 + Math.sin(tempo * 0.0022) * 0.2;
        contexto.strokeStyle = `rgba(45, 226, 255, ${(0.22 * pulsoHud).toFixed(3)})`;
        contexto.lineWidth = 1;
        contexto.setLineDash([5, 8]);
        contexto.beginPath();
        contexto.arc(0, 0, hud.raio, tempo * 0.00008, tempo * 0.00008 + Math.PI * 1.55);
        contexto.stroke();
        contexto.setLineDash([2, 5]);
        contexto.strokeStyle = `rgba(255, 46, 196, ${(0.28 * pulsoHud).toFixed(3)})`;
        contexto.beginPath();
        contexto.arc(0, 0, hud.raio * 0.72, -tempo * 0.00013, -tempo * 0.00013 + Math.PI * 1.22);
        contexto.stroke();
        contexto.setLineDash([]);
        contexto.strokeStyle = 'rgba(45, 226, 255, 0.16)';
        contexto.beginPath();
        contexto.moveTo(-hud.raio * 1.18, 0);
        contexto.lineTo(-hud.raio * 0.28, 0);
        contexto.moveTo(hud.raio * 0.28, 0);
        contexto.lineTo(hud.raio * 1.18, 0);
        contexto.moveTo(0, -hud.raio * 1.18);
        contexto.lineTo(0, -hud.raio * 0.28);
        contexto.moveTo(0, hud.raio * 0.28);
        contexto.lineTo(0, hud.raio * 1.18);
        contexto.stroke();
        contexto.fillStyle = `rgba(255, 46, 196, ${(0.42 * pulsoHud).toFixed(3)})`;
        contexto.beginPath();
        contexto.arc(0, 0, 2.2 + pulsoHud, 0, Math.PI * 2);
        contexto.fill();
        contexto.restore();

        desenharCamadaPrediosCyberpunk(prediosDistantes, altura, 0.5, tempo);
        desenharCamadaPrediosCyberpunk(prediosProximos, altura, 0.85, tempo);

        // Reflexo neon molhado no chão, como se a chuva ácida espelhasse a cidade.
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        const reflexo = contexto.createLinearGradient(0, altura - 26, 0, altura);
        reflexo.addColorStop(0, 'rgba(255, 46, 196, 0.05)');
        reflexo.addColorStop(0.5, 'rgba(45, 226, 255, 0.04)');
        reflexo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        contexto.fillStyle = reflexo;
        contexto.fillRect(0, altura - 26, largura, 26);
        contexto.restore();

        // Drones de vigilância vagando pelo céu, piscando luzes de alerta.
        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const drone of drones) {
            const x = drone.centroX + Math.sin(tempo * drone.velocidadeX + drone.faseX) * drone.amplitudeX;
            const y = drone.centroY + Math.sin(tempo * drone.velocidadeY + drone.faseY) * drone.amplitudeY;
            const pisca = Math.sin(tempo * drone.velocidadePisca) > 0.7;
            contexto.fillStyle = pisca ? 'rgba(255, 56, 96, 0.9)' : 'rgba(45, 226, 255, 0.55)';
            contexto.beginPath();
            contexto.arc(x, y, pisca ? 2.4 : 1.6, 0, Math.PI * 2);
            contexto.fill();

            if (pisca) {
                const halo = contexto.createRadialGradient(x, y, 0, x, y, 10);
                halo.addColorStop(0, 'rgba(255, 56, 96, 0.4)');
                halo.addColorStop(1, 'rgba(255, 56, 96, 0)');
                contexto.fillStyle = halo;
                contexto.beginPath();
                contexto.arc(x, y, 10, 0, Math.PI * 2);
                contexto.fill();
            }
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const letreiro of letreiros) {
            const pulso = 0.6 + Math.sin(tempo * letreiro.velocidadePulso + letreiro.fase) * 0.4;
            const gradiente = contexto.createRadialGradient(letreiro.x, letreiro.y, 0, letreiro.x, letreiro.y, letreiro.largura);
            gradiente.addColorStop(0, `hsla(${letreiro.matiz}, 100%, 65%, ${(0.5 * pulso).toFixed(3)})`);
            gradiente.addColorStop(1, `hsla(${letreiro.matiz}, 100%, 65%, 0)`);
            contexto.fillStyle = gradiente;
            contexto.beginPath();
            contexto.ellipse(letreiro.x, letreiro.y, letreiro.largura, letreiro.altura, 0, 0, Math.PI * 2);
            contexto.fill();
            contexto.strokeStyle = `hsla(${letreiro.matiz}, 100%, 75%, ${(0.8 * pulso).toFixed(3)})`;
            contexto.lineWidth = 1.4;
            contexto.strokeRect(letreiro.x - letreiro.largura / 2, letreiro.y - letreiro.altura / 2, letreiro.largura, letreiro.altura);
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const carro of carros) {
            carro.x += carro.velocidade;
            if (carro.x - carro.comprimento > largura) {
                carro.x = -carro.comprimento;
                carro.y = altura * (0.15 + Math.random() * 0.35);
            }
            const gradiente = contexto.createLinearGradient(carro.x - carro.comprimento, carro.y, carro.x, carro.y);
            gradiente.addColorStop(0, `hsla(${carro.matiz}, 100%, 65%, 0)`);
            gradiente.addColorStop(1, `hsla(${carro.matiz}, 100%, 70%, 0.85)`);
            contexto.strokeStyle = gradiente;
            contexto.lineWidth = 1.6;
            contexto.beginPath();
            contexto.moveTo(carro.x - carro.comprimento, carro.y);
            contexto.lineTo(carro.x, carro.y);
            contexto.stroke();
        }
        contexto.restore();

        contexto.save();
        contexto.strokeStyle = 'rgba(140, 200, 255, 0.5)';
        contexto.lineWidth = 1;
        for (const gota of chuva) {
            gota.y += gota.velocidade;
            gota.x -= gota.vento;
            if (gota.y > altura) {
                gota.y = -gota.comprimento;
                gota.x = Math.random() * largura + largura * 0.05;
            }
            contexto.globalAlpha = gota.alfa;
            contexto.beginPath();
            contexto.moveTo(gota.x, gota.y);
            contexto.lineTo(gota.x - gota.vento * 2, gota.y + gota.comprimento);
            contexto.stroke();
        }
        contexto.restore();

        // Sweep de scanline, como um monitor CRT antigo.
        estado.scanline = (estado.scanline + 0.6) % altura;
        contexto.save();
        contexto.fillStyle = 'rgba(180, 220, 255, 0.05)';
        contexto.fillRect(0, estado.scanline, largura, 2);
        contexto.restore();

        // Glitch ocasional de aberração cromática, reforçando o clima cyberpunk.
        estado.proximoGlitch -= 1;
        if (estado.proximoGlitch <= 0 && estado.glitch.restante <= 0) {
            estado.glitch = {
                restante: 3 + Math.floor(Math.random() * 4),
                y: Math.random() * altura,
                altura: 10 + Math.random() * 40,
            };
            estado.proximoGlitch = 260 + Math.random() * 400;
        }
        if (estado.glitch.restante > 0) {
            const { y, altura: altoFaixa } = estado.glitch;
            contexto.save();
            contexto.globalCompositeOperation = 'lighter';
            contexto.globalAlpha = 0.18;
            contexto.fillStyle = 'rgba(255, 46, 196, 1)';
            contexto.fillRect(-4, y, largura, altoFaixa);
            contexto.fillStyle = 'rgba(45, 226, 255, 1)';
            contexto.fillRect(4, y, largura, altoFaixa);
            contexto.restore();
            estado.glitch.restante -= 1;
        }
    }

    // --- Tema especial "Vírus Nexo": terminal hacker e infecção digital ---
    function criarEstadoVirus() {
        const { largura, altura } = medirViewport();
        const caracteres = '01ABCDEF<>[]{}$#@/\\';

        const colunas = Array.from({ length: Math.max(28, Math.floor(largura / 28)) }, (_, indice) => ({
            x: indice * 28 + Math.random() * 12,
            y: Math.random() * altura,
            velocidade: 1.4 + Math.random() * 3.2,
            espacamento: 13 + Math.random() * 5,
            alfa: 0.06 + Math.random() * 0.13,
            comprimento: 5 + Math.floor(Math.random() * 12),
            faseTroca: Math.random() * 100,
        }));

        const nodos = Array.from({ length: 24 }, () => ({
            x: largura * (0.08 + Math.random() * 0.84),
            y: altura * (0.08 + Math.random() * 0.78),
            raio: 1.5 + Math.random() * 2.5,
            fase: Math.random() * Math.PI * 2,
            velocidade: 0.0008 + Math.random() * 0.0014,
            infectado: Math.random() < 0.28,
        }));

        const celulas = Array.from({ length: 13 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            raio: 8 + Math.random() * 20,
            pontas: 8 + Math.floor(Math.random() * 7),
            rotacao: Math.random() * Math.PI * 2,
            velocidadeRotacao: (Math.random() - 0.5) * 0.0012,
            derivaX: (Math.random() - 0.5) * 0.18,
            derivaY: -0.04 - Math.random() * 0.08,
            fase: Math.random() * Math.PI * 2,
        }));

        const comandos = [
            'sudo inject --payload nexo.bin',
            'ACCESS_TOKEN: COMPROMISED',
            'scanning ports... 22 80 443',
            'root@garimpu: persistence enabled',
            'checksum mismatch // mutation detected',
            'uploading genome_0x7f...',
        ].map((texto) => ({
            texto,
            x: Math.random() * largura,
            y: Math.random() * altura,
            alfa: 0.04 + Math.random() * 0.08,
            velocidade: 0.015 + Math.random() * 0.03,
        }));

        return {
            caracteres,
            colunas,
            nodos,
            celulas,
            comandos,
            proximoGlitch: 180 + Math.random() * 300,
            glitch: { restante: 0, y: 0, altura: 0 },
        };
    }

    function desenharCelulaVirus(celula, tempo) {
        const pulso = 0.82 + Math.sin(tempo * 0.0018 + celula.fase) * 0.14;
        const raio = celula.raio * pulso;
        contexto.save();
        contexto.translate(celula.x, celula.y);
        contexto.rotate(celula.rotacao);
        contexto.globalCompositeOperation = 'lighter';
        contexto.strokeStyle = 'rgba(57, 255, 111, 0.34)';
        contexto.fillStyle = 'rgba(10, 72, 31, 0.13)';
        contexto.lineWidth = 1;

        contexto.beginPath();
        for (let i = 0; i < celula.pontas * 2; i += 1) {
            const angulo = (Math.PI * 2 * i) / (celula.pontas * 2);
            const r = i % 2 === 0 ? raio * 1.38 : raio;
            const x = Math.cos(angulo) * r;
            const y = Math.sin(angulo) * r;
            if (i === 0) contexto.moveTo(x, y);
            else contexto.lineTo(x, y);
        }
        contexto.closePath();
        contexto.fill();
        contexto.stroke();

        contexto.setLineDash([2, 4]);
        contexto.strokeStyle = 'rgba(138, 255, 170, 0.42)';
        contexto.beginPath();
        contexto.arc(0, 0, raio * 0.68, -celula.rotacao * 2, Math.PI * 1.55 - celula.rotacao * 2);
        contexto.stroke();
        contexto.setLineDash([]);

        const nucleo = contexto.createRadialGradient(0, 0, 0, 0, 0, raio * 0.48);
        nucleo.addColorStop(0, 'rgba(255, 51, 79, 0.48)');
        nucleo.addColorStop(0.35, 'rgba(57, 255, 111, 0.2)');
        nucleo.addColorStop(1, 'rgba(57, 255, 111, 0)');
        contexto.fillStyle = nucleo;
        contexto.beginPath();
        contexto.arc(0, 0, raio * 0.48, 0, Math.PI * 2);
        contexto.fill();
        contexto.restore();
    }

    function desenharVirus(tempo) {
        const { largura, altura } = medirViewport();
        const { caracteres, colunas, nodos, celulas, comandos } = estado;

        contexto.save();
        contexto.font = '11px "JetBrains Mono", "Share Tech Mono", monospace';
        contexto.textAlign = 'center';
        contexto.globalCompositeOperation = 'lighter';
        for (const coluna of colunas) {
            coluna.y += coluna.velocidade;
            if (coluna.y - coluna.comprimento * coluna.espacamento > altura) {
                coluna.y = -20;
                coluna.velocidade = 1.4 + Math.random() * 3.2;
            }
            for (let i = 0; i < coluna.comprimento; i += 1) {
                const indice = Math.floor(tempo * 0.008 + coluna.faseTroca + i * 7) % caracteres.length;
                const alfa = coluna.alfa * (1 - i / coluna.comprimento);
                contexto.fillStyle = i === 0
                    ? `rgba(215, 255, 56, ${(alfa * 1.6).toFixed(3)})`
                    : `rgba(57, 255, 111, ${alfa.toFixed(3)})`;
                contexto.fillText(caracteres[indice], coluna.x, coluna.y - i * coluna.espacamento);
            }
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (let i = 0; i < nodos.length; i += 1) {
            const atual = nodos[i];
            for (let salto = 1; salto <= 2; salto += 1) {
                const destino = nodos[(i + salto) % nodos.length];
                const distancia = Math.hypot(destino.x - atual.x, destino.y - atual.y);
                if (distancia > Math.min(largura, altura) * 0.34) continue;
                const pulso = (Math.sin(tempo * 0.001 + atual.fase + salto) + 1) / 2;
                contexto.strokeStyle = atual.infectado
                    ? `rgba(255, 51, 79, ${(0.04 + pulso * 0.09).toFixed(3)})`
                    : `rgba(57, 255, 111, ${(0.025 + pulso * 0.055).toFixed(3)})`;
                contexto.lineWidth = 0.7;
                contexto.beginPath();
                contexto.moveTo(atual.x, atual.y);
                contexto.lineTo(destino.x, destino.y);
                contexto.stroke();

                if (salto === 1) {
                    const t = (tempo * 0.00012 + atual.fase / (Math.PI * 2)) % 1;
                    contexto.fillStyle = atual.infectado ? 'rgba(255, 51, 79, 0.65)' : 'rgba(57, 255, 111, 0.48)';
                    contexto.beginPath();
                    contexto.arc(atual.x + (destino.x - atual.x) * t, atual.y + (destino.y - atual.y) * t, 1.4, 0, Math.PI * 2);
                    contexto.fill();
                }
            }

            const brilho = 0.35 + Math.abs(Math.sin(tempo * atual.velocidade + atual.fase)) * 0.5;
            contexto.fillStyle = atual.infectado
                ? `rgba(255, 51, 79, ${brilho.toFixed(3)})`
                : `rgba(57, 255, 111, ${(brilho * 0.72).toFixed(3)})`;
            contexto.beginPath();
            contexto.arc(atual.x, atual.y, atual.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        for (const celula of celulas) {
            celula.x += celula.derivaX;
            celula.y += celula.derivaY;
            celula.rotacao += celula.velocidadeRotacao;
            if (celula.y + celula.raio * 2 < 0) {
                celula.y = altura + celula.raio * 2;
                celula.x = Math.random() * largura;
            }
            if (celula.x < -50) celula.x = largura + 50;
            if (celula.x > largura + 50) celula.x = -50;
            desenharCelulaVirus(celula, tempo);
        }

        contexto.save();
        contexto.font = '10px "JetBrains Mono", monospace';
        contexto.globalCompositeOperation = 'lighter';
        for (const comando of comandos) {
            comando.y -= comando.velocidade;
            if (comando.y < -12) comando.y = altura + 12;
            contexto.fillStyle = `rgba(138, 255, 170, ${comando.alfa.toFixed(3)})`;
            contexto.fillText(comando.texto, comando.x, comando.y);
        }
        contexto.restore();

        estado.proximoGlitch -= 1;
        if (estado.proximoGlitch <= 0 && estado.glitch.restante <= 0) {
            estado.glitch = {
                restante: 4 + Math.floor(Math.random() * 5),
                y: Math.random() * altura,
                altura: 8 + Math.random() * 30,
            };
            estado.proximoGlitch = 240 + Math.random() * 420;
        }
        if (estado.glitch.restante > 0) {
            contexto.save();
            contexto.globalCompositeOperation = 'lighter';
            contexto.globalAlpha = 0.14;
            contexto.fillStyle = 'rgba(57, 255, 111, 1)';
            contexto.fillRect(-5, estado.glitch.y, largura, estado.glitch.altura);
            contexto.fillStyle = 'rgba(255, 51, 79, 1)';
            contexto.fillRect(5, estado.glitch.y + 2, largura, Math.max(2, estado.glitch.altura - 4));
            contexto.restore();
            estado.glitch.restante -= 1;
        }
    }

    // --- Tema especial "Multiverso Nexo": realidades paralelas e portais ---
    function criarEstadoMultiverso() {
        const { largura, altura } = medirViewport();
        const menor = Math.min(largura, altura);

        const estrelas = Array.from({ length: 76 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            raio: 0.3 + Math.random() * 1.1,
            fase: Math.random() * Math.PI * 2,
            velocidade: 0.0005 + Math.random() * 0.0015,
            camada: 0.25 + Math.random() * 0.75,
        }));

        const universos = Array.from({ length: 4 }, (_, indice) => ({
            x: largura * (0.08 + Math.random() * 0.84),
            y: altura * (0.08 + Math.random() * 0.78),
            raio: menor * (0.025 + Math.random() * 0.055),
            matiz: [275, 190, 335, 45][indice % 4],
            fase: Math.random() * Math.PI * 2,
            velocidade: (Math.random() - 0.5) * 0.00045,
            derivaX: (Math.random() - 0.5) * 0.05,
            derivaY: (Math.random() - 0.5) * 0.035,
            satelites: 2 + Math.floor(Math.random() * 3),
        }));

        const nebulosas = Array.from({ length: 2 }, (_, indice) => ({
            x: largura * (0.12 + Math.random() * 0.76),
            y: altura * (0.08 + Math.random() * 0.82),
            raioX: menor * (0.18 + Math.random() * 0.24),
            raioY: menor * (0.08 + Math.random() * 0.12),
            matiz: [274, 190, 326, 220, 42][indice],
            fase: Math.random() * Math.PI * 2,
            rotacao: Math.random() * Math.PI,
            velocidade: (Math.random() - 0.5) * 0.000035,
        }));

        const portais = [
            { x: largura * 0.77, y: altura * 0.72, raio: menor * 0.155, fase: 0, sentido: 1 },
            { x: largura * 0.24, y: altura * 0.68, raio: menor * 0.095, fase: 2.2, sentido: -1 },
            { x: largura * 0.92, y: altura * 0.18, raio: menor * 0.068, fase: 4.1, sentido: 1 },
        ].map((portal) => ({
            ...portal,
            particulas: Array.from({ length: 10 }, () => ({
                angulo: Math.random() * Math.PI * 2,
                distancia: 0.48 + Math.random() * 0.52,
                velocidade: (0.00018 + Math.random() * 0.00042) * portal.sentido,
                raio: 0.5 + Math.random() * 1.5,
                fase: Math.random() * Math.PI * 2,
            })),
        }));

        const fendas = Array.from({ length: 2 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            comprimento: menor * (0.12 + Math.random() * 0.18),
            angulo: Math.random() * Math.PI * 2,
            fase: Math.random() * Math.PI * 2,
            matiz: Math.random() < 0.5 ? 190 : 285,
        }));

        const ecos = Array.from({ length: 3 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            largura: 50 + Math.random() * 110,
            altura: 18 + Math.random() * 45,
            fase: Math.random() * Math.PI * 2,
            velocidade: 0.0004 + Math.random() * 0.0005,
        }));

        const fragmentos = Array.from({ length: 9 }, (_, indice) => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            tamanho: 4 + Math.random() * 13,
            angulo: Math.random() * Math.PI * 2,
            rotacao: (Math.random() - 0.5) * 0.0008,
            derivaX: (Math.random() - 0.5) * 0.035,
            derivaY: -0.012 - Math.random() * 0.025,
            matiz: [190, 275, 330][indice % 3],
            fase: Math.random() * Math.PI * 2,
        }));

        const cometas = Array.from({ length: 2 }, (_, indice) => ({
            atraso: indice * 3100 + Math.random() * 1600,
            ciclo: 12500 + Math.random() * 6000,
            y: altura * (0.08 + Math.random() * 0.72),
            comprimento: 70 + Math.random() * 130,
            velocidade: 0.18 + Math.random() * 0.16,
            matiz: indice % 2 ? 190 : 278,
        }));

        return { estrelas, nebulosas, universos, portais, fendas, ecos, fragmentos, cometas };
    }

    function desenharPortalMultiverso(portal, tempo) {
        contexto.save();
        contexto.translate(portal.x, portal.y);
        contexto.scale(1, 0.62);
        contexto.globalCompositeOperation = 'lighter';

        const aura = contexto.createRadialGradient(0, 0, portal.raio * 0.22, 0, 0, portal.raio * 1.22);
        aura.addColorStop(0, 'rgba(3, 1, 12, 0.96)');
        aura.addColorStop(0.42, 'rgba(88, 28, 135, 0.16)');
        aura.addColorStop(0.68, 'rgba(34, 211, 238, 0.1)');
        aura.addColorStop(1, 'rgba(168, 85, 247, 0)');
        contexto.fillStyle = aura;
        contexto.beginPath();
        contexto.arc(0, 0, portal.raio * 1.24, 0, Math.PI * 2);
        contexto.fill();

        for (let i = 0; i < 5; i += 1) {
            const raio = portal.raio * (0.5 + i * 0.13);
            const rotacao = tempo * 0.00016 * portal.sentido * (1 + i * 0.13) + portal.fase;
            contexto.setLineDash([2 + i * 1.3, 5 + i * 1.7]);
            contexto.lineWidth = 0.75 + i * 0.28;
            contexto.strokeStyle = i % 3 === 0
                ? `rgba(251, 113, 133, ${(0.4 - i * 0.025).toFixed(3)})`
                : i % 2 === 0
                    ? `rgba(168, 85, 247, ${(0.46 - i * 0.03).toFixed(3)})`
                    : `rgba(34, 211, 238, ${(0.42 - i * 0.028).toFixed(3)})`;
            contexto.beginPath();
            contexto.arc(0, 0, raio, rotacao, rotacao + Math.PI * (1.18 + i * 0.09));
            contexto.stroke();
        }
        contexto.setLineDash([]);

        for (const particula of portal.particulas) {
            const angulo = particula.angulo + tempo * particula.velocidade;
            const oscilacao = 0.92 + Math.sin(tempo * 0.0014 + particula.fase) * 0.08;
            const distancia = portal.raio * particula.distancia * oscilacao;
            contexto.fillStyle = particula.distancia > 0.72
                ? 'rgba(34, 211, 238, 0.72)'
                : 'rgba(233, 213, 255, 0.62)';
            contexto.beginPath();
            contexto.arc(Math.cos(angulo) * distancia, Math.sin(angulo) * distancia, particula.raio, 0, Math.PI * 2);
            contexto.fill();
        }

        contexto.lineWidth = 1;
        for (let espiral = 0; espiral < 1; espiral += 1) {
            contexto.strokeStyle = espiral === 1 ? 'rgba(34, 211, 238, 0.22)' : 'rgba(168, 85, 247, 0.22)';
            contexto.beginPath();
            for (let ponto = 0; ponto <= 30; ponto += 1) {
                const progresso = ponto / 30;
                const angulo = progresso * Math.PI * 4.5 * portal.sentido + tempo * 0.0003 + espiral * 2.1;
                const raio = portal.raio * (0.06 + progresso * 0.46);
                const x = Math.cos(angulo) * raio;
                const y = Math.sin(angulo) * raio;
                if (ponto === 0) contexto.moveTo(x, y);
                else contexto.lineTo(x, y);
            }
            contexto.stroke();
        }

        const nucleo = contexto.createRadialGradient(0, 0, 0, 0, 0, portal.raio * 0.55);
        nucleo.addColorStop(0, 'rgba(0, 0, 4, 0.98)');
        nucleo.addColorStop(0.46, 'rgba(2, 1, 10, 0.92)');
        nucleo.addColorStop(0.72, 'rgba(88, 28, 135, 0.3)');
        nucleo.addColorStop(1, 'rgba(34, 211, 238, 0)');
        contexto.fillStyle = nucleo;
        contexto.beginPath();
        contexto.arc(0, 0, portal.raio * 0.58, 0, Math.PI * 2);
        contexto.fill();
        contexto.restore();
    }

    function desenharMultiverso(tempo) {
        const { largura, altura } = medirViewport();
        const { estrelas, nebulosas, universos, portais, fendas, ecos, fragmentos, cometas } = estado;

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const nebulosa of nebulosas) {
            nebulosa.rotacao += nebulosa.velocidade;
            const respiracao = 0.94 + Math.sin(tempo * 0.00024 + nebulosa.fase) * 0.08;
            contexto.save();
            contexto.translate(nebulosa.x, nebulosa.y);
            contexto.rotate(nebulosa.rotacao);
            contexto.scale(1, nebulosa.raioY / nebulosa.raioX);
            const gradiente = contexto.createRadialGradient(0, 0, 0, 0, 0, nebulosa.raioX * respiracao);
            gradiente.addColorStop(0, `hsla(${nebulosa.matiz}, 92%, 62%, 0.09)`);
            gradiente.addColorStop(0.36, `hsla(${(nebulosa.matiz + 38) % 360}, 88%, 55%, 0.055)`);
            gradiente.addColorStop(0.72, `hsla(${nebulosa.matiz}, 90%, 48%, 0.018)`);
            gradiente.addColorStop(1, `hsla(${nebulosa.matiz}, 90%, 45%, 0)`);
            contexto.fillStyle = gradiente;
            contexto.beginPath();
            contexto.arc(0, 0, nebulosa.raioX * respiracao, 0, Math.PI * 2);
            contexto.fill();
            contexto.restore();
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const estrela of estrelas) {
            const cintilo = 0.2 + Math.abs(Math.sin(tempo * estrela.velocidade + estrela.fase)) * 0.62;
            estrela.y -= 0.012 * estrela.camada;
            if (estrela.y < -2) estrela.y = altura + 2;
            contexto.fillStyle = estrela.camada > 0.62
                ? `rgba(233, 213, 255, ${(cintilo * estrela.camada).toFixed(3)})`
                : `rgba(34, 211, 238, ${(cintilo * 0.52).toFixed(3)})`;
            contexto.beginPath();
            contexto.arc(estrela.x, estrela.y, estrela.raio * estrela.camada, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const fragmento of fragmentos) {
            fragmento.x += fragmento.derivaX;
            fragmento.y += fragmento.derivaY;
            fragmento.angulo += fragmento.rotacao;
            if (fragmento.y < -20) {
                fragmento.y = altura + 20;
                fragmento.x = Math.random() * largura;
            }
            const brilho = 0.08 + Math.abs(Math.sin(tempo * 0.0008 + fragmento.fase)) * 0.18;
            contexto.save();
            contexto.translate(fragmento.x, fragmento.y);
            contexto.rotate(fragmento.angulo);
            contexto.fillStyle = `hsla(${fragmento.matiz}, 100%, 72%, ${(brilho * 0.34).toFixed(3)})`;
            contexto.strokeStyle = `hsla(${fragmento.matiz}, 100%, 78%, ${brilho.toFixed(3)})`;
            contexto.lineWidth = 0.7;
            contexto.beginPath();
            contexto.moveTo(0, -fragmento.tamanho);
            contexto.lineTo(fragmento.tamanho * 0.56, fragmento.tamanho * 0.42);
            contexto.lineTo(-fragmento.tamanho * 0.38, fragmento.tamanho * 0.72);
            contexto.closePath();
            contexto.fill();
            contexto.stroke();
            contexto.restore();
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (let i = 0; i < universos.length; i += 1) {
            const universo = universos[i];
            universo.x += universo.derivaX;
            universo.y += universo.derivaY;
            if (universo.x < -50) universo.x = largura + 50;
            if (universo.x > largura + 50) universo.x = -50;
            if (universo.y < -50) universo.y = altura + 50;
            if (universo.y > altura + 50) universo.y = -50;
            const pulso = 0.9 + Math.sin(tempo * 0.001 + universo.fase) * 0.1;
            const raio = universo.raio * pulso;
            const brilho = contexto.createRadialGradient(universo.x, universo.y, 0, universo.x, universo.y, raio);
            brilho.addColorStop(0, `hsla(${universo.matiz}, 95%, 72%, 0.28)`);
            brilho.addColorStop(0.46, `hsla(${universo.matiz}, 90%, 56%, 0.1)`);
            brilho.addColorStop(1, `hsla(${universo.matiz}, 90%, 55%, 0)`);
            contexto.fillStyle = brilho;
            contexto.beginPath();
            contexto.arc(universo.x, universo.y, raio, 0, Math.PI * 2);
            contexto.fill();
            contexto.strokeStyle = `hsla(${universo.matiz}, 100%, 76%, 0.38)`;
            contexto.lineWidth = 1;
            contexto.beginPath();
            contexto.arc(universo.x, universo.y, raio * 0.72, 0, Math.PI * 2);
            contexto.stroke();
            for (let s = 0; s < universo.satelites; s += 1) {
                const angulo = tempo * universo.velocidade * (s + 1) + universo.fase + s * 2.1;
                const distancia = raio * (0.92 + s * 0.18);
                contexto.fillStyle = s % 2 ? 'rgba(34, 211, 238, 0.62)' : 'rgba(251, 113, 133, 0.58)';
                contexto.beginPath();
                contexto.arc(universo.x + Math.cos(angulo) * distancia, universo.y + Math.sin(angulo) * distancia * 0.58, 1.4, 0, Math.PI * 2);
                contexto.fill();
            }
            if (i < universos.length - 1) {
                const proximo = universos[i + 1];
                contexto.strokeStyle = `rgba(168, 85, 247, ${(0.025 + Math.abs(Math.sin(tempo * 0.0005 + i)) * 0.05).toFixed(3)})`;
                contexto.beginPath();
                contexto.moveTo(universo.x, universo.y);
                contexto.lineTo(proximo.x, proximo.y);
                contexto.stroke();
            }
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const cometa of cometas) {
            const progresso = ((tempo - cometa.atraso) % cometa.ciclo + cometa.ciclo) % cometa.ciclo;
            const janela = Math.min(1, progresso / 3200);
            if (janela >= 1) continue;
            const x = largura * 1.12 - janela * (largura * 1.35);
            const y = cometa.y + janela * altura * 0.18;
            const gradiente = contexto.createLinearGradient(x, y, x + cometa.comprimento, y - cometa.comprimento * 0.28);
            gradiente.addColorStop(0, `hsla(${cometa.matiz}, 100%, 82%, ${0.72 * (1 - janela)})`);
            gradiente.addColorStop(1, `hsla(${cometa.matiz}, 100%, 58%, 0)`);
            contexto.strokeStyle = gradiente;
            contexto.lineWidth = 1.2;
            contexto.beginPath();
            contexto.moveTo(x, y);
            contexto.lineTo(x + cometa.comprimento, y - cometa.comprimento * 0.28);
            contexto.stroke();
            contexto.fillStyle = `hsla(${cometa.matiz}, 100%, 90%, ${0.8 * (1 - janela)})`;
            contexto.beginPath();
            contexto.arc(x, y, 1.6, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        for (const portal of portais) desenharPortalMultiverso(portal, tempo);

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const fenda of fendas) {
            const pulso = 0.5 + Math.sin(tempo * 0.0014 + fenda.fase) * 0.28;
            contexto.save();
            contexto.translate(fenda.x, fenda.y);
            contexto.rotate(fenda.angulo);
            contexto.strokeStyle = `hsla(${fenda.matiz}, 100%, 70%, ${(0.16 * pulso).toFixed(3)})`;
            contexto.lineWidth = 1.2;
            contexto.beginPath();
            contexto.moveTo(-fenda.comprimento / 2, 0);
            for (let p = 0; p <= 12; p += 1) {
                const x = -fenda.comprimento / 2 + (p / 12) * fenda.comprimento;
                const y = Math.sin(p * 2.7 + tempo * 0.002 + fenda.fase) * (4 + pulso * 5);
                contexto.lineTo(x, y);
            }
            contexto.stroke();
            contexto.restore();
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const eco of ecos) {
            const alfa = 0.025 + Math.abs(Math.sin(tempo * eco.velocidade + eco.fase)) * 0.055;
            contexto.strokeStyle = `rgba(233, 213, 255, ${alfa.toFixed(3)})`;
            contexto.setLineDash([6, 7]);
            contexto.strokeRect(eco.x, eco.y, eco.largura, eco.altura);
            contexto.fillStyle = `rgba(34, 211, 238, ${(alfa * 0.65).toFixed(3)})`;
            contexto.fillRect(eco.x + 8, eco.y + 8, eco.largura * 0.42, 1);
            contexto.fillRect(eco.x + 8, eco.y + 13, eco.largura * 0.25, 1);
        }
        contexto.setLineDash([]);
        contexto.restore();
    }

    // --- Tema especial "Tempo Nexo": relógio de bronze funcional com engrenagens e pêndulo ---
    function criarEstadoTempo() {
        const { largura, altura } = medirViewport();
        const centroX = largura * 0.5;
        const centroY = altura * 0.42;
        const raioRelogio = Math.min(largura, altura) * 0.24;

        const engrenagens = [
            { offsetX: -raioRelogio * 1.55, offsetY: raioRelogio * 0.85, raio: raioRelogio * 0.32, dentes: 10, velocidade: 0.00035, fase: 0 },
            { offsetX: raioRelogio * 1.5, offsetY: raioRelogio * 1.05, raio: raioRelogio * 0.22, dentes: 8, velocidade: -0.0005, fase: 1.2 },
            { offsetX: raioRelogio * 1.75, offsetY: raioRelogio * 0.15, raio: raioRelogio * 0.16, dentes: 6, velocidade: 0.00075, fase: 2.4 },
        ];

        const particulas = Array.from({ length: 70 }, () => ({
            x: Math.random() * largura,
            y: Math.random() * altura,
            raio: 0.4 + Math.random() * 1,
            fase: Math.random() * Math.PI * 2,
            velocidadeCintilo: 0.0006 + Math.random() * 0.0012,
            velocidadeDeriva: 0.05 + Math.random() * 0.1,
            deriva: Math.random() * Math.PI * 2,
        }));

        const numerais = ['XII', 'III', 'VI', 'IX', 'I', 'V', 'X', 'II'].map((texto) => ({
            texto,
            x: Math.random() * largura,
            y: Math.random() * altura,
            fase: Math.random() * Math.PI * 2,
            velocidadeCintilo: 0.0003 + Math.random() * 0.0004,
            velocidadeDeriva: 0.02 + Math.random() * 0.03,
            deriva: Math.random() * Math.PI * 2,
        }));

        const ampulheta = {
            x: largura * 0.1 + Math.min(largura, altura) * 0.06,
            y: altura * 0.82,
            altura: Math.min(largura, altura) * 0.16,
            graos: Array.from({ length: 26 }, () => ({
                progresso: Math.random(),
                deriva: (Math.random() - 0.5) * 0.6,
            })),
        };

        const orbitas = [
            { escala: 1.18, velocidade: 0.00008, arco: Math.PI * 0.72, fase: 0.4 },
            { escala: 1.38, velocidade: -0.000055, arco: Math.PI * 0.48, fase: 2.1 },
            { escala: 1.62, velocidade: 0.000035, arco: Math.PI * 0.32, fase: 4.2 },
        ];

        return {
            centroX, centroY, raioRelogio, engrenagens, particulas, numerais, ampulheta, orbitas,
            ultimoMinuto: -1,
            pulsosMinuto: [],
            distorcao: { restante: 0, progresso: 0, ondas: [] },
            proximaDistorcao: 260 + Math.random() * 260,
        };
    }

    function desenharEngrenagem(cx, cy, raio, dentes, rotacao) {
        contexto.save();
        contexto.translate(cx, cy);
        contexto.rotate(rotacao);
        contexto.beginPath();
        const raioInterno = raio * 0.72;
        const raioDente = raio * 1.16;
        for (let i = 0; i < dentes * 2; i += 1) {
            const angulo = ((Math.PI * 2) / (dentes * 2)) * i;
            const r = i % 2 === 0 ? raioDente : raioInterno;
            const x = Math.cos(angulo) * r;
            const y = Math.sin(angulo) * r;
            if (i === 0) contexto.moveTo(x, y);
            else contexto.lineTo(x, y);
        }
        contexto.closePath();
        contexto.fill();
        contexto.stroke();

        contexto.beginPath();
        contexto.arc(0, 0, raio * 0.22, 0, Math.PI * 2);
        contexto.fillStyle = 'rgba(6, 4, 2, 0.6)';
        contexto.fill();
        contexto.restore();
    }

    function desenharTempo(tempo) {
        const { largura, altura } = medirViewport();
        const { centroX, centroY, raioRelogio, engrenagens, particulas, numerais, ampulheta, orbitas } = estado;

        // "Distorção temporal": periodicamente o tempo tropeça em si mesmo — as
        // engrenagens desaceleram e chegam a girar ao contrário por um instante,
        // enquanto ondas de choque em tom de ferrugem se espalham do centro.
        estado.proximaDistorcao -= 1;
        if (estado.proximaDistorcao <= 0 && estado.distorcao.restante <= 0) {
            estado.distorcao = {
                restante: 70,
                duracao: 70,
                ondas: [],
                bandaY: Math.random() * altura,
                bandaAltura: 14 + Math.random() * 26,
            };
            estado.proximaDistorcao = 500 + Math.random() * 600;
        }
        const distorcaoAtiva = estado.distorcao.restante > 0;
        let intensidadeDistorcao = 0;
        if (distorcaoAtiva) {
            const progresso = 1 - estado.distorcao.restante / estado.distorcao.duracao;
            intensidadeDistorcao = progresso < 0.2 ? progresso / 0.2 : Math.max(0, 1 - (progresso - 0.2) / 0.8);
            if (Math.random() < 0.15) {
                estado.distorcao.ondas.push({ raio: raioRelogio * 0.15, alfa: 0.55 });
            }
            estado.distorcao.restante -= 1;
        }

        contexto.save();
        for (const particula of particulas) {
            particula.deriva += 0.002 * particula.velocidadeDeriva;
            particula.x += Math.sin(particula.deriva) * 0.15;
            particula.y -= 0.05;
            if (particula.y < -4) particula.y = altura + 4;
            contexto.globalAlpha = 0.15 + Math.abs(Math.sin(tempo * particula.velocidadeCintilo + particula.fase)) * 0.3;
            contexto.fillStyle = '#f4cf82';
            contexto.beginPath();
            contexto.arc(particula.x, particula.y, particula.raio, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        // Numerais romanos à deriva, como páginas soltas de um caderno de anotações do tempo.
        contexto.save();
        contexto.font = '600 15px "Cinzel", "Playfair Display", Georgia, serif';
        contexto.textAlign = 'center';
        contexto.textBaseline = 'middle';
        for (const numeral of numerais) {
            numeral.deriva += 0.0015 * numeral.velocidadeDeriva;
            numeral.y -= 0.025;
            numeral.x += Math.sin(numeral.deriva) * 0.08;
            if (numeral.y < -12) {
                numeral.y = altura + 12;
                numeral.x = Math.random() * largura;
            }
            contexto.globalAlpha = 0.08 + Math.abs(Math.sin(tempo * numeral.velocidadeCintilo + numeral.fase)) * 0.14;
            contexto.fillStyle = '#e6d5b8';
            contexto.fillText(numeral.texto, numeral.x, numeral.y);
        }
        contexto.restore();

        // Ampulheta com areia caindo continuamente, um segundo relógio em miniatura.
        contexto.save();
        const meiaLargura = ampulheta.altura * 0.42;
        contexto.strokeStyle = 'rgba(244, 207, 130, 0.55)';
        contexto.lineWidth = 1.6;
        contexto.beginPath();
        contexto.moveTo(ampulheta.x - meiaLargura, ampulheta.y - ampulheta.altura / 2);
        contexto.lineTo(ampulheta.x + meiaLargura, ampulheta.y - ampulheta.altura / 2);
        contexto.lineTo(ampulheta.x, ampulheta.y);
        contexto.lineTo(ampulheta.x - meiaLargura, ampulheta.y + ampulheta.altura / 2);
        contexto.lineTo(ampulheta.x + meiaLargura, ampulheta.y + ampulheta.altura / 2);
        contexto.lineTo(ampulheta.x, ampulheta.y);
        contexto.stroke();

        contexto.fillStyle = 'rgba(217, 164, 65, 0.75)';
        for (const grao of ampulheta.graos) {
            grao.progresso += 0.0032;
            if (grao.progresso > 1) grao.progresso = 0;
            const noBulboSuperior = grao.progresso < 0.5;
            const t = noBulboSuperior ? grao.progresso * 2 : (grao.progresso - 0.5) * 2;
            let x;
            let y;
            if (noBulboSuperior) {
                const largo = meiaLargura * (1 - t) * 0.85;
                x = ampulheta.x + grao.deriva * largo;
                y = ampulheta.y - ampulheta.altura / 2 + t * (ampulheta.altura / 2);
            } else {
                const largo = meiaLargura * t * 0.85;
                x = ampulheta.x + grao.deriva * largo;
                y = ampulheta.y + t * (ampulheta.altura / 2);
            }
            contexto.beginPath();
            contexto.arc(x, y, 1, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        contexto.fillStyle = 'rgba(217, 164, 65, 0.18)';
        contexto.strokeStyle = 'rgba(244, 207, 130, 0.4)';
        contexto.lineWidth = 1.2;
        const fatorGiro = distorcaoAtiva ? 1 - intensidadeDistorcao * 2.6 : 1;
        for (const engrenagem of engrenagens) {
            const rotacao = tempo * engrenagem.velocidade * fatorGiro + engrenagem.fase;
            desenharEngrenagem(
                centroX + engrenagem.offsetX, centroY + engrenagem.offsetY,
                engrenagem.raio, engrenagem.dentes, rotacao,
            );
        }
        contexto.restore();

        // Aros em profundidades diferentes representam linhas do tempo
        // concorrentes tentando se sincronizar com o relógio central.
        contexto.save();
        contexto.translate(centroX, centroY);
        contexto.scale(1, 0.76);
        contexto.globalCompositeOperation = 'lighter';
        for (let i = 0; i < orbitas.length; i += 1) {
            const orbita = orbitas[i];
            const raio = raioRelogio * orbita.escala;
            const inicio = tempo * orbita.velocidade + orbita.fase;
            const alfa = 0.14 - i * 0.025;

            contexto.setLineDash([3 + i * 2, 8 + i * 3]);
            contexto.lineWidth = 0.8 + i * 0.25;
            contexto.strokeStyle = `rgba(244, 207, 130, ${alfa.toFixed(3)})`;
            contexto.beginPath();
            contexto.arc(0, 0, raio, 0, Math.PI * 2);
            contexto.stroke();

            contexto.setLineDash([]);
            contexto.lineWidth = 1.4;
            contexto.strokeStyle = `rgba(217, 164, 65, ${(0.34 - i * 0.05).toFixed(3)})`;
            contexto.beginPath();
            contexto.arc(0, 0, raio, inicio, inicio + orbita.arco);
            contexto.stroke();

            const cursorX = Math.cos(inicio + orbita.arco) * raio;
            const cursorY = Math.sin(inicio + orbita.arco) * raio;
            contexto.fillStyle = `rgba(244, 207, 130, ${(0.72 - i * 0.12).toFixed(3)})`;
            contexto.beginPath();
            contexto.arc(cursorX, cursorY, 2.4 - i * 0.35, 0, Math.PI * 2);
            contexto.fill();
        }
        contexto.restore();

        // Pêndulo balançando abaixo do relógio.
        const pivoY = centroY + raioRelogio * 1.05;
        const anguloPendulo = Math.sin(tempo * 0.0018) * 0.32;
        const comprimentoHaste = raioRelogio * 1.15;
        const pontaX = centroX + Math.sin(anguloPendulo) * comprimentoHaste;
        const pontaY = pivoY + Math.cos(anguloPendulo) * comprimentoHaste;
        contexto.save();
        contexto.strokeStyle = 'rgba(244, 207, 130, 0.55)';
        contexto.lineWidth = 2;
        contexto.beginPath();
        contexto.moveTo(centroX, pivoY);
        contexto.lineTo(pontaX, pontaY);
        contexto.stroke();
        contexto.fillStyle = 'rgba(217, 164, 65, 0.85)';
        contexto.beginPath();
        contexto.arc(pontaX, pontaY, raioRelogio * 0.12, 0, Math.PI * 2);
        contexto.fill();
        contexto.restore();

        // Face do relógio, com ponteiros marcando a hora real do sistema.
        contexto.save();
        const vidro = contexto.createRadialGradient(
            centroX - raioRelogio * 0.25,
            centroY - raioRelogio * 0.3,
            0,
            centroX,
            centroY,
            raioRelogio,
        );
        vidro.addColorStop(0, 'rgba(244, 207, 130, 0.055)');
        vidro.addColorStop(0.58, 'rgba(217, 164, 65, 0.018)');
        vidro.addColorStop(1, 'rgba(6, 4, 2, 0.14)');
        contexto.fillStyle = vidro;
        contexto.beginPath();
        contexto.arc(centroX, centroY, raioRelogio, 0, Math.PI * 2);
        contexto.fill();

        contexto.strokeStyle = 'rgba(244, 207, 130, 0.7)';
        contexto.lineWidth = 3;
        contexto.beginPath();
        contexto.arc(centroX, centroY, raioRelogio, 0, Math.PI * 2);
        contexto.stroke();

        for (let i = 0; i < 60; i += 1) {
            const angulo = (Math.PI * 2 * i) / 60 - Math.PI / 2;
            const principal = i % 5 === 0;
            contexto.lineWidth = principal ? 2.2 : 0.75;
            contexto.strokeStyle = principal
                ? 'rgba(244, 207, 130, 0.72)'
                : 'rgba(217, 164, 65, 0.3)';
            const x1 = centroX + Math.cos(angulo) * raioRelogio * (principal ? 0.85 : 0.9);
            const y1 = centroY + Math.sin(angulo) * raioRelogio * (principal ? 0.85 : 0.9);
            const x2 = centroX + Math.cos(angulo) * raioRelogio * 0.96;
            const y2 = centroY + Math.sin(angulo) * raioRelogio * 0.96;
            contexto.beginPath();
            contexto.moveTo(x1, y1);
            contexto.lineTo(x2, y2);
            contexto.stroke();
        }

        const agora = new Date();
        const horas = agora.getHours() % 12;
        const minutos = agora.getMinutes();
        const segundos = agora.getSeconds();
        const ms = agora.getMilliseconds();

        const anguloHora = ((horas + minutos / 60) / 12) * Math.PI * 2 - Math.PI / 2;
        const anguloMinuto = ((minutos + segundos / 60) / 60) * Math.PI * 2 - Math.PI / 2;
        const anguloSegundo = ((segundos + ms / 1000) / 60) * Math.PI * 2 - Math.PI / 2;

        function desenharPonteiro(angulo, comprimento, largura, cor) {
            contexto.strokeStyle = cor;
            contexto.lineWidth = largura;
            contexto.lineCap = 'round';
            contexto.beginPath();
            contexto.moveTo(centroX, centroY);
            contexto.lineTo(centroX + Math.cos(angulo) * comprimento, centroY + Math.sin(angulo) * comprimento);
            contexto.stroke();
        }

        desenharPonteiro(anguloHora, raioRelogio * 0.52, 4.5, 'rgba(244, 207, 130, 0.95)');
        desenharPonteiro(anguloMinuto, raioRelogio * 0.74, 3, 'rgba(244, 207, 130, 0.95)');
        desenharPonteiro(anguloSegundo, raioRelogio * 0.8, 1.3, 'rgba(193, 84, 60, 0.9)');

        if (distorcaoAtiva) {
            // Ecos dos ponteiros "atrasados", como se o tempo gaguejasse.
            const desvio = intensidadeDistorcao * 0.5;
            contexto.globalCompositeOperation = 'lighter';
            desenharPonteiro(anguloHora + desvio, raioRelogio * 0.52, 4.5, `rgba(217, 164, 65, ${(0.35 * intensidadeDistorcao).toFixed(3)})`);
            desenharPonteiro(anguloMinuto - desvio * 1.3, raioRelogio * 0.74, 3, `rgba(217, 164, 65, ${(0.3 * intensidadeDistorcao).toFixed(3)})`);
            desenharPonteiro(anguloSegundo + desvio * 2, raioRelogio * 0.8, 1.3, `rgba(193, 84, 60, ${(0.4 * intensidadeDistorcao).toFixed(3)})`);
            contexto.globalCompositeOperation = 'source-over';
        }

        contexto.fillStyle = 'rgba(244, 207, 130, 0.95)';
        contexto.beginPath();
        contexto.arc(centroX, centroY, 4, 0, Math.PI * 2);
        contexto.fill();
        contexto.restore();

        // Ondas de choque da distorção temporal, irradiando do centro do relógio.
        if (estado.distorcao.ondas.length) {
            contexto.save();
            contexto.globalCompositeOperation = 'lighter';
            for (let i = estado.distorcao.ondas.length - 1; i >= 0; i -= 1) {
                const onda = estado.distorcao.ondas[i];
                onda.raio += 5;
                onda.alfa -= 0.02;
                if (onda.alfa <= 0) {
                    estado.distorcao.ondas.splice(i, 1);
                    continue;
                }
                contexto.strokeStyle = `rgba(193, 84, 60, ${onda.alfa.toFixed(3)})`;
                contexto.lineWidth = 2;
                contexto.beginPath();
                const passos = 40;
                for (let p = 0; p <= passos; p += 1) {
                    const angulo = (p / passos) * Math.PI * 2;
                    const jitter = Math.sin(angulo * 6 + onda.raio * 0.05) * onda.raio * 0.05;
                    const r = onda.raio + jitter;
                    const x = centroX + Math.cos(angulo) * r;
                    const y = centroY + Math.sin(angulo) * r * 0.9;
                    if (p === 0) contexto.moveTo(x, y);
                    else contexto.lineTo(x, y);
                }
                contexto.stroke();
            }
            contexto.restore();
        }

        // Uma fatia da tela "desalinha" no pico da distorção, como um soluço no tempo.
        if (distorcaoAtiva && intensidadeDistorcao > 0.5) {
            const { bandaY, bandaAltura } = estado.distorcao;
            contexto.save();
            contexto.globalCompositeOperation = 'lighter';
            contexto.globalAlpha = 0.16 * intensidadeDistorcao;
            contexto.fillStyle = 'rgba(193, 84, 60, 1)';
            contexto.fillRect(-4, bandaY, largura, bandaAltura);
            contexto.fillStyle = 'rgba(244, 207, 130, 1)';
            contexto.fillRect(4, bandaY, largura, bandaAltura);
            contexto.restore();
        }

        // A cada virada de minuto real, um pulso de "badalada" se expande do centro.
        if (estado.ultimoMinuto === -1) {
            estado.ultimoMinuto = minutos;
        } else if (minutos !== estado.ultimoMinuto) {
            estado.ultimoMinuto = minutos;
            estado.pulsosMinuto.push({ raio: raioRelogio * 0.2, alfa: 0.7 });
        }

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (let i = estado.pulsosMinuto.length - 1; i >= 0; i -= 1) {
            const pulso = estado.pulsosMinuto[i];
            pulso.raio += 2.4;
            pulso.alfa -= 0.008;
            if (pulso.alfa <= 0) {
                estado.pulsosMinuto.splice(i, 1);
                continue;
            }
            contexto.strokeStyle = `rgba(244, 207, 130, ${pulso.alfa.toFixed(3)})`;
            contexto.lineWidth = 1.6;
            contexto.beginPath();
            contexto.arc(centroX, centroY, pulso.raio, 0, Math.PI * 2);
            contexto.stroke();
        }
        contexto.restore();
    }

    const EFEITOS = Object.freeze({
        singularidade: { criarEstado: criarEstadoBuracoNegro, desenhar: desenharBuracoNegro },
        artico: { criarEstado: criarEstadoArtico, desenhar: desenharArtico },
        galaxia: { criarEstado: criarEstadoGalaxia, desenhar: desenharGalaxia },
        aurora: { criarEstado: criarEstadoBoreal, desenhar: desenharBoreal },
        vulcanico: { criarEstado: criarEstadoVulcanico, desenhar: desenharVulcanico },
        sakura: { criarEstado: criarEstadoSakura, desenhar: desenharSakura },
        tempestade: { criarEstado: criarEstadoTempestade, desenhar: desenharTempestade },
        dimensao: { criarEstado: criarEstadoDimensao, desenhar: desenharDimensao },
        pulsar: { criarEstado: criarEstadoPulsar, desenhar: desenharPulsar },
        supernova: { criarEstado: criarEstadoSupernova, desenhar: desenharSupernova },
        oceano: { criarEstado: criarEstadoOceano, desenhar: desenharOceano },
        noir: { criarEstado: criarEstadoNoir, desenhar: desenharNoir },
        titanio: { criarEstado: criarEstadoTitanio, desenhar: desenharTitanio },
        cyberpunk: { criarEstado: criarEstadoCyberpunk, desenhar: desenharCyberpunk },
        tempo: { criarEstado: criarEstadoTempo, desenhar: desenharTempo },
        virus: { criarEstado: criarEstadoVirus, desenhar: desenharVirus },
        multiverso: { criarEstado: criarEstadoMultiverso, desenhar: desenharMultiverso },
    });

    function limparCanvas() {
        if (!contexto || !canvas) return;
        contexto.save();
        contexto.setTransform(1, 0, 0, 1, 0, 0);
        contexto.clearRect(0, 0, canvas.width, canvas.height);
        contexto.restore();
    }

    function loop(tempo) {
        if (!temaAtivo) return;

        // O movimento dos especiais é deliberadamente cinematográfico. O limite
        // de FPS evita competir com formulários, downloads e organização.
        const orcamentoEspecial = ORCAMENTO_TEMAS_ESPECIAIS[temaAtivo];
        const intervaloMinimo = orcamentoEspecial
            ? 1000 / obterFpsTemaEspecial(temaAtivo)
            : 0;
        const tempoDesdeUltimoQuadro = tempo - ultimoTempoDesenhado;
        if (document.hidden || tempoDesdeUltimoQuadro < intervaloMinimo) {
            frameId = window.requestAnimationFrame(loop);
            return;
        }
        ultimoTempoDesenhado = intervaloMinimo
            ? tempo - (tempoDesdeUltimoQuadro % intervaloMinimo)
            : tempo;

        limparCanvas();
        EFEITOS[temaAtivo].desenhar(tempo);
        frameId = window.requestAnimationFrame(loop);
    }

    function pararEfeito() {
        if (frameId !== null) {
            window.cancelAnimationFrame(frameId);
            frameId = null;
        }
        temaAtivo = null;
        estado = null;
        ultimoTempoDesenhado = 0;
        limparCanvas();
        if (canvas) canvas.dataset.ativo = 'false';
    }

    function iniciarEfeito(paleta) {
        if (!canvas || !contexto) return;
        if (!TEMAS_COM_EFEITO.includes(paleta)) {
            pararEfeito();
            return;
        }
        if (temaAtivo === paleta) return;

        pararEfeito();
        temaAtivo = paleta;
        ajustarTamanhoCanvas();
        estado = EFEITOS[paleta].criarEstado();
        canvas.dataset.ativo = 'true';
        frameId = window.requestAnimationFrame(loop);
    }

    function aplicarParaPaletaAtual() {
        const paleta = document.documentElement.dataset.palette;
        iniciarEfeito(paleta);
    }

    function tratarRedimensionamento() {
        if (!temaAtivo) return;
        ajustarTamanhoCanvas();
        estado = EFEITOS[temaAtivo].criarEstado();
    }

    function inicializar() {
        canvas = document.getElementById('temaVfxCanvas');
        if (!canvas) return;
        contexto = canvas.getContext('2d', { alpha: true, desynchronized: true });

        window.addEventListener('garimpu:paleta-alterada', (evento) => {
            iniciarEfeito(evento.detail?.paleta);
        });
        window.addEventListener('garimpu:fps-temas-especiais-alterado', () => {
            ultimoTempoDesenhado = 0;
        });
        window.addEventListener('resize', tratarRedimensionamento);

        aplicarParaPaletaAtual();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar, { once: true });
    } else {
        inicializar();
    }
})();
