(() => {
    'use strict';

    const TEMAS_COM_EFEITO = Object.freeze(['singularidade', 'artico', 'galaxia', 'aurora', 'vulcanico', 'sakura']);

    let canvas = null;
    let contexto = null;
    let frameId = null;
    let temaAtivo = null;
    let estado = null;
    let prefereMenosMovimento = false;

    function medirViewport() {
        return {
            largura: window.innerWidth,
            altura: window.innerHeight,
        };
    }

    function ajustarTamanhoCanvas() {
        if (!canvas || !contexto) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const { largura, altura } = medirViewport();
        canvas.width = largura * dpr;
        canvas.height = altura * dpr;
        contexto.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // --- Tema "Buraco Negro" (singularidade): disco de acreção orbitando um horizonte de eventos ---
    function criarEstadoBuracoNegro() {
        const { largura, altura } = medirViewport();
        const centroX = largura / 2;
        const centroY = altura * 0.42;
        const raioHorizonte = Math.min(largura, altura) * 0.09;
        const raioMaximo = Math.min(largura, altura) * 0.5;

        const particulas = [];
        for (let i = 0; i < 220; i += 1) {
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
        return { centroX, centroY, raioHorizonte, raioMaximo, particulas };
    }

    function corParticulaBuracoNegro(raio, raioHorizonte, raioMaximo) {
        const proximidade = 1 - Math.min(1, Math.max(0, (raio - raioHorizonte) / (raioMaximo - raioHorizonte)));
        const g = Math.round(150 + proximidade * 90);
        const b = Math.round(60 + (1 - proximidade) * 120);
        return `rgba(255, ${g}, ${b}, ${0.25 + proximidade * 0.45})`;
    }

    function desenharBuracoNegro(tempo) {
        const { centroX, centroY, raioHorizonte, raioMaximo, particulas } = estado;

        contexto.save();
        contexto.globalCompositeOperation = 'lighter';
        for (const p of particulas) {
            p.angulo += p.velocidade;
            const oscilacao = Math.sin(tempo * 0.0005 + p.fase) * p.raioBase * 0.02;
            const raio = p.raioBase + oscilacao;
            const x = centroX + Math.cos(p.angulo) * raio;
            const y = centroY + Math.sin(p.angulo) * raio * p.achatamento;

            contexto.beginPath();
            contexto.fillStyle = corParticulaBuracoNegro(raio, raioHorizonte, raioMaximo);
            contexto.arc(x, y, p.espessura, 0, Math.PI * 2);
            contexto.fill();
        }
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

    const EFEITOS = Object.freeze({
        singularidade: { criarEstado: criarEstadoBuracoNegro, desenhar: desenharBuracoNegro },
        artico: { criarEstado: criarEstadoArtico, desenhar: desenharArtico },
        galaxia: { criarEstado: criarEstadoGalaxia, desenhar: desenharGalaxia },
        aurora: { criarEstado: criarEstadoBoreal, desenhar: desenharBoreal },
        vulcanico: { criarEstado: criarEstadoVulcanico, desenhar: desenharVulcanico },
        sakura: { criarEstado: criarEstadoSakura, desenhar: desenharSakura },
    });

    function limparCanvas() {
        if (!contexto || !canvas) return;
        contexto.clearRect(0, 0, canvas.width, canvas.height);
    }

    function loop(tempo) {
        if (!temaAtivo) return;
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
        limparCanvas();
        if (canvas) canvas.dataset.ativo = 'false';
    }

    function iniciarEfeito(paleta) {
        if (!canvas || !contexto || prefereMenosMovimento) return;
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
        contexto = canvas.getContext('2d');

        const consultaMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');
        prefereMenosMovimento = consultaMovimento.matches;
        consultaMovimento.addEventListener('change', (evento) => {
            prefereMenosMovimento = evento.matches;
            if (prefereMenosMovimento) {
                pararEfeito();
            } else {
                aplicarParaPaletaAtual();
            }
        });

        window.addEventListener('garimpu:paleta-alterada', (evento) => {
            iniciarEfeito(evento.detail?.paleta);
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
