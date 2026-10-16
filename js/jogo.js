// O jogo não lê nem altera os dados financeiros da frota.
const FAIXAS = [80, 144, 208];
const Y_CAMINHAO = 326;
const CHAVE_RECORDE = 'frota-jogo-renan-recorde';
const CHAVE_NOME = 'frota-jogo-renan-nome';
const CORES = ['#f3d653', '#d44337', '#e9dfc3', '#5d9ed0', '#73ac72'];

export function normalizarNome(nome) {
  return typeof nome === 'string' ? nome.trim().replace(/\s+/g, ' ').slice(0, 24) : '';
}

// Guarda as dez melhores viagens; empates mantêm a ordem de chegada.
export function ordenarRanking(registros) {
  if (!Array.isArray(registros)) return [];
  return registros.filter(r => r && normalizarNome(r.nome) && Number.isSafeInteger(r.pontos) && r.pontos >= 0)
    .map(r => ({ nome: normalizarNome(r.nome), pontos: r.pontos }))
    .sort((a, b) => b.pontos - a.pontos).slice(0, 10);
}

export function criarPartida() {
  return { estado: 'pronto', faixa: 1, x: FAIXAS[1], tempo: 0, distancia: 0,
    pontos: 0, ultrapassados: 0, velocidade: 180, proximoCarro: 0.8, carros: [] };
}

export function moverCaminhao(jogo, direcao) {
  if (jogo.estado !== 'jogando') return;
  jogo.faixa = Math.max(0, Math.min(2, jogo.faixa + Math.sign(direcao)));
}

export function atualizarPartida(jogo, segundos, aleatorio = Math.random) {
  if (jogo.estado !== 'jogando') return;
  // Limita saltos quando o navegador demora a entregar um quadro.
  const dt = Math.max(0, Math.min(segundos, 0.05));
  jogo.tempo += dt;
  jogo.velocidade = Math.min(600, 180 + jogo.tempo * 8);
  jogo.distancia += jogo.velocidade * dt;
  jogo.x += (FAIXAS[jogo.faixa] - jogo.x) * Math.min(1, dt * 16);
  jogo.proximoCarro -= dt;
  if (jogo.proximoCarro <= 0) {
    const modelo = Math.floor(aleatorio() * 4);
    jogo.carros.push({ x: FAIXAS[Math.floor(aleatorio() * 3)], y: -80,
      largura: modelo >= 2 ? 28 : 24, altura: modelo === 3 ? 64 : modelo === 2 ? 46 : 36,
      modelo, cor: CORES[Math.floor(aleatorio() * CORES.length)] });
    // Uma fila por vez, sempre com espaço para mudar de faixa.
    jogo.proximoCarro = Math.max(0.5, 1 - jogo.tempo * 0.012);
  }
  for (const carro of jogo.carros) {
    carro.y += jogo.velocidade * dt;
    if (Math.abs(carro.x - jogo.x) < (carro.largura + 28) / 2 - 4
      && carro.y + carro.altura - 3 > Y_CAMINHAO + 3 && carro.y + 3 < Y_CAMINHAO + 55) {
      jogo.estado = 'fim';
      break;
    }
  }
  if (jogo.estado === 'jogando') {
    jogo.ultrapassados += jogo.carros.filter(c => c.y > 416).length;
    jogo.carros = jogo.carros.filter(c => c.y <= 416);
  }
  jogo.pontos = Math.floor(jogo.distancia / 10) + jogo.ultrapassados * 25;
}

export function telaJogo() {
  return `<section class="jogo-renan" aria-labelledby="titulo-jogo">
    <div class="titulo"><div><p class="jogo-chamada">ARCADE DA CABRAL · PIXEL ART</p>
      <h1 id="titulo-jogo">Jogo do Renan</h1></div><span class="jogo-selo">BRASIL NA ESTRADA</span></div>
    <p class="jogo-intro">Segura o volante! Desvie dos carros e das carroças e leve o bruto o mais longe possível.</p>
    <div class="jogo-arcade">
      <div class="jogo-jogador"><label for="jogo-nome">Nome do jogador</label>
        <input id="jogo-nome" data-nome maxlength="24" required autocomplete="nickname" placeholder="Como você se chama?" aria-describedby="jogo-nome-ajuda">
        <small id="jogo-nome-ajuda">Digite seu nome antes de iniciar. Ele aparecerá no ranking.</small></div>
      <dl class="jogo-placar"><div><dt>Pontos</dt><dd data-pontos>0</dd></div>
        <div><dt>Recorde</dt><dd data-recorde>0</dd></div><div><dt>Velocidade</dt><dd data-ritmo>1,0×</dd></div></dl>
      <div class="jogo-pista">
        <canvas width="288" height="416" tabindex="0" aria-label="Estrada em pixel art com três faixas. Controle o caminhão pelas setas ou pelos botões abaixo.">Seu navegador precisa oferecer suporte a canvas para jogar.</canvas>
        <div class="jogo-overlay" data-overlay>
          <div><p class="jogo-chamada">BORA PEGAR ESTRADA?</p><h2 data-titulo-pausa>O bruto é seu.</h2>
            <p data-mensagem>Desvie dos carros e das carroças. Cada ultrapassagem vale 25 pontos extras.</p>
            <button class="btn" data-jogar>Pegar a estrada</button></div>
        </div>
      </div>
      <div class="jogo-controles" aria-label="Controles do jogo">
        <button class="btn sec" data-direcao="-1" aria-label="Mover caminhão para a esquerda">◀ Esquerda</button>
        <button class="btn sec" data-pausar disabled>Pausar</button>
        <button class="btn sec" data-direcao="1" aria-label="Mover caminhão para a direita">Direita ▶</button>
      </div>
      <p class="jogo-ajuda">← → ou A / D para mudar de faixa · Espaço para iniciar ou pausar.<br>No celular, toque nos botões.</p>
      <p class="jogo-status" data-status role="status" aria-live="polite"></p>
      <section class="jogo-ranking" aria-labelledby="titulo-ranking">
        <h2 id="titulo-ranking">Ranking da estrada</h2>
        <p>As 10 melhores viagens de todos os jogadores.</p>
        <ol data-ranking></ol><p data-ranking-vazio>O pódio está livre. Termine uma partida para entrar!</p>
        <small data-ranking-aviso>Carregando ranking…</small>
      </section>
    </div>
  </section>`;
}

function desenhar(ctx, jogo) {
  const r = (x, y, w, h, cor) => { ctx.fillStyle = cor; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const texto = (t, x, y, cor = '#fff', tamanho = 7) => {
    ctx.fillStyle = cor; ctx.font = `bold ${tamanho}px monospace`; ctx.fillText(t, x, Math.round(y));
  };
  const deslocamento = jogo.distancia;
  ctx.imageSmoothingEnabled = false;
  r(0, 0, 288, 416, '#67994b');
  // Grama, terra e acostamento.
  for (let i = -1; i < 10; i++) {
    const y = (i * 58 + deslocamento * 0.85) % 522 - 58;
    r(4, y, 25, 3, '#78aa54'); r(265, y + 22, 18, 3, '#507f40');
    r(26, y + 34, 3, 4, '#c6ca6e');
  }
  r(39, 0, 210, 416, '#c09d6b'); r(46, 0, 196, 416, '#343b41');
  r(50, 0, 3, 416, '#f4eac9'); r(235, 0, 3, 416, '#f4eac9');
  for (let y = (deslocamento % 48) - 48; y < 416; y += 48) {
    r(111, y, 2, 24, '#ead66a'); r(175, y, 2, 24, '#ead66a');
    r(43, y, 3, 12, '#fff3cc'); r(242, y, 3, 12, '#fff3cc');
  }
  // Coqueiros, casinhas e placa BR: cenário passando pela estrada.
  for (let i = 0; i < 3; i++) {
    const y = ((i * 170 + deslocamento * 0.75) % 510) - 65;
    r(15, y + 12, 4, 28, '#806045'); r(11, y + 6, 13, 8, '#254f38');
    r(4, y + 10, 10, 4, '#254f38'); r(23, y + 11, 10, 4, '#254f38');
    r(8, y, 6, 7, '#326b40'); r(22, y + 1, 6, 7, '#326b40');
    r(253, y + 68, 29, 25, i % 2 ? '#eab75e' : '#82c9bd');
    r(250, y + 64, 35, 6, '#a64e37'); r(254, y + 60, 27, 4, '#c76340');
    r(258, y + 75, 7, 7, '#31515c'); r(272, y + 78, 6, 15, '#705c43');
  }
  const placaY = ((deslocamento * 0.75 + 90) % 700) - 90;
  r(15, placaY + 29, 3, 24, '#dbd1b2'); r(2, placaY, 35, 30, '#e7e2c5');
  r(4, placaY + 2, 31, 26, '#21694e'); texto('BR', 12, placaY + 12); texto('101', 9, placaY + 23);
  const postoY = ((deslocamento * 0.75 + 390) % 700) - 90;
  // Posto Ipiranga em miniatura: cobertura amarela, faixa azul e bombas.
  r(249, postoY + 15, 38, 55, '#bab7a0');
  r(250, postoY, 37, 17, '#f9d52f'); r(250, postoY + 13, 37, 4, '#1761ae');
  texto('IPIRANGA', 251, postoY + 10, '#1554a0', 6);
  r(252, postoY + 18, 2, 38, '#e9dfbe'); r(283, postoY + 18, 2, 38, '#e9dfbe');
  for (const px of [258, 273]) {
    r(px, postoY + 29, 9, 18, '#f9d52f'); r(px + 1, postoY + 31, 7, 6, '#16465c');
    r(px + 8, postoY + 34, 3, 13, '#203333'); r(px, postoY + 45, 9, 3, '#1761ae');
  }
  r(253, postoY + 57, 30, 9, '#1761ae'); texto('DIESEL', 255, postoY + 64, '#fff2be', 6);

  const carro = c => {
    const x = c.x - c.largura / 2, y = c.y, w = c.largura, h = c.altura;
    if (c.modelo === 3) {
      // Cavalo visto de cima, puxando carroça de madeira com sacos de carga.
      const passo = Math.floor(jogo.distancia / 9) % 2 ? 2 : -2;
      r(x + 9, y + 5, 12, 22, '#533323');
      r(x + 9, y, 3, 6, '#805334'); r(x + 16, y, 3, 6, '#805334');
      r(x + 10, y + 3, 9, 10, '#aa774d'); r(x + 11, y + 4, 2, 5, '#e4cc9b');
      r(x + 7, y + 12 + passo, 4, 10, '#6c442b'); r(x + 19, y + 12 - passo, 4, 10, '#6c442b');
      r(x + 8, y + 23 - passo, 4, 8, '#6c442b'); r(x + 18, y + 23 + passo, 4, 8, '#6c442b');
      r(x + 13, y + 12, 3, 18, '#362b24');
      r(x + 5, y + 22, 2, 18, '#bc9159'); r(x + 22, y + 22, 2, 18, '#bc9159');
      r(x - 2, y + 44, 5, 15, '#282c28'); r(x + 25, y + 44, 5, 15, '#282c28');
      r(x + 1, y + 36, 26, 28, '#80502f'); r(x + 3, y + 39, 22, 22, '#c19458');
      for (let dy = 41; dy < 62; dy += 6) r(x + 3, y + dy, 22, 2, '#9c6c3e');
      r(x + 5, y + 44, 8, 10, '#dace93'); r(x + 15, y + 49, 7, 10, '#b8bb72');
      r(x + 10, y + 35, 8, 5, '#3b7191'); r(x + 11, y + 31, 6, 5, '#e8c394');
      r(x + 8, y + 30, 12, 3, '#e3c374');
      return;
    }
    r(x + 3, y + 4, w, h, '#222a2c');
    r(x - 2, y + 7, 4, 9, '#172328'); r(x + w - 2, y + 7, 4, 9, '#172328');
    r(x - 2, y + h - 13, 4, 9, '#172328'); r(x + w - 2, y + h - 13, 4, 9, '#172328');
    r(x + 2, y, w - 4, h, c.cor); r(x, y + 4, w, h - 8, c.cor);
    if (c.modelo === 0) { // Carrinho arredondado, inspirado nos clássicos brasileiros.
      r(x + 4, y + 7, w - 8, 7, '#224953'); r(x + 5, y + 16, w - 10, 10, '#f5dfaa');
      r(x + 5, y + 27, w - 10, 5, '#224953');
    } else if (c.modelo === 1) { // Hatch quadradinho com bagageiro.
      r(x + 3, y + 6, w - 6, 8, '#224953'); r(x + 3, y + 24, w - 6, 6, '#224953');
      r(x + 6, y + 15, 2, 8, '#e3d7be'); r(x + w - 8, y + 15, 2, 8, '#e3d7be');
    } else { // Perua / kombi bicolor.
      r(x, y + 16, w, h - 21, '#f1e8ce'); r(x + 3, y + 5, w - 6, 9, '#224953');
      r(x + 13, y + 5, 2, 9, '#dfd8bd'); r(x + 4, y + h - 11, w - 8, 6, '#224953');
    }
    r(x + 2, y + 1, 5, 3, '#fff4a9'); r(x + w - 7, y + 1, 5, 3, '#fff4a9');
    r(x + 2, y + h - 3, 4, 3, '#a8272c'); r(x + w - 6, y + h - 3, 4, 3, '#a8272c');
    r(x + 8, y + h - 2, w - 16, 2, '#f8f2dd');
  };
  for (const c of jogo.carros) carro(c);

  // Caminhão do Renan: cabine vermelha, carroceria e faixa verde-amarela.
  const x = Math.round(jogo.x - 14), y = Y_CAMINHAO;
  r(x + 4, y + 4, 29, 58, '#232b30');
  for (const dy of [8, 34, 47]) { r(x - 3, y + dy, 5, 9, '#121b22'); r(x + 26, y + dy, 5, 9, '#121b22'); }
  r(x, y, 28, 22, '#d63939'); r(x + 3, y + 4, 22, 9, '#9ad2db');
  r(x + 4, y + 5, 10, 2, '#e7f1e7'); r(x - 4, y + 8, 4, 4, '#c3c6b4'); r(x + 28, y + 8, 4, 4, '#c3c6b4');
  r(x + 1, y + 1, 5, 3, '#ffed9c'); r(x + 22, y + 1, 5, 3, '#ffed9c');
  r(x + 1, y + 24, 26, 34, '#b9afa1'); r(x + 3, y + 26, 22, 30, '#dfd4bd');
  for (let dy = 28; dy < 54; dy += 6) r(x + 4, y + dy, 20, 1, '#b5ac97');
  r(x + 3, y + 36, 22, 7, '#36805a'); r(x + 10, y + 37, 8, 5, '#f5d44d');
  r(x + 3, y + 56, 5, 3, '#f05449'); r(x + 20, y + 56, 5, 3, '#f05449');
  if (jogo.estado === 'fim') {
    r(x + 8, y - 9, 12, 6, '#f5db4c'); r(x + 11, y - 14, 6, 16, '#f5db4c');
    r(x + 11, y - 7, 6, 6, '#ff8d43');
  }
}

let limpar = null;
export function desmontarJogo() { limpar?.(); limpar = null; }

export function montarJogo(container, armazenamento) {
  desmontarJogo();
  const raiz = container.querySelector('.jogo-renan');
  if (!raiz) return;
  const canvas = raiz.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const overlay = raiz.querySelector('[data-overlay]');
  const titulo = raiz.querySelector('[data-titulo-pausa]');
  const mensagem = raiz.querySelector('[data-mensagem]');
  const jogar = raiz.querySelector('[data-jogar]');
  const pausar = raiz.querySelector('[data-pausar]');
  const pontos = raiz.querySelector('[data-pontos]');
  const ritmo = raiz.querySelector('[data-ritmo]');
  const recordeEl = raiz.querySelector('[data-recorde]');
  const status = raiz.querySelector('[data-status]');
  const nomeInput = raiz.querySelector('[data-nome]');
  const rankingEl = raiz.querySelector('[data-ranking]');
  const rankingVazio = raiz.querySelector('[data-ranking-vazio]');
  const rankingAviso = raiz.querySelector('[data-ranking-aviso]');
  if (!ctx) { mensagem.textContent = 'Este navegador não conseguiu abrir o jogo. Tente outro navegador.'; jogar.disabled = true; return; }
  let jogo = criarPartida(), recorde = 0, raf = 0, anterior = 0;
  let nomeJogador = '', ranking = [];
  let versaoRanking = 0;
  const avisarErroRanking = erro => {
    rankingAviso.textContent = armazenamento?.modo === 'local'
      ? 'Não foi possível salvar o ranking neste navegador.'
      : `Não foi possível sincronizar o ranking compartilhado: ${erro.message}`;
  };
  try { nomeInput.value = normalizarNome(localStorage.getItem(CHAVE_NOME)); } catch { /* nome opcional */ }
  try { const salvo = Number(localStorage.getItem(CHAVE_RECORDE)); if (Number.isFinite(salvo) && salvo > 0) recorde = Math.floor(salvo); } catch { /* armazenamento opcional */ }
  rankingAviso.textContent = armazenamento?.modo === 'local'
    ? 'Ranking salvo só neste navegador; não é compartilhado entre usuários.'
    : 'Ranking compartilhado entre usuários conectados.';
  recordeEl.textContent = String(recorde);
  const exibirRanking = () => {
    rankingEl.replaceChildren();
    rankingVazio.hidden = ranking.length > 0;
    for (const entrada of ranking) {
      const linha = document.createElement('li');
      const nome = document.createElement('span');
      const placar = document.createElement('strong');
      nome.textContent = entrada.nome; placar.textContent = `${entrada.pontos} pts`;
      linha.append(nome, placar); rankingEl.append(linha);
    }
  };
  const carregarRanking = async () => {
    const versao = versaoRanking;
    try {
      const registros = await armazenamento.listarRanking();
      if (versao !== versaoRanking) return;
      ranking = ordenarRanking(registros);
      recorde = Math.max(recorde, ranking[0]?.pontos || 0);
      recordeEl.textContent = String(recorde);
      exibirRanking();
    } catch (erro) {
      avisarErroRanking(erro);
    }
  };
  if (armazenamento?.listarRanking) void carregarRanking();
  else {
    rankingAviso.textContent = 'Ranking indisponível nesta página.';
    exibirRanking();
  }
  const eventos = new AbortController();
  const ouvir = (el, evento, fn) => el.addEventListener(evento, fn, { signal: eventos.signal });
  const exibir = () => {
    pontos.textContent = String(jogo.pontos);
    ritmo.textContent = `${(jogo.velocidade / 180).toFixed(1).replace('.', ',')}×`;
    pausar.disabled = !['jogando', 'pausado'].includes(jogo.estado);
    nomeInput.disabled = ['jogando', 'pausado'].includes(jogo.estado);
    raiz.querySelectorAll('[data-direcao]').forEach(b => { b.disabled = jogo.estado !== 'jogando'; });
    pausar.textContent = jogo.estado === 'pausado' ? 'Retomar' : 'Pausar';
    desenhar(ctx, jogo);
  };
  const quadro = agora => {
    if (jogo.estado !== 'jogando') return;
    if (document.querySelector('dialog[open]')) { pausarPartida(); return; }
    atualizarPartida(jogo, anterior ? (agora - anterior) / 1000 : 0);
    anterior = agora;
    exibir();
    if (jogo.estado === 'fim') {
      ranking = ordenarRanking([...ranking, { nome: nomeJogador, pontos: jogo.pontos }]);
      exibirRanking();
      const versao = ++versaoRanking;
      void armazenamento.registrarPontuacao(nomeJogador, jogo.pontos)
        .then(registros => {
          if (versao !== versaoRanking) return;
          ranking = ordenarRanking(registros);
          exibirRanking();
        })
        .catch(avisarErroRanking);
      const novoRecorde = jogo.pontos > recorde;
      if (novoRecorde) {
        recorde = jogo.pontos; recordeEl.textContent = String(recorde);
        try { localStorage.setItem(CHAVE_RECORDE, String(recorde)); } catch { /* jogo funciona sem armazenamento */ }
      }
      titulo.textContent = novoRecorde ? `Novo recorde, ${nomeJogador}!` : `Fim de viagem, ${nomeJogador}!`;
      mensagem.textContent = `${jogo.pontos} pontos · ${jogo.ultrapassados} ultrapassagens. Bora tentar de novo?`;
      jogar.textContent = 'Jogar de novo'; overlay.hidden = false;
      status.textContent = `${titulo.textContent} ${mensagem.textContent}`;
      jogar.focus({ preventScroll: true });
    } else raf = requestAnimationFrame(quadro);
  };
  const iniciar = () => {
    if (jogo.estado === 'jogando') return;
    if (jogo.estado !== 'pausado') {
      nomeJogador = normalizarNome(nomeInput.value);
      nomeInput.value = nomeJogador;
      if (!nomeJogador) {
        status.textContent = 'Digite seu nome para entrar na estrada e no ranking.';
        nomeInput.setCustomValidity('Digite o nome do jogador.');
        nomeInput.reportValidity(); nomeInput.focus(); return;
      }
      nomeInput.setCustomValidity('');
      try { localStorage.setItem(CHAVE_NOME, nomeJogador); } catch { avisarArmazenamento(); }
    }
    cancelAnimationFrame(raf);
    if (jogo.estado !== 'pausado') jogo = criarPartida();
    jogo.estado = 'jogando'; anterior = 0; overlay.hidden = true;
    status.textContent = `${nomeJogador} na estrada! Desvie dos carros e das carroças.`; exibir();
    canvas.focus({ preventScroll: true });
    raf = requestAnimationFrame(quadro);
  };
  const pausarPartida = () => {
    if (jogo.estado !== 'jogando') return;
    jogo.estado = 'pausado'; cancelAnimationFrame(raf);
    titulo.textContent = 'Uma parada no acostamento.';
    mensagem.textContent = 'Sua viagem está pausada. Retome quando estiver pronto.';
    jogar.textContent = 'Continuar viagem'; overlay.hidden = false;
    status.textContent = 'Jogo pausado.'; exibir();
  };
  ouvir(jogar, 'click', iniciar);
  ouvir(nomeInput, 'input', () => nomeInput.setCustomValidity(''));
  ouvir(nomeInput, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); iniciar(); } });
  ouvir(pausar, 'click', () => jogo.estado === 'pausado' ? iniciar() : pausarPartida());
  raiz.querySelectorAll('[data-direcao]').forEach(b => ouvir(b, 'click', () => moverCaminhao(jogo, Number(b.dataset.direcao))));
  ouvir(window, 'keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')
      || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) {
      e.preventDefault(); moverCaminhao(jogo, ['ArrowLeft', 'a', 'A'].includes(e.key) ? -1 : 1);
    } else if (e.code === 'Space' && !e.target.closest?.('button')) {
      e.preventDefault(); if (e.repeat) return;
      if (jogo.estado === 'jogando') pausarPartida(); else iniciar();
    }
  });
  ouvir(document, 'visibilitychange', () => { if (document.hidden) pausarPartida(); });
  ouvir(window, 'blur', pausarPartida);
  limpar = () => { cancelAnimationFrame(raf); eventos.abort(); };
  exibir();
}
