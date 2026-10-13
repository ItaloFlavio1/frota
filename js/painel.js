// Painel com gráficos (Chart.js, carregado só quando a tela é aberta).
import { D } from './state.js';
import * as S from './state.js';
import { esc, moedaC, num, rotuloCaminhao } from './ui.js';
import { iconeAjuda } from './help.js';
import { nomeCategoria } from './forms.js';
import {
  anosComDados, serieMensal, indicadores, despesasPorCategoria, resumoCaminhao, mediaReal,
  hojeISO,
} from './calc.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const CHART_JS = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

const scripts = {};
export function carregarScript(url) {
  scripts[url] ??= new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = url; s.onload = ok;
    s.onerror = () => { delete scripts[url]; falha(new Error('Sem internet para carregar os gráficos.')); };
    document.head.appendChild(s);
  });
  return scripts[url];
}

const porLitro = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const pct = v => v == null ? '—' : (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const compacto = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
function idsSelecionados(filtro) {
  return filtro.caminhao ? [filtro.caminhao] : D.caminhoes.map(c => c.id);
}

function tile(rotulo, ajuda, valor, sub = '') {
  return `<div class="tile"><dt>${rotulo} ${ajuda ? iconeAjuda(ajuda) : ''}</dt><dd>${valor}</dd>${sub ? `<small>${sub}</small>` : ''}</div>`;
}

function tabela(cabecalho, linhas) {
  return `<details class="tabela-dados"><summary>Ver tabela</summary><div class="rolagem"><table>
    <thead><tr>${cabecalho.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map(l => `<tr>${l.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;
}

function cartaoGrafico(id, titulo, subtitulo, tabelaHtml, altura = 260) {
  return `<section class="cartao grafico-cartao">
    <h2>${titulo}</h2>${subtitulo ? `<p class="sub">${subtitulo}</p>` : ''}
    <div class="grafico" style="height:${altura}px"><canvas id="${id}" role="img" aria-label="${esc(titulo)}"></canvas></div>
    ${tabelaHtml}
  </section>`;
}

let dados = null;

export function telaPainel(filtro) {
  if (!D.caminhoes.length) return '<h1>Painel</h1><p class="vazio">Cadastre um caminhão e faça lançamentos para ver os gráficos.</p>';
  const anos = anosComDados(D);
  const ano = Number(filtro.ano) || Number(hojeISO().slice(0, 4));
  const ids = idsSelecionados(filtro);
  const ini = `${ano}-01-01`, fim = `${ano}-12-31`;
  const ind = indicadores(D, ids, ini, fim);
  const mensal = serieMensal(D, ids, ano);
  const categorias = despesasPorCategoria(D, ids, ini, fim);
  const anual = anos.map(a => ({ ano: a, ...indicadores(D, ids, `${a}-01-01`, `${a}-12-31`) }));
  const caminhoes = D.caminhoes.filter(c => ids.includes(c.id));
  const porCaminhao = caminhoes.map(c => ({ c, r: resumoCaminhao(D, c.id, ini, fim) }));
  const consumo = caminhoes.map(c => ({
    c, real: mediaReal(D.abastecimentos.filter(a => a.caminhao_id === c.id && a.data >= ini && a.data <= fim)),
  }));
  dados = { ano, mensal, categorias, anual, porCaminhao, consumo };

  const opsCam = D.caminhoes.map(c => `<option value="${c.id}" ${filtro.caminhao === c.id ? 'selected' : ''}>${esc(rotuloCaminhao(c))}</option>`).join('');
  const linhasMes = mensal.map(m => [MESES[m.mes - 1], moedaC(m.faturadoC), moedaC(m.despesasC), moedaC(m.resultadoC)]);

  return `<div class="titulo"><h1>Painel</h1>
      <div class="acoes nao-imprimir">
        <button class="btn sec" data-acao="baixar-excel">Baixar Excel</button>
        <button class="btn sec" data-acao="imprimir">Imprimir / PDF</button>
      </div></div>
    <div class="filtros" role="search">
      <label>Caminhão <select data-filtro="caminhao"><option value="">Toda a frota</option>${opsCam}</select></label>
      <label>Ano <select data-filtro="ano">${anos.map(a => `<option ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
    </div>
    <p class="periodo">${filtro.caminhao ? esc(rotuloCaminhao(S.caminhao(filtro.caminhao))) : 'Toda a frota'} · ano de ${ano}</p>

    <dl class="tiles">
      ${tile('Faturamento', 'faturado', moedaC(ind.faturadoC))}
      ${tile('Despesas', 'despesas', moedaC(ind.despesasC))}
      ${tile('Resultado', 'resultado_caminhao', `<span class="${ind.resultadoC < 0 ? 'neg' : ''}">${moedaC(ind.resultadoC)}</span>`, `margem ${pct(ind.margem)} ${iconeAjuda('margem')}`)}
      ${tile('Km rodados', 'km_rodados', num(ind.km) + ' km', ind.custoKmC != null ? `custo ${moedaC(ind.custoKmC)}/km ${iconeAjuda('custo_km_periodo')}` : 'custo por km indisponível')}
      ${tile('Diesel', 'abastecimento', moedaC(ind.diesel.totalC), `${num(ind.diesel.litros)} litros`)}
      ${tile('Preço médio do diesel', 'preco_medio_diesel', ind.diesel.precoMedio != null ? porLitro(ind.diesel.precoMedio) + '/l' : '—')}
    </dl>

    <div class="grade-graficos">
      ${cartaoGrafico('g-mensal', 'Faturamento × despesas por mês', `Despesas pela data do gasto; faturamento pela data do frete.`,
        tabela(['Mês', 'Faturamento', 'Despesas', 'Resultado'], linhasMes))}
      ${cartaoGrafico('g-resultado', 'Resultado por mês', 'Faturamento − despesas. Azul: positivo; vermelho: negativo.',
        tabela(['Mês', 'Resultado'], mensal.map(m => [MESES[m.mes - 1], moedaC(m.resultadoC)])))}
      ${cartaoGrafico('g-categorias', 'Para onde vai o dinheiro', `Despesas de ${ano} por categoria.`,
        tabela(['Categoria', 'Valor', '% do total'], categorias.map(x => [nomeCategoria(x.categoria), moedaC(x.c), pct(ind.despesasC ? x.c / ind.despesasC : null)])),
        Math.max(160, categorias.length * 40 + 40))}
      ${cartaoGrafico('g-diesel', 'Diesel abastecido por mês', 'Litros abastecidos.',
        tabela(['Mês', 'Litros', 'Total pago', 'R$/litro'], mensal.map(m => [MESES[m.mes - 1], num(m.diesel.litros), moedaC(m.diesel.totalC), m.diesel.precoMedio != null ? porLitro(m.diesel.precoMedio) : '—'])))}
      ${cartaoGrafico('g-preco', 'Preço médio do diesel por mês', 'R$ por litro (total pago ÷ litros).',
        '')}
      ${cartaoGrafico('g-km', 'Km rodados por mês', 'Distância das viagens com km inicial e final, pela data de saída.',
        tabela(['Mês', 'Km', 'Custo por km'], mensal.map(m => [MESES[m.mes - 1], num(m.km), m.custoKmC != null ? moedaC(m.custoKmC) : '—'])))}
      ${cartaoGrafico('g-consumo', 'Consumo por caminhão (km/l)', `Média real entre tanques completos em ${ano}; a estimada aparece na tabela.`,
        tabela(['Caminhão', 'Média real', 'Média estimada'], consumo.map(x => [esc(rotuloCaminhao(x.c)), x.real ? num(x.real.geral, 2) + ' km/l' : 'dados insuficientes', x.c.media_kml ? num(x.c.media_kml, 2) + ' km/l' : '—'])),
        Math.max(140, consumo.length * 44 + 40))}
      ${cartaoGrafico('g-caminhoes', 'Resultado por caminhão', `Ano de ${ano}.`,
        tabela(['Caminhão', 'Faturamento', 'Despesas', 'Resultado'], porCaminhao.map(x => [esc(rotuloCaminhao(x.c)), moedaC(x.r.faturadoC), moedaC(x.r.despesasC), moedaC(x.r.resultadoC)])),
        Math.max(140, porCaminhao.length * 44 + 40))}
      ${cartaoGrafico('g-anual', 'Comparativo anual', 'Faturamento e despesas de cada ano.',
        tabela(['Ano', 'Faturamento', 'Despesas', 'Resultado', 'Km'], anual.map(a => [a.ano, moedaC(a.faturadoC), moedaC(a.despesasC), moedaC(a.resultadoC), num(a.km)])))}
    </div>`;
}

// ---------------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------------
let graficos = [];

function cores() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  return { receita: v('--serie-receita'), despesa: v('--serie-despesa'), texto: v('--texto'),
    suave: v('--suave'), grade: v('--borda'), superficie: v('--superficie') };
}

function opcoes(c, { legenda = false, horizontal = false, moeda = true, sufixo = '' } = {}) {
  const fmt = v => moeda ? moedaC(Math.round(v * 100)) : num(v, 2) + sufixo;
  const eixoValor = {
    grid: { color: c.grade }, border: { display: false },
    ticks: { color: c.suave, callback: v => moeda ? compacto(v) : num(v, 2) + sufixo },
  };
  const eixoCategoria = { grid: { display: false }, border: { color: c.grade }, ticks: { color: c.suave } };
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
    plugins: {
      legend: { display: legenda, position: 'top', align: 'start',
        labels: { color: c.texto, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10 } },
      tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(horizontal ? ctx.parsed.x : ctx.parsed.y)}` } },
    },
    scales: horizontal ? { x: eixoValor, y: eixoCategoria } : { x: eixoCategoria, y: eixoValor },
  };
}

const barra = { maxBarThickness: 24, borderRadius: 4, borderSkipped: 'start', borderWidth: 0 };

export async function montarGraficos() {
  graficos.forEach(g => g.destroy());
  graficos = [];
  if (!dados || !document.getElementById('g-mensal')) return;
  try {
    await carregarScript(CHART_JS);
  } catch (e) {
    document.querySelectorAll('.grafico').forEach(el => { el.innerHTML = `<p class="vazio">${e.message} Os números estão em "Ver tabela".</p>`; });
    return;
  }
  const c = cores();
  const Chart = window.Chart;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const novo = (id, cfg) => { const el = document.getElementById(id); if (el) graficos.push(new Chart(el, cfg)); };
  const { mensal, categorias, anual, porCaminhao, consumo } = dados;
  const reais = cents => cents / 100;

  novo('g-mensal', { type: 'bar', data: { labels: MESES, datasets: [
    { label: 'Faturamento', data: mensal.map(m => reais(m.faturadoC)), backgroundColor: c.receita, ...barra },
    { label: 'Despesas', data: mensal.map(m => reais(m.despesasC)), backgroundColor: c.despesa, ...barra },
  ] }, options: { ...opcoes(c, { legenda: true }), datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.9 } } } });

  novo('g-resultado', { type: 'bar', data: { labels: MESES, datasets: [
    { label: 'Resultado', data: mensal.map(m => reais(m.resultadoC)),
      backgroundColor: mensal.map(m => m.resultadoC < 0 ? c.despesa : c.receita), ...barra },
  ] }, options: opcoes(c) });

  novo('g-categorias', { type: 'bar', data: { labels: categorias.map(x => nomeCategoria(x.categoria)), datasets: [
    { label: 'Despesas', data: categorias.map(x => reais(x.c)), backgroundColor: c.despesa, ...barra },
  ] }, options: opcoes(c, { horizontal: true }) });

  novo('g-diesel', { type: 'bar', data: { labels: MESES, datasets: [
    { label: 'Litros', data: mensal.map(m => m.diesel.litros), backgroundColor: c.receita, ...barra },
  ] }, options: opcoes(c, { moeda: false, sufixo: ' l' }) });

  novo('g-preco', { type: 'line', data: { labels: MESES, datasets: [
    { label: 'R$/litro', data: mensal.map(m => m.diesel.precoMedio), borderColor: c.receita, backgroundColor: c.receita,
      borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: c.superficie, pointBorderWidth: 2, spanGaps: false },
  ] }, options: (() => { const o = opcoes(c, { moeda: false });
    o.plugins.tooltip.callbacks.label = ctx => ` ${porLitro(ctx.parsed.y)} por litro`;
    o.scales.y.ticks.callback = v => 'R$ ' + num(v, 2); return o; })() });

  novo('g-km', { type: 'bar', data: { labels: MESES, datasets: [
    { label: 'Km', data: mensal.map(m => m.km), backgroundColor: c.receita, ...barra },
  ] }, options: opcoes(c, { moeda: false, sufixo: ' km' }) });

  novo('g-consumo', { type: 'bar', data: { labels: consumo.map(x => x.c.placa), datasets: [
    { label: 'Média real', data: consumo.map(x => x.real ? Number(x.real.geral.toFixed(2)) : null), backgroundColor: c.receita, ...barra },
  ] }, options: opcoes(c, { horizontal: true, moeda: false, sufixo: ' km/l' }) });

  novo('g-caminhoes', { type: 'bar', data: { labels: porCaminhao.map(x => x.c.placa), datasets: [
    { label: 'Resultado', data: porCaminhao.map(x => reais(x.r.resultadoC)),
      backgroundColor: porCaminhao.map(x => x.r.resultadoC < 0 ? c.despesa : c.receita), ...barra },
  ] }, options: opcoes(c, { horizontal: true }) });

  novo('g-anual', { type: 'bar', data: { labels: anual.map(a => String(a.ano)), datasets: [
    { label: 'Faturamento', data: anual.map(a => reais(a.faturadoC)), backgroundColor: c.receita, ...barra },
    { label: 'Despesas', data: anual.map(a => reais(a.despesasC)), backgroundColor: c.despesa, ...barra },
  ] }, options: { ...opcoes(c, { legenda: true }), datasets: { bar: { categoryPercentage: 0.6, barPercentage: 0.9 } } } });
}

