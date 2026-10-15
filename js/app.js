// Telas, navegação e inicialização.
import { db, chegouPorRecuperacao, erroNoLink } from './db.js';
import { telaPainel, montarGraficos } from './painel.js';
import * as S from './state.js';
import { D } from './state.js';
import * as F from './forms.js';
import { CATEGORIAS, nomeCategoria, nomeStatus, STATUS_VIAGEM } from './forms.js';
import { iniciarAjuda, iconeAjuda } from './help.js';
import { esc, moedaC, moeda, num, dataBR, rotuloCaminhao, confirmar, aviso } from './ui.js';
import {
  centavos, resumoViagem, resumoCaminhao, somarResumos, mediaReal, statusPlano,
  recebidoDoFrete, aReceberDoFrete, hojeISO, caminhaoDoFrete, receberPorCliente, fretesEmAberto,
  boletosEmAberto, formatarLinha, diferencaDias, caminhaoDoRecebimento, clienteDe, chaveCliente,
} from './calc.js';
import { decifrarBackup } from './cripto.js';
import { iniciarTutorial, deveMostrarTutorial } from './tour.js';
import { telaJogo, montarJogo, desmontarJogo } from './jogo.js';

const $conteudo = () => document.getElementById('conteudo');

// ---------------------------------------------------------------------------
// Filtros (compartilhados entre telas; lembrados neste navegador)
// ---------------------------------------------------------------------------
const filtro = (() => {
  try { return { caminhao: '', periodo: 'mes', ini: '', fim: '', status: '', ...JSON.parse(localStorage.getItem('frota-filtro')) }; }
  catch { return { caminhao: '', periodo: 'mes', ini: '', fim: '', status: '' }; }
})();
const guardarFiltro = () => { try { localStorage.setItem('frota-filtro', JSON.stringify(filtro)); } catch { /* ignora */ } };

function intervalo() {
  const hoje = hojeISO();
  const [a, m] = hoje.split('-').map(Number);
  const fimMes = (ano, mes) => new Date(ano, mes, 0).getDate();
  const p2 = n => String(n).padStart(2, '0');
  switch (filtro.periodo) {
    case 'mes': return [`${a}-${p2(m)}-01`, `${a}-${p2(m)}-${fimMes(a, m)}`];
    case 'mes_anterior': {
      const aa = m === 1 ? a - 1 : a, mm = m === 1 ? 12 : m - 1;
      return [`${aa}-${p2(mm)}-01`, `${aa}-${p2(mm)}-${fimMes(aa, mm)}`];
    }
    case 'ano': return [`${a}-01-01`, `${a}-12-31`];
    case 'personalizado': return [filtro.ini || null, filtro.fim || null];
    default: return [null, null];
  }
}

function barraFiltros({ periodo = true, status = false } = {}) {
  const ops = D.caminhoes.map(c => `<option value="${c.id}" ${filtro.caminhao === c.id ? 'selected' : ''}>${esc(rotuloCaminhao(c))}${c.ativo ? '' : ' (desativado)'}</option>`).join('');
  const per = [['mes', 'Este mês'], ['mes_anterior', 'Mês anterior'], ['ano', 'Este ano'], ['tudo', 'Todo o período'], ['personalizado', 'Escolher datas']];
  return `<div class="filtros" role="search">
    <label>Caminhão <select data-filtro="caminhao"><option value="">Toda a frota</option>${ops}</select></label>
    ${periodo ? `<label>Período <select data-filtro="periodo">${per.map(([v, t]) => `<option value="${v}" ${filtro.periodo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${filtro.periodo === 'personalizado' ? `
        <label>De <input type="date" data-filtro="ini" value="${filtro.ini}"></label>
        <label>Até <input type="date" data-filtro="fim" value="${filtro.fim}"></label>` : ''}` : ''}
    ${status ? `<label>Situação <select data-filtro="status"><option value="">Todas</option>${STATUS_VIAGEM.map(([v, t]) => `<option value="${v}" ${filtro.status === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
  </div>`;
}

const doCaminhaoFiltrado = l => !filtro.caminhao || l.caminhao_id === filtro.caminhao;
const noIntervalo = (data, [ini, fim]) => (!ini || (data && data >= ini)) && (!fim || (data && data <= fim));
const vazio = msg => `<p class="vazio">${msg}</p>`;
const placa = id => esc(S.caminhao(id)?.placa || '?');
const rota = x => `${esc(x.origem || '?')} → ${esc(x.destino || '?')}`;
const sinal = c => `<span class="${c < 0 ? 'neg' : ''}">${moedaC(c)}</span>`;
const por = x => S.autor(x) ? ` · por ${esc(S.autor(x))}` : '';
const nomeCliente = x => esc(clienteDe(D, x) || 'Sem cliente');
const FORMA_PAGAMENTO = { pix: 'PIX', debito: 'Cartão de débito', credito_parcelado: 'Cartão de crédito parcelado' };
const detalhePagamento = x => x.forma_pagamento
  ? ` · ${FORMA_PAGAMENTO[x.forma_pagamento] || esc(x.forma_pagamento)}${x.parcelas_cartao ? ` (${x.parcelas_cartao}x)` : ''}`
  : '';

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------
function cartaoNumeros(r) {
  const linha = (rot, aj, valor, destaque = '') =>
    `<div class="${destaque}"><dt>${rot} ${iconeAjuda(aj)}</dt><dd>${valor}</dd></div>`;
  return `<dl class="numeros">
    ${linha('Faturado', 'faturado', moedaC(r.faturadoC))}
    ${linha('Recebido', 'recebido', moedaC(r.recebidoC))}
    ${linha('A receber', 'a_receber', moedaC(r.aReceberC))}
    ${linha('Despesas', 'despesas', moedaC(r.despesasC))}
    ${linha('Pagamentos', 'pagamentos', moedaC(r.pagamentosC))}
    ${linha('Resultado operacional', 'resultado_caminhao', sinal(r.resultadoC), 'forte')}
    ${linha('Saldo de caixa', 'saldo_caixa', sinal(r.caixaC), 'forte')}
  </dl>`;
}

function alertasManutencao(caminhoes) {
  const ids = new Set(caminhoes.map(c => c.id));
  const itens = D.planos_manutencao
    .filter(p => ids.has(p.caminhao_id) && S.caminhao(p.caminhao_id)?.ativo)
    .map(p => ({ p, s: statusPlano(p, S.caminhao(p.caminhao_id)) }))
    .filter(x => x.s.estado === 'atrasada' || x.s.estado === 'proxima')
    .sort((a, b) => (a.s.estado === 'atrasada' ? 0 : 1) - (b.s.estado === 'atrasada' ? 0 : 1));
  if (!itens.length) return '';
  return `<section class="alertas" aria-label="Alertas de manutenção">
    <h2>Manutenção ${iconeAjuda('alerta_manutencao')}</h2>
    <ul>${itens.map(({ p, s }) => `<li class="alerta ${s.estado}">
      <span class="selo ${s.estado}">${s.estado === 'atrasada' ? 'Atrasada' : 'Próxima'}</span>
      <span><strong>${esc(p.servico)}</strong> · ${esc(rotuloCaminhao(S.caminhao(p.caminhao_id)))}<br><small>${esc(s.texto)}</small></span>
      <button class="btn mini" data-acao="executar-plano" data-id="${p.id}">Registrar</button></li>`).join('')}</ul>
  </section>`;
}

function alertasBoletos(caminhoes) {
  const ids = new Set(caminhoes.map(c => c.id));
  const { vencidos, proximos } = boletosEmAberto(D);
  const lista = [...vencidos, ...proximos].filter(x => ids.has(x.caminhao_id));
  if (!lista.length) return '';
  const totalC = lista.reduce((s, x) => s + centavos(x.valor), 0);
  return `<section class="alertas" aria-label="Boletos a pagar">
    <h2>Boletos a pagar ${iconeAjuda('boletos_vencer')} <small>${moedaC(totalC)}</small></h2>
    <ul>${lista.slice(0, 5).map(x => itemBoletoAlerta(x)).join('')}</ul>
    <p><a href="#/boletos">Ver todos os boletos</a></p>
  </section>`;
}

function prazoBoleto(x) {
  const dias = diferencaDias(hojeISO(), x.vencimento);
  if (dias < 0) return { classe: 'atrasada', selo: 'Vencido', texto: `venceu há ${-dias} dia(s)` };
  if (dias === 0) return { classe: 'proxima', selo: 'Vence hoje', texto: 'vence hoje' };
  return { classe: dias <= 7 ? 'proxima' : 'em_dia', selo: dias <= 7 ? 'Vence em breve' : 'A vencer', texto: `vence em ${dias} dia(s)` };
}

const nomeBoleto = x => esc(x.fornecedor || x.descricao || nomeCategoria(x.categoria))
  + (x.total_parcelas > 1 ? ` <small>(${x.parcela}/${x.total_parcelas})</small>` : '');

function itemBoletoAlerta(x) {
  const p = prazoBoleto(x);
  return `<li class="alerta ${p.classe}">
    <span class="selo ${p.classe}">${p.selo}</span>
    <span><strong>${nomeBoleto(x)}</strong> · ${moeda(x.valor)}<br>
      <small>${dataBR(x.vencimento)} · ${p.texto} · <span class="placa">${placa(x.caminhao_id)}</span></small></span>
    <button class="btn mini" data-acao="pagar-boleto" data-id="${x.id}">Pagar</button></li>`;
}

function alertasRecebimento(caminhoes) {
  const ids = new Set(caminhoes.map(c => c.id));
  const atrasados = fretesEmAberto(D).filter(x => x.atrasado && ids.has(caminhaoDoFrete(D, x.f)))
    .sort((a, b) => a.f.vencimento.localeCompare(b.f.vencimento));
  if (!atrasados.length) return '';
  const totalC = atrasados.reduce((s, x) => s + x.faltaC, 0);
  return `<section class="alertas" aria-label="Recebimentos atrasados">
    <h2>Recebimentos atrasados ${iconeAjuda('atrasados')} <small>${moedaC(totalC)}</small></h2>
    <ul>${atrasados.slice(0, 5).map(({ f, faltaC }) => `<li class="alerta atrasada">
      <span class="selo atrasada">Atrasado</span>
      <span><strong>${nomeCliente(f)}</strong> · ${moedaC(faltaC)}<br>
        <small>${rota(f)} · venceu em ${dataBR(f.vencimento)} · <span class="placa">${placa(caminhaoDoFrete(D, f))}</span></small></span>
      <button class="btn mini" data-acao="receber-frete" data-id="${f.id}">Receber</button></li>`).join('')}</ul>
    ${atrasados.length > 5 ? `<p><a href="#/clientes">Ver todos (${atrasados.length})</a></p>` : ''}
  </section>`;
}

function listaAnotacoes() {
  const anotacoes = [...D.anotacoes]
    .sort((a, b) => Number(a.concluida) - Number(b.concluida)
      || (a.data_limite || '9999-12-31').localeCompare(b.data_limite || '9999-12-31')
      || (a.created_at || '').localeCompare(b.created_at || ''));
  if (!anotacoes.length) return '<p class="nota">Nenhuma anotação ainda.</p>';
  return `<ul class="grade-cartoes anotacoes-grade">${anotacoes.map(a => `<li class="cartao anotacao-item ${a.concluida ? 'concluida' : ''}">
    <div><span class="selo ${a.concluida ? 'ok' : ''}">${a.concluida ? 'Concluída' : 'Em aberto'}</span></div>
    <p class="texto-anotacao">${esc(a.texto)}</p>
    <p class="prazo-anotacao">${a.data_limite ? `Prazo: ${dataBR(a.data_limite)}` : 'Sem prazo definido'}</p>
    <div class="acoes">
      <button class="btn mini sec" data-acao="editar-anotacao" data-id="${a.id}">Editar</button>
      <button class="btn mini" data-acao="alternar-anotacao" data-id="${a.id}">${a.concluida ? 'Reabrir' : 'Concluir'}</button>
      <button class="btn mini perigo" data-acao="apagar-anotacao" data-id="${a.id}">Apagar</button>
    </div>
  </li>`).join('')}</ul>`;
}

function painelAnotacoes() {
  return `<section class="painel-anotacoes" aria-label="Anotações gerais">
    <div class="titulo"><h2>Anotações e tarefas</h2><button class="btn mini" data-acao="nova-anotacao">+ Nova anotação</button></div>
    ${listaAnotacoes()}
  </section>`;
}

function telaResumo() {
  const per = intervalo();
  const caminhoes = D.caminhoes.filter(c => filtro.caminhao ? c.id === filtro.caminhao : (c.ativo || S.temHistorico(c.id)));
  if (!D.caminhoes.length) {
    return `<h1>Resumo</h1>${vazio('Nenhum caminhão cadastrado ainda.')}
      <p><button class="btn" data-acao="novo-caminhao">Cadastrar primeiro caminhão</button></p>
      ${painelAnotacoes()}`;
  }
  const resumos = caminhoes.map(c => ({ c, r: resumoCaminhao(D, c.id, per[0], per[1]) }));
  const total = somarResumos(resumos.map(x => x.r));
  const txtPer = per[0] || per[1] ? `${dataBR(per[0]) === '—' ? 'início' : dataBR(per[0])} a ${dataBR(per[1]) === '—' ? 'hoje' : dataBR(per[1])}` : 'todo o período';
  return `<h1>Resumo</h1>
    ${barraFiltros()}
    <p class="periodo">Período: ${txtPer}</p>
    ${alertasManutencao(caminhoes)}
    ${alertasBoletos(caminhoes)}
    ${alertasRecebimento(caminhoes)}
    <div class="grade-cartoes">
      ${resumos.map(({ c, r }) => {
        const mr = mediaReal(D.abastecimentos.filter(a => a.caminhao_id === c.id));
        return `<section class="cartao">
          <header><h2>${esc(c.modelo)}</h2><span class="placa">${esc(c.placa)}</span>${c.ativo ? '' : '<span class="selo">Desativado</span>'}</header>
          ${cartaoNumeros(r)}
          <p class="rodape">Hodômetro ${num(c.hodometro)} km · Média real ${iconeAjuda('media_real')} ${mr ? num(mr.geral, 2) + ' km/l' : 'dados insuficientes'}</p>
        </section>`;
      }).join('')}
      ${resumos.length > 1 ? `<section class="cartao total"><header><h2>Total da frota</h2></header>${cartaoNumeros(total)}
        <p class="rodape">Soma dos ${resumos.length} caminhões acima, com os mesmos filtros.</p></section>` : ''}
    </div>
    ${painelAnotacoes()}`;
}

// ---------------------------------------------------------------------------
// Caminhões
// ---------------------------------------------------------------------------
function itemCaminhao(c) {
  const mr = mediaReal(D.abastecimentos.filter(a => a.caminhao_id === c.id));
  return `<li class="item ${c.ativo ? '' : 'inativo'}">
    <a class="principal" href="#/caminhoes/${c.id}">
      <strong>${esc(c.modelo)}</strong> <span class="placa">${esc(c.placa)}</span> ${c.ativo ? '' : '<span class="selo">Desativado</span>'}
      <small>${c.ano ? c.ano + ' · ' : ''}${num(c.hodometro)} km · média estimada ${c.media_kml ? num(c.media_kml, 2) + ' km/l' : '—'} · média real ${mr ? num(mr.geral, 2) + ' km/l' : 'dados insuficientes'}</small>
    </a>
    <div class="acoes">
      <button class="btn mini sec" data-acao="editar-caminhao" data-id="${c.id}">Editar</button>
      ${c.ativo
        ? `<button class="btn mini perigo" data-acao="inativar-caminhao" data-id="${c.id}">Desativar</button>`
        : `<button class="btn mini sec" data-acao="ativar-caminhao" data-id="${c.id}">Reativar</button>`}
      ${S.temHistorico(c.id) ? '' : `<button class="btn mini perigo" data-acao="apagar-caminhao" data-id="${c.id}">Apagar</button>`}
    </div>
  </li>`;
}

function telaCaminhoes() {
  const ativos = D.caminhoes.filter(c => c.ativo), inativos = D.caminhoes.filter(c => !c.ativo);
  return `<div class="titulo"><h1>Caminhões</h1><button class="btn" data-acao="novo-caminhao">+ Caminhão</button></div>
    ${ativos.length ? `<ul class="lista">${ativos.map(itemCaminhao).join('')}</ul>` : vazio('Nenhum caminhão ativo.')}
    ${inativos.length ? `<h2>Desativados ${iconeAjuda('caminhao_desativado')}</h2><ul class="lista">${inativos.map(itemCaminhao).join('')}</ul>` : ''}`;
}

function telaCaminhao(id) {
  const c = S.caminhao(id);
  if (!c) return vazio('Caminhão não encontrado.');
  const mr = mediaReal(D.abastecimentos.filter(a => a.caminhao_id === id));
  const viagens = S.ordenarPorData(D.viagens.filter(v => v.caminhao_id === id), 'data_inicio').slice(0, 10);
  const despesas = S.ordenarPorData(D.despesas.filter(x => x.caminhao_id === id), 'data_gasto').slice(0, 15);
  const planos = D.planos_manutencao.filter(p => p.caminhao_id === id);
  return `<p><a href="#/caminhoes">← Caminhões</a></p>
    <div class="titulo"><h1>${esc(c.modelo)} <span class="placa">${esc(c.placa)}</span></h1>
      <div class="acoes">
        <button class="btn sec" data-acao="editar-caminhao" data-id="${id}">Editar</button>
        <button class="btn sec" data-acao="corrigir-hodometro" data-id="${id}">Corrigir hodômetro</button>
        <button class="btn ${c.ativo ? 'perigo' : 'sec'}" data-acao="${c.ativo ? 'inativar' : 'ativar'}-caminhao" data-id="${id}">${c.ativo ? 'Desativar' : 'Reativar'}</button>
        ${S.temHistorico(id) ? '' : `<button class="btn perigo" data-acao="apagar-caminhao" data-id="${id}">Apagar</button>`}
      </div></div>
    <dl class="ficha">
      <div><dt>Hodômetro ${iconeAjuda('hodometro')}</dt><dd>${num(c.hodometro)} km</dd></div>
      <div><dt>Média estimada ${iconeAjuda('media_kml')}</dt><dd>${c.media_kml ? num(c.media_kml, 2) + ' km/l' : '—'}</dd></div>
      <div><dt>Média real ${iconeAjuda('media_real')}</dt><dd>${mr ? `${num(mr.geral, 2)} km/l <small>(${num(mr.km)} km / ${num(mr.litros)} l)</small>` : 'dados insuficientes'}</dd></div>
      <div><dt>Ano</dt><dd>${c.ano || '—'}</dd></div>
    </dl>
    <p><button class="btn" data-acao="novo-lancamento" data-id="${id}">+ Novo lançamento</button></p>
    <h2>Manutenções previstas</h2>${listaPlanos(planos)}
    <h2>Últimas viagens</h2>${listaViagens(viagens)}
    <h2>Últimas despesas</h2>${listaDespesas(despesas)}`;
}

// ---------------------------------------------------------------------------
// Viagens
// ---------------------------------------------------------------------------
function listaViagens(viagens) {
  if (!viagens.length) return vazio('Nenhuma viagem.');
  return `<ul class="lista">${viagens.map(v => {
    const r = resumoViagem(D, v);
    return `<li class="item"><a class="principal" href="#/viagens/${v.id}">
      <strong>${rota(v)}</strong> <span class="placa">${placa(v.caminhao_id)}</span>
      <small>${dataBR(v.data_inicio)} · ${nomeStatus(v.status)} · ${r.fretes.length} frete(s)${r.distancia !== null ? ' · ' + num(r.distancia) + ' km' : ''}${por(v)}</small></a>
      <div class="valor"><span>${moedaC(r.fretesC)}</span><small>${r.completo ? 'resultado ' + moedaC(r.resultadoC) : 'diesel não calculado'}</small></div>
    </li>`;
  }).join('')}</ul>`;
}

function telaViagens() {
  const per = intervalo();
  const lista = S.ordenarPorData(D.viagens.filter(v => doCaminhaoFiltrado(v) && (!filtro.status || v.status === filtro.status)
    && noIntervalo(v.data_inicio, per)), 'data_inicio');
  return `<div class="titulo"><h1>Viagens</h1><button class="btn" data-acao="nova-viagem">+ Viagem</button></div>
    ${barraFiltros({ status: true })}${listaViagens(lista)}`;
}

function telaViagem(id) {
  const v = S.viagem(id);
  if (!v) return vazio('Viagem não encontrada.');
  const c = S.caminhao(v.caminhao_id);
  const r = resumoViagem(D, v);
  const extra = r.completo
    ? `Distância: ${num(v.km_final)} − ${num(v.km_inicial)} = <b>${num(r.distancia)} km</b><br>
       Diesel: ${num(r.distancia)} km ÷ ${num(v.media_kml_ref, 2)} km/l = ${num(r.litros)} l × R$ ${num(v.preco_diesel_ref, 3)} = <b>${moedaC(r.dieselC)}</b><br>
       Despesas vinculadas: <b>${moedaC(r.despesasC)}</b><br>
       Resultado: ${moedaC(r.fretesC)} − ${moedaC(r.dieselC)} − ${moedaC(r.despesasC)} = <b>${moedaC(r.resultadoC)}</b>`
    : `Faltam dados para estimar o diesel: ${r.faltando.join(', ')}.`;
  return `<p><a href="#/viagens">← Viagens</a></p>
    <div class="titulo"><h1>${rota(v)}</h1>
      <div class="acoes">
        <button class="btn sec" data-acao="editar-viagem" data-id="${id}">Editar</button>
        <button class="btn perigo" data-acao="apagar-viagem" data-id="${id}">Apagar</button>
      </div></div>
    <div class="faixa-caminhao">🚚 <strong>${esc(c?.modelo)}</strong> · placa <strong>${esc(c?.placa)}</strong></div>
    <dl class="ficha">
      <div><dt>Situação</dt><dd>${nomeStatus(v.status)}</dd></div>
      <div><dt>Saída / chegada</dt><dd>${dataBR(v.data_inicio)} / ${dataBR(v.data_fim)}</dd></div>
      <div><dt>Km inicial / final ${iconeAjuda('km_viagem')}</dt><dd>${num(v.km_inicial)} / ${num(v.km_final)}</dd></div>
      <div><dt>Distância</dt><dd>${r.distancia !== null ? num(r.distancia) + ' km' : '—'}</dd></div>
    </dl>
    ${v.observacao ? `<p class="nota">${esc(v.observacao)}</p>` : ''}

    <section class="cartao resultado">
      <h2>Resultado estimado ${iconeAjuda('resultado_viagem', extra)}</h2>
      <dl class="numeros">
        <div><dt>Fretes ${iconeAjuda('frete_bruto')}</dt><dd>${moedaC(r.fretesC)}</dd></div>
        <div><dt>Diesel estimado ${iconeAjuda('diesel_estimado', extra)}</dt><dd>${r.completo ? '− ' + moedaC(r.dieselC) : '<span class="pendente">Diesel ainda não calculado</span>'}</dd></div>
        <div><dt>Despesas vinculadas ${iconeAjuda('despesa_viagem')}</dt><dd>− ${moedaC(r.despesasC)}</dd></div>
        <div class="forte"><dt>Resultado estimado</dt><dd>${sinal(r.resultadoC)}${r.completo ? '' : ' <small>(incompleto)</small>'}</dd></div>
        <div><dt>Custo por km ${iconeAjuda('custo_km')}</dt><dd>${r.custoKmC !== null ? moedaC(r.custoKmC) + '/km' : 'indisponível'}</dd></div>
      </dl>
      ${r.completo ? '' : `<p class="nota">Diesel ainda não calculado: falta ${r.faltando.join(', ')}. <button class="link" data-acao="editar-viagem" data-id="${id}">Completar viagem</button></p>`}
      <p class="nota">Abastecimentos não entram nesta conta — o diesel da viagem é o estimado. Custos fixos e gastos não lançados também não estão incluídos.</p>
    </section>

    <div class="titulo"><h2>Fretes</h2><button class="btn mini" data-acao="novo-frete" data-id="${id}">+ Frete</button></div>
    ${r.fretes.length ? `<ul class="lista">${r.fretes.map(f => {
      const rec = recebidoDoFrete(D, f.id), falta = aReceberDoFrete(D, f);
      const recs = S.ordenarPorData(D.recebimentos.filter(x => x.frete_id === f.id));
      return `<li class="item bloco">
        <div class="linha-item">
          <div class="principal"><strong>${rota(f)}</strong>
            <small>${dataBR(f.data)} · ${f.modalidade === 'tonelada' ? `${num(f.peso_t, 3)} t × ${moeda(f.preco_t)}` : 'valor fechado' + (f.peso_t ? ` · ${num(f.peso_t, 3)} t` : '')}
              · cliente ${linkCliente(clienteDe(D, f))}${f.vencimento ? ` · vence ${dataBR(f.vencimento)}` : ''}${por(f)}</small></div>
          <div class="valor"><span>${moeda(f.valor_bruto)}</span><small>recebido ${moedaC(rec)} ${iconeAjuda('recebido')} · a receber ${moedaC(falta)} ${iconeAjuda('a_receber')}</small></div>
        </div>
        ${recs.length ? `<ul class="sublista">${recs.map(x => `<li>💰 ${dataBR(x.data)} · ${moeda(x.valor)}${detalhePagamento(x)}${x.observacao ? ' · ' + esc(x.observacao) : ''}${por(x)}
          <button class="link" data-acao="editar-recebimento" data-id="${x.id}">editar</button>
          <button class="link perigo" data-acao="apagar-recebimento" data-id="${x.id}">apagar</button></li>`).join('')}</ul>` : ''}
        <div class="acoes">
          ${falta > 0 ? `<button class="btn mini" data-acao="receber-frete" data-id="${f.id}">+ Recebimento</button>` : '<span class="selo ok">Quitado</span>'}
          <button class="btn mini sec" data-acao="editar-frete" data-id="${f.id}">Editar</button>
          <button class="btn mini perigo" data-acao="apagar-frete" data-id="${f.id}">Apagar</button>
        </div>
      </li>`;
    }).join('')}</ul>` : vazio('Nenhum frete nesta viagem.')}

    <div class="titulo"><h2>Despesas da viagem ${iconeAjuda('despesa_viagem')}</h2><button class="btn mini" data-acao="nova-despesa-viagem" data-id="${id}">+ Despesa</button></div>
    ${listaDespesas(S.ordenarPorData(r.despesas, 'data_gasto'))}`;
}

// ---------------------------------------------------------------------------
// Lançamentos
// ---------------------------------------------------------------------------
function listaDespesas(lista) {
  if (!lista.length) return vazio('Nenhuma despesa.');
  return `<ul class="lista">${lista.map(x => {
    const origem = x.abastecimento_id ? 'abastecimento' : x.manutencao_id ? 'manutenção' : '';
    const vg = x.viagem_id && S.viagem(x.viagem_id);
    return `<li class="item">
      <div class="principal"><strong>${nomeCategoria(x.categoria)}</strong> <span class="placa">${placa(x.caminhao_id)}</span>
        <small>${dataBR(x.data_gasto)}${x.descricao ? ' · ' + esc(x.descricao) : ''}${vg ? ` · viagem <a href="#/viagens/${vg.id}">${rota(vg)}</a>` : ''}${origem ? ` · gerada por ${origem}` : ''}${por(x)}</small></div>
      <div class="valor"><span>${moeda(x.valor)}</span><small>${x.pago ? 'pago em ' + dataBR(x.data_pagamento) + detalhePagamento(x) : `<span class="pendente">${x.vencimento ? 'vence ' + dataBR(x.vencimento) : 'pendente'}</span>`}${x.total_parcelas > 1 ? ` · ${x.parcela}/${x.total_parcelas}` : ''}</small></div>
      ${origem ? '' : `<div class="acoes"><button class="btn mini sec" data-acao="editar-despesa" data-id="${x.id}">Editar</button>
        <button class="btn mini perigo" data-acao="apagar-despesa" data-id="${x.id}">Apagar</button></div>`}
    </li>`;
  }).join('')}</ul>`;
}

function telaLancamentos(aba = 'despesas') {
  const per = intervalo();
  const abas = [['despesas', 'Despesas'], ['abastecimentos', 'Abastecimentos'], ['recebimentos', 'Recebimentos']];
  let corpo = '', botao = '';
  if (aba === 'abastecimentos') {
    botao = '<button class="btn" data-acao="novo-abastecimento">+ Abastecimento</button>';
    const lista = S.ordenarPorData(D.abastecimentos.filter(a => doCaminhaoFiltrado(a) && noIntervalo(a.data, per)));
    corpo = `<p class="nota">${iconeAjuda('abastecimento')} Cada abastecimento gera uma despesa de diesel no financeiro do caminhão.</p>` + (lista.length ? `<ul class="lista">${lista.map(a => `<li class="item">
      <div class="principal"><strong>${num(a.litros, 3)} l × ${moeda(a.preco_litro)}</strong> <span class="placa">${placa(a.caminhao_id)}</span>
        <small>${dataBR(a.data)} · ${a.hodometro != null ? num(a.hodometro) + ' km' : 'sem hodômetro'}${a.posto ? ' · ' + esc(a.posto) : ''}${a.tanque_cheio ? ' · <span class="selo ok">tanque completo</span>' : ''}${por(a)}</small></div>
      <div class="valor"><span>${moeda(a.total)}</span></div>
      <div class="acoes"><button class="btn mini sec" data-acao="editar-abastecimento" data-id="${a.id}">Editar</button>
        <button class="btn mini perigo" data-acao="apagar-abastecimento" data-id="${a.id}">Apagar</button></div>
    </li>`).join('')}</ul>` : vazio('Nenhum abastecimento no período.'));
  } else if (aba === 'recebimentos') {
    botao = '<button class="btn" data-acao="novo-recebimento">+ Recebimento</button>';
    const lista = S.ordenarPorData(D.recebimentos.filter(r => {
      const cam = caminhaoDoRecebimento(D, r);
      return cam && (!filtro.caminhao || cam === filtro.caminhao) && noIntervalo(r.data, per);
    }));
    const totalC = lista.reduce((s, r) => s + centavos(r.valor), 0);
    corpo = `<p class="periodo">Total recebido no período: <strong>${moedaC(totalC)}</strong> ${iconeAjuda('recebido')}</p>` + (lista.length ? `<ul class="lista">${lista.map(r => {
      const f = r.frete_id && S.frete(r.frete_id);
      const detalhe = f
        ? `${nomeCliente(f)} · frete de ${dataBR(f.data)} (${moeda(f.valor_bruto)})`
        : `<span class="selo">Avulso</span> ${clienteDe(D, r) ? nomeCliente(r) : 'sem frete lançado'}`;
      return `<li class="item">
        <div class="principal"><strong>${f ? rota(f) : esc(r.descricao || 'Recebimento avulso')}</strong> <span class="placa">${placa(caminhaoDoRecebimento(D, r))}</span>
          <small>recebido em ${dataBR(r.data)} · ${detalhe}${detalhePagamento(r)}${r.observacao ? ' · ' + esc(r.observacao) : ''}${por(r)}${f ? ` · <a href="#/viagens/${f.viagem_id}">ver viagem</a>` : ''}</small></div>
        <div class="valor"><span>${moeda(r.valor)}</span></div>
        <div class="acoes"><button class="btn mini sec" data-acao="editar-recebimento" data-id="${r.id}">Editar</button>
          <button class="btn mini perigo" data-acao="apagar-recebimento" data-id="${r.id}">Apagar</button></div>
      </li>`;
    }).join('')}</ul>` : vazio('Nenhum recebimento no período.'));
  } else {
    botao = '<button class="btn" data-acao="nova-despesa">+ Despesa</button>';
    const lista = S.ordenarPorData(D.despesas.filter(x => doCaminhaoFiltrado(x) && noIntervalo(x.data_gasto, per)), 'data_gasto');
    const totalC = lista.reduce((s, x) => s + centavos(x.valor), 0);
    corpo = `<p class="periodo">Total no período: <strong>${moedaC(totalC)}</strong> ${iconeAjuda('despesas')}</p>` + listaDespesas(lista);
  }
  return `<div class="titulo"><h1>Lançamentos</h1>${botao}</div>
    <nav class="abas" aria-label="Tipo de lançamento">${abas.map(([k, t]) => `<a href="#/lancamentos/${k}" ${k === aba ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
    ${barraFiltros()}${corpo}`;
}

// ---------------------------------------------------------------------------
// Manutenções
// ---------------------------------------------------------------------------
const NOME_ESTADO = { atrasada: 'Atrasada', proxima: 'Próxima', em_dia: 'Em dia', sem_prazo: 'Sem prazo', concluido: 'Sem próximo vencimento' };

function listaPlanos(planos) {
  if (!planos.length) return vazio('Nenhuma manutenção prevista.');
  const ordem = { atrasada: 0, proxima: 1, em_dia: 2, sem_prazo: 3, concluido: 4 };
  return `<ul class="lista">${planos.map(p => ({ p, s: statusPlano(p, S.caminhao(p.caminhao_id)) }))
    .sort((a, b) => ordem[a.s.estado] - ordem[b.s.estado])
    .map(({ p, s }) => `<li class="item">
      <div class="principal"><strong>${esc(p.servico)}</strong> <span class="placa">${placa(p.caminhao_id)}</span> <span class="selo ${s.estado}">${NOME_ESTADO[s.estado]}</span>
        <small>${[p.proximo_km != null ? 'no km ' + num(p.proximo_km) : '', p.proxima_data ? 'em ' + dataBR(p.proxima_data) : ''].filter(Boolean).join(' ou ') || 'sem prazo'}${s.texto && s.estado !== 'concluido' ? ' · ' + esc(s.texto) : ''}${p.intervalo_km || p.intervalo_dias ? ` · repete a cada ${[p.intervalo_km ? num(p.intervalo_km) + ' km' : '', p.intervalo_dias ? p.intervalo_dias + ' dias' : ''].filter(Boolean).join(' / ')}` : ''}</small></div>
      <div class="acoes"><button class="btn mini" data-acao="executar-plano" data-id="${p.id}">Registrar execução</button>
        <button class="btn mini sec" data-acao="editar-plano" data-id="${p.id}">Editar</button>
        <button class="btn mini perigo" data-acao="apagar-plano" data-id="${p.id}">Apagar</button></div>
    </li>`).join('')}</ul>`;
}

function telaManutencoes() {
  const planos = D.planos_manutencao.filter(doCaminhaoFiltrado);
  const feitas = S.ordenarPorData(D.manutencoes.filter(doCaminhaoFiltrado));
  return `<div class="titulo"><h1>Manutenções</h1>
      <div class="acoes"><button class="btn" data-acao="novo-plano">+ Prevista</button><button class="btn sec" data-acao="nova-manutencao">+ Realizada</button></div></div>
    ${barraFiltros({ periodo: false })}
    <h2>Previstas ${iconeAjuda('proxima_manutencao')}</h2>${listaPlanos(planos)}
    <h2>Realizadas</h2>
    ${feitas.length ? `<ul class="lista">${feitas.map(m => {
      const x = D.despesas.find(d => d.manutencao_id === m.id);
      return `<li class="item">
        <div class="principal"><strong>${esc(m.servico)}</strong> <span class="placa">${placa(m.caminhao_id)}</span>
          <small>${dataBR(m.data)}${m.km != null ? ' · ' + num(m.km) + ' km' : ''}${m.oficina ? ' · ' + esc(m.oficina) : ''}${por(m)}</small></div>
        <div class="valor"><span>${moeda(m.custo)}</span><small>${x?.pago ? 'pago em ' + dataBR(x.data_pagamento) : '<span class="pendente">pendente</span>'}</small></div>
        <div class="acoes"><button class="btn mini sec" data-acao="editar-manutencao" data-id="${m.id}">Editar</button>
          <button class="btn mini perigo" data-acao="apagar-manutencao" data-id="${m.id}">Apagar</button></div>
      </li>`;
    }).join('')}</ul>` : vazio('Nenhuma manutenção realizada.')}`;
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
const linkCliente = nome => nome ? `<a href="#/clientes/${encodeURIComponent(nome)}">${esc(nome)}</a>` : 'não informado';

// Clientes não têm cadastro: a lista vem dos nomes digitados nos fretes.
function telaClientes() {
  const lista = receberPorCliente(D);
  const totalC = lista.reduce((s, x) => s + x.aReceberC, 0);
  const atrasadoC = lista.reduce((s, x) => s + x.atrasadoC, 0);
  return `<h1>Clientes</h1>
    <p class="nota">Não precisa cadastrar: digite o nome do cliente no frete. Aqui aparece quanto cada um ainda deve. ${iconeAjuda('cliente')}</p>
    <dl class="ficha">
      <div><dt>A receber (todos) ${iconeAjuda('a_receber')}</dt><dd>${moedaC(totalC)}</dd></div>
      <div><dt>Atrasado ${iconeAjuda('atrasados')}</dt><dd class="${atrasadoC ? 'neg' : ''}">${moedaC(atrasadoC)}</dd></div>
    </dl>
    ${lista.length ? `<ul class="lista">${lista.map(x => `<li class="item">
        ${x.nome ? `<a class="principal" href="#/clientes/${encodeURIComponent(x.nome)}"><strong>${esc(x.nome)}</strong>`
                 : '<div class="principal"><strong>Fretes sem cliente informado</strong>'}
          <small>${x.fretes.length} frete(s) em aberto</small>${x.nome ? '</a>' : '</div>'}
        <div class="valor"><span>${moedaC(x.aReceberC)}</span><small>${x.atrasadoC ? `<span class="neg">${moedaC(x.atrasadoC)} atrasado</span>` : 'a receber'}</small></div>
      </li>`).join('')}</ul>` : vazio('Nenhum valor a receber. 👍')}`;
}

function telaCliente(nomeUrl) {
  const nome = decodeURIComponent(nomeUrl);
  const k = chaveCliente(nome);
  const fretes = S.ordenarPorData(D.fretes.filter(f => chaveCliente(clienteDe(D, f)) === k));
  const avulsos = S.ordenarPorData(D.recebimentos.filter(r => !r.frete_id && chaveCliente(clienteDe(D, r)) === k));
  const hoje = hojeISO();
  const totais = fretes.reduce((t, f) => {
    const falta = aReceberDoFrete(D, f);
    t.bruto += centavos(f.valor_bruto); t.falta += falta;
    if (falta > 0 && f.vencimento && f.vencimento < hoje) t.atrasado += falta;
    return t;
  }, { bruto: 0, falta: 0, atrasado: 0 });
  return `<p><a href="#/clientes">← Clientes</a></p>
    <h1>${esc(nome)}</h1>
    <dl class="ficha">
      <div><dt>Total em fretes</dt><dd>${moedaC(totais.bruto)}</dd></div>
      <div><dt>A receber ${iconeAjuda('a_receber')}</dt><dd>${moedaC(totais.falta)}</dd></div>
      <div><dt>Atrasado ${iconeAjuda('atrasados')}</dt><dd class="${totais.atrasado ? 'neg' : ''}">${moedaC(totais.atrasado)}</dd></div>
    </dl>
    <h2>Fretes</h2>
    ${fretes.length ? `<ul class="lista">${fretes.map(f => {
      const falta = aReceberDoFrete(D, f);
      const atrasado = falta > 0 && f.vencimento && f.vencimento < hoje;
      return `<li class="item"><a class="principal" href="#/viagens/${f.viagem_id}">
          <strong>${rota(f)}</strong> <span class="placa">${placa(caminhaoDoFrete(D, f))}</span>
          <small>${dataBR(f.data)}${f.vencimento ? ` · vence ${dataBR(f.vencimento)}` : ''} ${atrasado ? '<span class="selo atrasada">Atrasado</span>' : falta === 0 ? '<span class="selo ok">Quitado</span>' : ''}</small></a>
        <div class="valor"><span>${moeda(f.valor_bruto)}</span><small>${falta > 0 ? 'falta ' + moedaC(falta) : 'recebido'}</small></div>
        ${falta > 0 ? `<div class="acoes"><button class="btn mini" data-acao="receber-frete" data-id="${f.id}">+ Recebimento</button></div>` : ''}
      </li>`;
    }).join('')}</ul>` : vazio('Nenhum frete deste cliente.')}
    ${avulsos.length ? `<h2>Recebimentos avulsos</h2><ul class="lista">${avulsos.map(r => `<li class="item">
        <div class="principal"><strong>${esc(r.descricao || 'Recebimento avulso')}</strong> <span class="placa">${placa(r.caminhao_id)}</span>
          <small>recebido em ${dataBR(r.data)}${por(r)}</small></div>
        <div class="valor"><span>${moeda(r.valor)}</span></div></li>`).join('')}</ul>` : ''}`;
}

// ---------------------------------------------------------------------------
// Boletos
// ---------------------------------------------------------------------------
function itemBoleto(x) {
  const p = x.pago ? null : prazoBoleto(x);
  return `<li class="item">
    <div class="principal"><strong>${nomeBoleto(x)}</strong> <span class="placa">${placa(x.caminhao_id)}</span>
      ${p ? `<span class="selo ${p.classe}">${p.selo}</span>` : '<span class="selo ok">Pago</span>'}
      <small>${nomeCategoria(x.categoria)}${x.descricao && x.fornecedor ? ' · ' + esc(x.descricao) : ''} · vence ${dataBR(x.vencimento)}${p ? ' · ' + p.texto : ` · pago em ${dataBR(x.data_pagamento)}`}${por(x)}</small>
      ${x.linha_digitavel ? `<small class="linha-digitavel">${formatarLinha(x.linha_digitavel)}</small>` : ''}</div>
    <div class="valor"><span>${moeda(x.valor)}</span></div>
    <div class="acoes">
      ${x.linha_digitavel && !x.pago ? `<button class="btn mini sec" data-acao="copiar-linha" data-id="${x.id}">Copiar código</button>` : ''}
      ${x.pago ? '' : `<button class="btn mini" data-acao="pagar-boleto" data-id="${x.id}">Marcar como pago</button>`}
      <button class="btn mini sec" data-acao="editar-despesa" data-id="${x.id}">Editar</button>
      <button class="btn mini perigo" data-acao="apagar-despesa" data-id="${x.id}">Apagar</button>
      ${x.grupo_parcelas && !x.pago ? `<button class="btn mini perigo" data-acao="apagar-parcelas" data-id="${x.grupo_parcelas}">Apagar parcelas em aberto</button>` : ''}
    </div>
  </li>`;
}

function telaBoletos() {
  const doFiltro = x => !filtro.caminhao || x.caminhao_id === filtro.caminhao;
  const { vencidos, proximos, depois } = boletosEmAberto(D);
  const [v, p, d] = [vencidos, proximos, depois].map(l => l.filter(doFiltro));
  const soma = l => l.reduce((s, x) => s + centavos(x.valor), 0);
  const pagos = S.ordenarPorData(D.despesas.filter(x => x.pago && x.vencimento && doFiltro(x)), 'data_pagamento').slice(0, 20);
  const secao = (titulo, lista, msg) => `<h2>${titulo} ${lista.length ? `<small>${moedaC(soma(lista))}</small>` : ''}</h2>
    ${lista.length ? `<ul class="lista">${lista.map(itemBoleto).join('')}</ul>` : vazio(msg)}`;
  return `<div class="titulo"><h1>Boletos</h1><button class="btn" data-acao="novo-boleto">+ Boleto</button></div>
    ${barraFiltros({ periodo: false })}
    <dl class="ficha">
      <div><dt>Vencidos</dt><dd class="${v.length ? 'neg' : ''}">${moedaC(soma(v))}</dd></div>
      <div><dt>Próximos 7 dias ${iconeAjuda('boletos_vencer')}</dt><dd>${moedaC(soma(p))}</dd></div>
      <div><dt>Total em aberto</dt><dd>${moedaC(soma([...v, ...p, ...d]))}</dd></div>
    </dl>
    ${secao('Vencidos', v, 'Nenhum boleto vencido. 👍')}
    ${secao('Vencem nos próximos 7 dias', p, 'Nada vencendo nesta semana.')}
    ${secao('Mais adiante', d, 'Nenhum outro boleto em aberto.')}
    ${pagos.length ? `<details class="pagos"><summary>Pagos recentemente (${pagos.length})</summary><ul class="lista">${pagos.map(itemBoleto).join('')}</ul></details>` : ''}`;
}

function telaMais() {
  const itens = [['boletos', '📄', 'Boletos'], ['caminhoes', '🚚', 'Caminhões'], ['clientes', '🤝', 'Clientes'], ['manutencoes', '🔧', 'Manutenção'], ['jogo', '🎮', 'Jogo do Renan'], ['dados', '💾', 'Dados, backup e conta']];
  return `<h1>Mais</h1><ul class="lista">${itens.map(([h, i, t]) =>
    `<li class="item"><a class="principal" href="#/${h}"><strong><span aria-hidden="true">${i}</span> ${t}</strong></a></li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------------------
// Dados: cópia de segurança e conta
// ---------------------------------------------------------------------------
async function telaDados() {
  const u = await db.usuario();
  return `<h1>Dados e conta</h1>
    ${db.modo === 'local' ? `<div class="banner aviso"><strong>Modo demonstração.</strong> Os dados ficam só neste navegador e podem ser perdidos. Configure o Supabase (veja o LEIAME) para usar de verdade.</div>` :
      `<p>Conectado como <strong>${esc(u?.email)}</strong>.</p>`}
    <section class="cartao">
      <h2>Tutorial</h2>
      <p>Reveja o passo a passo de como usar cada parte do sistema.</p>
      <p><button class="btn sec" data-acao="ver-tutorial">Ver tutorial</button></p>
    </section>
    <section class="cartao">
      <h2>Cópia de segurança</h2>
      <p>Baixe um arquivo com todos os dados. Recomendado uma vez por semana — guarde no Google Drive, e-mail ou pendrive.</p>
      <p><button class="btn" data-acao="exportar">Baixar cópia de segurança</button></p>
      <p>Restaurar uma cópia (registros com o mesmo código são substituídos; nada é apagado). Aceita o arquivo baixado aqui (.json) ou o backup automático do GitHub (.enc):</p>
      <p><input type="file" accept="application/json,.json,.enc" data-importar aria-label="Arquivo de cópia de segurança"></p>
    </section>
    ${db.modo === 'local' ? `<section class="cartao"><h2>Testar com dados de exemplo</h2>
      <p>Cria dois caminhões e o exemplo do planejamento (32 t × R$ 150, 800 km, 2,5 km/l).</p>
      <p><button class="btn sec" data-acao="exemplo">Carregar exemplo</button></p></section>` :
      `<section class="cartao"><h2>Senha</h2><p><button class="btn sec" data-acao="trocar-senha">Trocar minha senha</button></p></section>
      <p><button class="btn sec" data-acao="sair">Sair</button></p>`}`;
}

async function carregarExemplo() {
  const banco = db;
  const hoje = hojeISO(), mes = hoje.slice(0, 8);
  const a = await banco.inserir('caminhoes', { modelo: 'Caminhão A — Volvo FH', placa: 'ABC1D23', ano: 2019, hodometro: 119500, media_kml: 2.5, ativo: true });
  const b = await banco.inserir('caminhoes', { modelo: 'Caminhão B — Scania R450', placa: 'XYZ9K87', ano: 2021, hodometro: 80000, media_kml: 2.7, ativo: true });
  const v = await banco.inserir('viagens', { caminhao_id: a.id, data_inicio: mes + '02', data_fim: mes + '04', origem: 'Rio Verde-GO', destino: 'Santos-SP',
    km_inicial: 118700, km_final: 119500, status: 'concluida', media_kml_ref: 2.5, preco_diesel_ref: 6, observacao: null });
  const f = await banco.inserir('fretes', { viagem_id: v.id, data: mes + '02', origem: 'Rio Verde-GO', destino: 'Santos-SP', peso_t: 32, modalidade: 'tonelada', preco_t: 150, valor_fechado: null, valor_bruto: 4800 });
  await banco.inserir('recebimentos', { frete_id: f.id, data: mes + '05', valor: 2000, observacao: 'adiantamento' });
  await banco.inserir('despesas', { caminhao_id: a.id, viagem_id: v.id, categoria: 'pedagio', descricao: 'Pedágios', valor: 300, data_gasto: mes + '03', pago: true, data_pagamento: mes + '03' });
  await banco.inserir('despesas', { caminhao_id: a.id, viagem_id: v.id, categoria: 'alimentacao', descricao: 'Refeições', valor: 150, data_gasto: mes + '03', pago: true, data_pagamento: mes + '03' });
  const ab = await banco.inserir('abastecimentos', { caminhao_id: a.id, data: mes + '02', hodometro: 118700, litros: 416.667, preco_litro: 6, total: 2500, posto: 'Posto Rio Verde', tanque_cheio: true });
  await banco.inserir('despesas', { caminhao_id: a.id, viagem_id: null, categoria: 'diesel', descricao: 'Abastecimento 416.667 l — Posto Rio Verde', valor: 2500, data_gasto: mes + '02', pago: true, data_pagamento: mes + '02', abastecimento_id: ab.id });
  await banco.inserir('planos_manutencao', { caminhao_id: a.id, servico: 'Troca de óleo', proximo_km: 120000, proxima_data: null, intervalo_km: 20000, intervalo_dias: null, aviso_km: 1000, aviso_dias: 30, ativo: true });
  await banco.inserir('despesas', { caminhao_id: b.id, viagem_id: null, categoria: 'pneus', descricao: 'Recapagem', valor: 1200, data_gasto: mes + '01', pago: false, data_pagamento: null });
  await S.recarregar();
}

// ---------------------------------------------------------------------------
// Ações (delegação de cliques)
// ---------------------------------------------------------------------------
async function apagarCom(msg, fn, ok = 'Apagado.') {
  if (!(await confirmar(msg))) return;
  await fn();
  aviso(ok);
  render();
}

const ACOES = {
  'novo-lancamento': id => F.novoLancamento(id || filtro.caminhao || null),
  'novo-caminhao': () => F.formCaminhao(),
  'editar-caminhao': id => F.formCaminhao(S.caminhao(id)),
  'nova-anotacao': () => F.formAnotacao(),
  'editar-anotacao': id => {
    const anotacao = D.anotacoes.find(a => a.id === id);
    F.formAnotacao(anotacao);
  },
  'alternar-anotacao': async id => {
    const anotacao = D.anotacoes.find(a => a.id === id);
    await S.salvarAnotacao(id, { concluida: !anotacao.concluida });
    render();
  },
  'apagar-anotacao': id => apagarCom('Apagar esta anotação?', () => S.apagarAnotacao(id)),
  'corrigir-hodometro': id => F.formHodometro(S.caminhao(id)),
  'inativar-caminhao': async id => {
    const c = S.caminhao(id);
    const ok = await confirmar(`Desativar <strong>${esc(c.modelo)} (${esc(c.placa)})</strong>?<br><br>
      Ele some das opções de novos lançamentos e dos avisos de manutenção. <strong>Nada é apagado</strong>:
      viagens, despesas e totais continuam no histórico e nos relatórios. Você pode reativar quando quiser.`, 'Desativar');
    if (!ok) return;
    await S.salvarCaminhao(id, { ativo: false });
    aviso('Caminhão desativado. O histórico foi mantido.');
    render();
  },
  'ativar-caminhao': async id => { await S.salvarCaminhao(id, { ativo: true }); aviso('Caminhão reativado.'); render(); },
  'apagar-caminhao': id => apagarCom('Apagar este caminhão? Ele não tem lançamentos.', async () => {
    await S.apagar('caminhoes', id); location.hash = '#/caminhoes';
  }),
  'nova-viagem': () => F.formViagem(null, filtro.caminhao || null),
  'editar-viagem': id => F.formViagem(S.viagem(id)),
  'apagar-viagem': id => apagarCom('Apagar esta viagem? <strong>Os fretes e recebimentos dela também serão apagados.</strong> As despesas vinculadas continuam como gastos gerais do caminhão.',
    async () => { await S.apagarViagem(id); location.hash = '#/viagens'; }),
  'novo-frete': id => F.formFrete(id),
  'editar-frete': id => F.formFrete(S.frete(id).viagem_id, S.frete(id)),
  'apagar-frete': id => apagarCom('Apagar este frete e os recebimentos dele?', () => S.apagarFrete(id)),
  'receber-frete': id => F.formRecebimento({ freteId: id }),
  'novo-recebimento': () => F.formRecebimento({ caminhaoId: filtro.caminhao || null }),
  'novo-recebimento-avulso': () => F.formRecebimento({ caminhaoId: filtro.caminhao || null, avulso: true }),
  'editar-recebimento': id => F.formRecebimento({ r: D.recebimentos.find(r => r.id === id) }),
  'apagar-recebimento': id => apagarCom('Apagar este recebimento?', () => S.apagar('recebimentos', id)),
  'nova-despesa': () => F.formDespesa({ caminhaoId: filtro.caminhao || null }),
  'nova-despesa-viagem': id => F.formDespesa({ viagemId: id }),
  'editar-despesa': id => F.formDespesa({ x: D.despesas.find(x => x.id === id) }),
  'apagar-despesa': id => apagarCom('Apagar esta despesa?', () => S.apagar('despesas', id)),
  'novo-abastecimento': () => F.formAbastecimento({ caminhaoId: filtro.caminhao || null }),
  'editar-abastecimento': id => F.formAbastecimento({ a: D.abastecimentos.find(a => a.id === id) }),
  'apagar-abastecimento': id => apagarCom('Apagar este abastecimento? A despesa de diesel gerada por ele também será apagada.', () => S.apagarAbastecimento(id)),
  'novo-plano': () => F.formPlano({ caminhaoId: filtro.caminhao || null }),
  'editar-plano': id => F.formPlano({ p: D.planos_manutencao.find(p => p.id === id) }),
  'apagar-plano': id => apagarCom('Apagar esta manutenção prevista? O histórico de execuções é mantido.', () => S.apagarPlano(id)),
  'executar-plano': id => F.formManutencao({ planoId: id }),
  'nova-manutencao': () => F.formManutencao({ caminhaoId: filtro.caminhao || null }),
  'editar-manutencao': id => F.formManutencao({ m: D.manutencoes.find(m => m.id === id) }),
  'apagar-manutencao': id => apagarCom('Apagar esta manutenção realizada? A despesa gerada por ela também será apagada.', () => S.apagarManutencao(id)),
  'exportar': () => {
    const blob = new Blob([S.exportarJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `frota-backup-${hojeISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'exemplo': async () => { await carregarExemplo(); aviso('Exemplo carregado.'); location.hash = '#/resumo'; },
  'sair': async () => { await db.sair(); location.reload(); },
  'baixar-excel': async () => {
    aviso('Gerando planilha…', 'info');
    const { baixarExcel } = await import('./relatorio.js');
    await baixarExcel({ ano: Number(filtro.ano) || Number(hojeISO().slice(0, 4)), caminhao: filtro.caminhao });
  },
  'imprimir': () => print(),
  'ver-tutorial': () => iniciarTutorial(),
  'novo-boleto': () => F.formDespesa({ caminhaoId: filtro.caminhao || null, boleto: true }),
  'pagar-boleto': id => F.formPagarBoleto(D.despesas.find(x => x.id === id)),
  'copiar-linha': async id => {
    const x = D.despesas.find(x => x.id === id);
    await navigator.clipboard.writeText(x.linha_digitavel);
    aviso('Código copiado. Cole no app do banco.');
  },
  'apagar-parcelas': grupo => apagarCom('Apagar todas as parcelas <strong>ainda não pagas</strong> deste parcelamento? As pagas continuam no histórico.',
    () => S.apagarParcelasEmAberto(grupo)),
  'trocar-senha': () => telaNovaSenha(true),
};

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-acao]');
  if (!el) return;
  e.preventDefault();
  try {
    await ACOES[el.dataset.acao]?.(el.dataset.id);
  } catch (err) {
    aviso(err.message || String(err), 'erro');
  }
});

document.addEventListener('change', async e => {
  const f = e.target.closest('[data-filtro]');
  if (f) {
    filtro[f.dataset.filtro] = f.value;
    guardarFiltro();
    render();
    return;
  }
  if (e.target.matches('[data-importar]') && e.target.files[0]) {
    try {
      const arq = e.target.files[0];
      let texto;
      if (arq.name.endsWith('.enc')) {
        const senha = prompt('Senha do backup automático (a mesma cadastrada no GitHub como BACKUP_SENHA):');
        if (!senha) return;
        texto = await decifrarBackup(await arq.arrayBuffer(), senha);
      } else {
        texto = await arq.text();
      }
      if (!(await confirmar('Restaurar esta cópia de segurança? Registros iguais serão substituídos pela versão do arquivo.', 'Restaurar'))) return;
      await S.importarJSON(texto);
      aviso('Cópia restaurada.');
      render();
    } catch (err) {
      aviso('Não foi possível restaurar: ' + err.message, 'erro');
    } finally {
      e.target.value = '';
    }
  }
});

// ---------------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------------
async function render() {
  desmontarJogo();
  const [, rota = 'resumo', ...resto] = (location.hash || '#/resumo').split('/');
  const id = resto.join('/');
  const noMais = ['boletos', 'caminhoes', 'clientes', 'manutencoes', 'dados', 'jogo'].includes(rota);
  document.querySelectorAll('.menu a').forEach(a => {
    const href = a.getAttribute('href');
    a.toggleAttribute('aria-current', href === '#/' + rota || (href === '#/mais' && noMais));
    if (a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page');
  });
  const telas = {
    resumo: telaResumo,
    painel: () => telaPainel(filtro),
    clientes: () => id ? telaCliente(id) : telaClientes(),
    boletos: telaBoletos,
    mais: telaMais,
    caminhoes: () => id ? telaCaminhao(id) : telaCaminhoes(),
    viagens: () => id ? telaViagem(id) : telaViagens(),
    lancamentos: () => telaLancamentos(id),
    manutencoes: telaManutencoes,
    dados: telaDados,
    jogo: telaJogo,
  };
  const el = $conteudo();
  el.innerHTML = await (telas[rota] || telaResumo)();
  if (rota === 'painel') montarGraficos();
  if (rota === 'jogo') montarJogo(el);
}

// Gráficos usam as cores do tema: redesenha ao trocar claro/escuro.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (location.hash.startsWith('#/painel')) montarGraficos();
});

F.definirAoMudar(render);
addEventListener('hashchange', () => {
  // Ao trocar de tela (inclusive pelo botão voltar do celular), fecha formulários abertos.
  document.querySelectorAll('dialog[open]').forEach(dl => { dl.close(); dl.remove(); });
  render();
  scrollTo(0, 0);
});

const LOGO_LOGIN = `<div class="logo-login"><img src="assets/logo.jpg" alt="Cabral Transportes — cargas pesadas, grandes destinos" width="640" height="640"></div>`;

function formularioConta({ titulo, nota = '', campos, botao, links = '', aoEnviar }) {
  document.body.classList.add('sem-sessao');
  $conteudo().innerHTML = `<form class="login cartao" novalidate>
    ${LOGO_LOGIN}
    <h1>${titulo}</h1>
    ${nota ? `<p class="nota">${nota}</p>` : ''}
    ${campos}
    <p class="erro" role="alert" hidden></p>
    <p class="nota" data-ok hidden></p>
    <button class="btn" type="submit">${botao}</button>
    ${links}
  </form>`;
  const form = $conteudo().querySelector('form');
  form.onsubmit = async e => {
    e.preventDefault();
    const erro = form.querySelector('.erro');
    erro.hidden = true;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const ok = await aoEnviar(form);
      if (ok) {
        const el = form.querySelector('[data-ok]');
        el.innerHTML = ok;
        el.hidden = false;
        btn.hidden = true;
      }
    } catch (err) {
      erro.textContent = err.message;
      erro.hidden = false;
    } finally {
      btn.disabled = false;
    }
  };
  form.querySelectorAll('[data-ir]').forEach(b => { b.onclick = () => telaLogin(b.dataset.ir); });
  form.querySelector('input')?.focus();
  return form;
}

const campoEmail = '<label>E-mail <input name="email" type="email" autocomplete="username" required></label>';
const linkConta = (modo, texto) => `<button class="link" type="button" data-ir="${modo}">${texto}</button>`;

function entrarNoSistema() {
  document.body.classList.remove('sem-sessao');
  history.replaceState(null, '', location.pathname + '#/resumo');
  return iniciarSessao();
}

function telaLogin(modo = 'entrar', mensagemErro = '') {
  if (modo === 'criar') {
    return formularioConta({
      titulo: 'Criar login',
      nota: 'Crie seu login com e-mail e senha. O sistema aceita no máximo 2 logins, e os dois veem os mesmos dados.',
      campos: `${campoEmail}
        <label>Senha <input name="senha" type="password" autocomplete="new-password" required></label>
        <label>Repita a senha <input name="senha2" type="password" autocomplete="new-password" required></label>`,
      botao: 'Criar login',
      links: linkConta('entrar', 'Já tenho login — entrar'),
      async aoEnviar(form) {
        const email = form.email.value.trim(), senha = form.senha.value;
        if (!email || !senha) throw new Error('Preencha e-mail e senha.');
        if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        if (senha !== form.senha2.value) throw new Error('As senhas não são iguais.');
        if (await db.cadastrar(email, senha)) { await entrarNoSistema(); return null; }
        return `<strong>Login criado!</strong> Enviamos um e-mail de confirmação para ${esc(email)}. Abra o link do e-mail; ele traz você de volta já conectado.`;
      },
    });
  }
  if (modo === 'esqueci') {
    return formularioConta({
      titulo: 'Esqueci minha senha',
      nota: 'Informe o e-mail do login. Você vai receber um link para criar uma senha nova.',
      campos: campoEmail,
      botao: 'Enviar link',
      links: linkConta('entrar', 'Voltar para entrar'),
      async aoEnviar(form) {
        const email = form.email.value.trim();
        if (!email) throw new Error('Preencha o e-mail.');
        await db.recuperarSenha(email);
        return `Se ${esc(email)} tiver login, o link chega em alguns minutos. Confira também a caixa de spam.`;
      },
    });
  }
  const form = formularioConta({
    titulo: 'Controle de Frota',
    campos: `${campoEmail}
      <label>Senha <input name="senha" type="password" autocomplete="current-password" required></label>`,
    botao: 'Entrar',
    links: `${linkConta('esqueci', 'Esqueci minha senha')} ${linkConta('criar', 'Primeiro acesso? Criar login')}`,
    async aoEnviar(form) {
      const email = form.email.value.trim(), senha = form.senha.value;
      if (!email || !senha) throw new Error('Preencha e-mail e senha.');
      await db.entrar(email, senha);
      await entrarNoSistema();
      return null;
    },
  });
  if (mensagemErro) {
    const erro = form.querySelector('.erro');
    erro.textContent = mensagemErro;
    erro.hidden = false;
  }
  return form;
}

// Depois do link "Esqueci minha senha" (já conectado) ou pela tela Dados.
function telaNovaSenha(voltarParaDados = false) {
  formularioConta({
    titulo: 'Criar nova senha',
    campos: `<label>Nova senha <input name="senha" type="password" autocomplete="new-password" required></label>
      <label>Repita a nova senha <input name="senha2" type="password" autocomplete="new-password" required></label>`,
    botao: 'Salvar nova senha',
    links: voltarParaDados ? '<button class="link" type="button" data-cancelar>Cancelar</button>' : '',
    async aoEnviar(form) {
      const senha = form.senha.value;
      if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      if (senha !== form.senha2.value) throw new Error('As senhas não são iguais.');
      await db.trocarSenha(senha);
      aviso('Senha alterada.');
      await entrarNoSistema();
      return null;
    },
  });
  $conteudo().querySelector('[data-cancelar]')?.addEventListener('click', () => {
    document.body.classList.remove('sem-sessao');
    location.hash = '#/dados';
    render();
  });
}

async function iniciarSessao() {
  $conteudo().innerHTML = '<p class="carregando">Carregando…</p>';
  try {
    await S.recarregar();
  } catch (err) {
    const bancoDesatualizado = /clientes|criado_por|cliente_id|cliente_nome|vencimento|schema cache/.test(err.message);
    $conteudo().innerHTML = bancoDesatualizado
      ? `<div class="banner erro"><strong>O banco precisa ser atualizado.</strong> No Supabase, abra o SQL Editor, cole o arquivo supabase/schema.sql inteiro e clique em Run. Depois recarregue esta página.</div>`
      : `<div class="banner erro">Não foi possível carregar os dados: ${esc(err.message)}</div>`;
    return;
  }
  await render();
  // Tutorial na primeira vez de cada usuário (login ou F5).
  if (deveMostrarTutorial(await db.usuario())) iniciarTutorial();
}

async function iniciar() {
  iniciarAjuda();
  if (db.modo === 'local') document.getElementById('demo').hidden = false;
  db.aoRecuperarSenha(() => telaNovaSenha());
  const usuario = await db.usuario();
  // Links do e-mail deixam dados no "#"; limpa para não confundir a navegação.
  if (/access_token|error_description|type=/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/resumo');
  if (chegouPorRecuperacao && usuario) return telaNovaSenha();
  if (!usuario) {
    return telaLogin('entrar', erroNoLink ? 'O link do e-mail é inválido ou expirou. Peça um novo em "Esqueci minha senha".' : '');
  }
  iniciarSessao();
}

iniciar();

// Instalar como aplicativo (funciona também sem internet para abrir as telas).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
