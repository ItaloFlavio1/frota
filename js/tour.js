// Tutorial guiado: destaca uma parte da tela por vez e explica o que ela faz.
// Aparece automaticamente uma vez para cada usuário (registrado na conta dele).
import { db } from './db.js';

export const VERSAO_TUTORIAL = 1;

// alvo: elemento destacado (o primeiro visível da lista). rota: tela aberta antes do passo.
const PASSOS = [
  { titulo: 'Bem-vindo ao Controle de Frota da Cabral! 🚚',
    texto: 'Este tutorial mostra, em poucos passos, o que cada parte do sistema faz e como cadastrar as coisas. Leva uns 2 minutos. Você pode pular e rever depois em <strong>Dados → Ver tutorial</strong>.' },
  { alvo: ['.menu'], rota: 'resumo', titulo: 'Menu',
    texto: 'Aqui você troca de tela. No celular, o menu fica embaixo; <strong>Mais</strong> guarda Boletos, Caminhões, Clientes, Manutenção e Dados.' },
  { alvo: ['.topo .btn.novo'], rota: 'resumo', titulo: '+ Novo lançamento',
    texto: 'O jeito mais rápido de cadastrar qualquer coisa: escolha o <strong>caminhão</strong> e o <strong>tipo</strong> (viagem/frete, despesa, abastecimento, recebimento, boleto ou manutenção) e preencha. O modelo e a placa aparecem sempre no topo do formulário, para evitar lançar no caminhão errado.' },
  { alvo: ['.grade-cartoes', '#conteudo'], rota: 'resumo', titulo: 'Resumo',
    texto: 'Mostra, para cada caminhão e para a frota toda, quanto <strong>faturou</strong>, <strong>recebeu</strong>, <strong>gastou</strong> e o <strong>resultado</strong> no período escolhido. Os avisos de manutenção, boletos vencendo e recebimentos atrasados aparecem aqui em cima.' },
  { alvo: ['#conteudo .ajuda'], rota: 'resumo', titulo: 'Ícones de ajuda "?"',
    texto: 'Sempre que tiver dúvida sobre um campo ou um número, toque no <strong>?</strong> ao lado dele. Ele explica com um exemplo.' },
  { alvo: ['[data-acao="novo-caminhao"]'], rota: 'caminhoes', titulo: '1º passo: cadastrar os caminhões',
    texto: 'Em <strong>Caminhões → + Caminhão</strong>, informe modelo, placa, o <strong>hodômetro atual</strong> (km do painel) e a <strong>média de consumo</strong> (km por litro). Caminhão vendido ou parado? Use <strong>Desativar</strong>: some dos lançamentos, mas o histórico fica.' },
  { alvo: ['[data-acao="novo-cliente"]'], rota: 'clientes', titulo: 'Clientes',
    texto: 'Cadastre quem contrata os fretes. Assim você vê <strong>quanto cada cliente deve</strong> e quais pagamentos estão <strong>atrasados</strong>.' },
  { alvo: ['[data-acao="nova-viagem"]'], rota: 'viagens', titulo: 'Viagens e fretes',
    texto: 'Em <strong>+ Viagem</strong>: caminhão, datas, origem/destino, <strong>km inicial e final</strong> e o primeiro frete (peso × valor por tonelada, ou valor fechado), com cliente e vencimento. O sistema calcula o <strong>diesel estimado</strong> e o <strong>resultado da viagem</strong>. Dentro da viagem você adiciona mais fretes, despesas da viagem e os <strong>recebimentos</strong> (pode ser parcial).' },
  { alvo: ['.abas', '#conteudo'], rota: 'lancamentos', titulo: 'Lançamentos',
    texto: 'Três abas: <strong>Despesas</strong> (pedágio, alimentação, pneus, comissão…), <strong>Abastecimentos</strong> (litros, preço e hodômetro; marque "tanque completo" para calcular o consumo real) e <strong>Recebimentos</strong> (dinheiro que entrou de cada frete).' },
  { alvo: ['[data-acao="novo-boleto"]'], rota: 'boletos', titulo: 'Boletos a pagar',
    texto: 'Em <strong>+ Boleto</strong>, cole o código do boleto: o vencimento e o valor são preenchidos sozinhos. Para financiamento, informe o nº de parcelas. Quando pagar, use <strong>Marcar como pago</strong>. O sistema avisa o que vence na semana.' },
  { alvo: ['[data-acao="novo-plano"]'], rota: 'manutencoes', titulo: 'Manutenção',
    texto: '<strong>+ Prevista</strong>: serviço (ex.: troca de óleo) com o próximo km e/ou data — o sistema avisa quando estiver perto. Ao fazer o serviço, clique em <strong>Registrar execução</strong>: o custo entra nas despesas e o próximo vencimento é calculado.' },
  { alvo: ['.tiles', '#conteudo'], rota: 'painel', titulo: 'Painel com gráficos',
    texto: 'Acompanhe por <strong>mês e ano</strong>: faturamento × despesas, para onde vai o dinheiro, diesel, km rodados, consumo e resultado por caminhão. Use <strong>Baixar Excel</strong> ou <strong>Imprimir / PDF</strong> para mandar ao contador.' },
  { alvo: ['[data-acao="exportar"]', '#conteudo'], rota: 'dados', titulo: 'Dados e conta',
    texto: 'Baixe uma <strong>cópia de segurança</strong>, troque sua senha e reveja este tutorial quando quiser.' },
  { titulo: 'Pronto! 🎉',
    texto: 'Sugestão para começar: <strong>1)</strong> cadastre os caminhões, <strong>2)</strong> os clientes, <strong>3)</strong> lance a primeira viagem. Qualquer dúvida, toque no <strong>?</strong>. Boa estrada!' },
];

let indice = 0, camada, buraco, cartao, aoTerminar = null;

const visivel = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

export function deveMostrarTutorial(usuario) {
  if (db.modo === 'local') {
    try { return Number(localStorage.getItem('frota-tutorial')) < VERSAO_TUTORIAL; } catch { return false; }
  }
  return Number(usuario?.user_metadata?.tutorial_visto || 0) < VERSAO_TUTORIAL;
}

async function marcarVisto() {
  try {
    if (db.modo === 'local') localStorage.setItem('frota-tutorial', String(VERSAO_TUTORIAL));
    else await db.marcarTutorial(VERSAO_TUTORIAL);
  } catch { /* se falhar, apenas mostra de novo na próxima vez */ }
}

export function iniciarTutorial(fim) {
  if (camada) return;
  aoTerminar = fim;
  indice = 0;
  document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); });
  camada = document.createElement('div');
  camada.className = 'tour';
  camada.innerHTML = `<div class="tour-buraco"></div>
    <div class="tour-cartao" role="dialog" aria-modal="true" aria-labelledby="tour-titulo" tabindex="-1">
      <p class="tour-passo"></p>
      <h2 id="tour-titulo"></h2>
      <div class="tour-texto"></div>
      <div class="tour-botoes">
        <button type="button" class="link" data-tour="pular">Pular tutorial</button>
        <span>
          <button type="button" class="btn sec" data-tour="voltar">Voltar</button>
          <button type="button" class="btn" data-tour="proximo">Próximo</button>
        </span>
      </div>
    </div>`;
  document.body.appendChild(camada);
  buraco = camada.querySelector('.tour-buraco');
  cartao = camada.querySelector('.tour-cartao');
  camada.addEventListener('click', e => {
    const b = e.target.closest('[data-tour]');
    if (!b) return;
    if (b.dataset.tour === 'proximo') indice < PASSOS.length - 1 ? ir(indice + 1) : encerrar();
    if (b.dataset.tour === 'voltar') ir(indice - 1);
    if (b.dataset.tour === 'pular') encerrar();
  });
  document.addEventListener('keydown', teclas, true);
  addEventListener('resize', reposicionar);
  ir(0);
}

function teclas(e) {
  if (!camada) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); encerrar(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); camada.querySelector('[data-tour=proximo]').click(); }
  if (e.key === 'ArrowLeft' && indice > 0) { e.preventDefault(); ir(indice - 1); }
  // Mantém o foco dentro do cartão do tutorial.
  if (e.key === 'Tab') {
    const focaveis = [...cartao.querySelectorAll('button:not([hidden])')];
    const i = focaveis.indexOf(document.activeElement);
    e.preventDefault();
    focaveis[(i + (e.shiftKey ? -1 : 1) + focaveis.length) % focaveis.length].focus();
  }
}

async function ir(n) {
  indice = Math.max(0, Math.min(n, PASSOS.length - 1));
  const p = PASSOS[indice];
  if (p.rota && !location.hash.startsWith('#/' + p.rota)) {
    location.hash = '#/' + p.rota;
    await new Promise(r => setTimeout(r, 350)); // espera a tela desenhar
  }
  cartao.querySelector('.tour-passo').textContent = `Passo ${indice + 1} de ${PASSOS.length}`;
  cartao.querySelector('#tour-titulo').innerHTML = p.titulo;
  cartao.querySelector('.tour-texto').innerHTML = p.texto;
  cartao.querySelector('[data-tour=voltar]').hidden = indice === 0;
  cartao.querySelector('[data-tour=proximo]').textContent =
    indice === 0 ? 'Começar' : indice === PASSOS.length - 1 ? 'Concluir' : 'Próximo';
  reposicionar();
  cartao.focus();
}

function alvoAtual() {
  const p = PASSOS[indice];
  if (!p.alvo) return null;
  for (const sel of p.alvo) {
    const el = [...document.querySelectorAll(sel)].find(visivel);
    if (el) return el;
  }
  return null;
}

function reposicionar() {
  if (!camada) return;
  const el = alvoAtual();
  camada.classList.toggle('sem-alvo', !el);
  if (!el) { buraco.removeAttribute('style'); cartao.removeAttribute('style'); return; }
  el.scrollIntoView({ block: 'nearest' });
  const r = el.getBoundingClientRect();
  const m = 6;
  // Áreas grandes (ex.: a página inteira) são limitadas à tela.
  const top = Math.max(r.top - m, 4), left = Math.max(r.left - m, 4);
  const bottom = Math.min(r.bottom + m, innerHeight - 4), right = Math.min(r.right + m, innerWidth - 4);
  Object.assign(buraco.style, { top: top + 'px', left: left + 'px', width: right - left + 'px', height: bottom - top + 'px' });

  const larg = Math.min(380, innerWidth - 24);
  cartao.style.width = larg + 'px';
  const alt = cartao.offsetHeight;
  let y = bottom + 12;
  if (y + alt > innerHeight - 8) y = top - alt - 12;           // não cabe embaixo: vai para cima
  if (y < 8) y = Math.max(8, innerHeight - alt - 8);             // nem em cima: fixa no rodapé
  const x = Math.max(12, Math.min(left + (right - left) / 2 - larg / 2, innerWidth - larg - 12));
  Object.assign(cartao.style, { top: y + 'px', left: x + 'px' });
}

async function encerrar() {
  document.removeEventListener('keydown', teclas, true);
  removeEventListener('resize', reposicionar);
  camada?.remove();
  camada = null;
  await marcarVisto();
  location.hash = '#/resumo';
  aoTerminar?.();
}
