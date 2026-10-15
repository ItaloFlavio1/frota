// Dados carregados na memória + operações que mantêm as regras de negócio
// (hodômetro, despesa única por abastecimento/manutenção, exclusões em cascata).
import { db, TABELAS } from './db.js';
import { proximoVencimento } from './calc.js';

export const D = Object.fromEntries(TABELAS.map(t => [t, []]));

export async function recarregar() {
  const listas = await Promise.all(TABELAS.map(t => db.listar(t)));
  TABELAS.forEach((t, i) => { D[t] = listas[i]; });
}

export const caminhao = id => D.caminhoes.find(c => c.id === id);
export const viagem = id => D.viagens.find(v => v.id === id);
export const frete = id => D.fretes.find(f => f.id === id);
export const cliente = id => D.clientes.find(c => c.id === id);
// Quem lançou: parte do e-mail antes do "@" (registros antigos não têm).
export const autor = x => x?.criado_por ? x.criado_por.split('@')[0] : '';
export const ordenarPorData = (lista, campo = 'data') =>
  [...lista].sort((a, b) => (b[campo] || '').localeCompare(a[campo] || '') || (b.created_at || '').localeCompare(a.created_at || ''));

export function ultimoPrecoDiesel(caminhaoId) {
  const ab = ordenarPorData(D.abastecimentos.filter(a => a.caminhao_id === caminhaoId))[0]
    || ordenarPorData(D.abastecimentos)[0];
  return ab ? Number(ab.preco_litro) : null;
}

export function temHistorico(caminhaoId) {
  return ['viagens', 'despesas', 'abastecimentos', 'manutencoes', 'planos_manutencao']
    .some(t => D[t].some(l => l.caminhao_id === caminhaoId));
}

// Hodômetro: só sobe com leituras válidas; lançamentos antigos não o reduzem.
async function subirHodometro(caminhaoId, leitura) {
  if (leitura == null || leitura === '') return;
  const c = caminhao(caminhaoId);
  if (c && Number(leitura) > Number(c.hodometro || 0)) {
    await db.atualizar('caminhoes', caminhaoId, { hodometro: Number(leitura) });
  }
}

const salvar = (tabela, id, dados) => id ? db.atualizar(tabela, id, dados) : db.inserir(tabela, dados);

// ---------------------------------------------------------------------------
export async function salvarCaminhao(id, dados) {
  await salvar('caminhoes', id, dados);
  await recarregar();
}

export async function salvarAnotacao(id, dados) {
  await salvar('anotacoes', id, dados);
  await recarregar();
}

export async function apagarAnotacao(id) {
  await db.remover('anotacoes', id);
  await recarregar();
}

export async function salvarCliente(id, dados) {
  await salvar('clientes', id, dados);
  await recarregar();
}

export async function corrigirHodometro(id, valor) {
  await db.atualizar('caminhoes', id, { hodometro: valor });
  await recarregar();
}

export async function salvarViagem(id, dados, primeiroFrete) {
  const v = await salvar('viagens', id, dados);
  if (primeiroFrete) await db.inserir('fretes', { ...primeiroFrete, viagem_id: v.id });
  await subirHodometro(v.caminhao_id, Math.max(Number(v.km_inicial || 0), Number(v.km_final || 0)) || null);
  await recarregar();
  return v;
}

export async function salvarFrete(id, dados) {
  await salvar('fretes', id, dados);
  await recarregar();
}

export async function salvarRecebimento(id, dados) {
  await salvar('recebimentos', id, dados);
  await recarregar();
}

export async function salvarDespesa(id, dados) {
  await salvar('despesas', id, dados);
  await recarregar();
}

// Boleto parcelado: todas as parcelas ficam ligadas pelo mesmo grupo.
export async function salvarParcelas(parcelas) {
  const grupo = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  for (const p of parcelas) await db.inserir('despesas', { ...p, grupo_parcelas: grupo });
  await recarregar();
}

export async function apagarParcelasEmAberto(grupo) {
  for (const x of D.despesas.filter(x => x.grupo_parcelas === grupo && !x.pago)) await db.remover('despesas', x.id);
  await recarregar();
}

// Abastecimento gera exatamente uma despesa (categoria diesel), sempre sem viagem.
export async function salvarAbastecimento(id, dados, financeiro) {
  const a = await salvar('abastecimentos', id, dados);
  const despesa = {
    caminhao_id: a.caminhao_id, viagem_id: null, categoria: 'diesel',
    descricao: `Abastecimento ${a.litros} l${a.posto ? ' — ' + a.posto : ''}`,
    valor: a.total, data_gasto: a.data, abastecimento_id: a.id, ...financeiro,
  };
  const existente = D.despesas.find(x => x.abastecimento_id === a.id);
  await salvar('despesas', existente?.id, despesa);
  await subirHodometro(a.caminhao_id, a.hodometro);
  await recarregar();
}

// Manutenção realizada gera uma despesa; se ligada a um plano, atualiza o próximo vencimento.
export async function salvarManutencao(id, dados, financeiro, intervalos) {
  const m = await salvar('manutencoes', id, dados);
  const despesa = {
    caminhao_id: m.caminhao_id, viagem_id: null, categoria: 'manutencao',
    descricao: m.servico + (m.oficina ? ' — ' + m.oficina : ''),
    valor: m.custo, data_gasto: m.data, manutencao_id: m.id, ...financeiro,
  };
  const existente = D.despesas.find(x => x.manutencao_id === m.id);
  await salvar('despesas', existente?.id, despesa);
  if (m.plano_id && intervalos) {
    await db.atualizar('planos_manutencao', m.plano_id, {
      intervalo_km: intervalos.intervalo_km, intervalo_dias: intervalos.intervalo_dias,
      ...proximoVencimento({ km: m.km, data: m.data, ...intervalos }),
    });
  }
  await subirHodometro(m.caminhao_id, m.km);
  await recarregar();
}

export async function salvarPlano(id, dados) {
  await salvar('planos_manutencao', id, dados);
  await recarregar();
}

// ---------------------------------------------------------------------------
// Exclusões (feitas explicitamente para valer igual no Supabase e no modo demonstração)
// ---------------------------------------------------------------------------
export async function apagarFrete(id) {
  for (const r of D.recebimentos.filter(r => r.frete_id === id)) await db.remover('recebimentos', r.id);
  await db.remover('fretes', id);
  await recarregar();
}

export async function apagarViagem(id) {
  for (const f of D.fretes.filter(f => f.viagem_id === id)) {
    for (const r of D.recebimentos.filter(r => r.frete_id === f.id)) await db.remover('recebimentos', r.id);
    await db.remover('fretes', f.id);
  }
  for (const x of D.despesas.filter(x => x.viagem_id === id)) await db.atualizar('despesas', x.id, { viagem_id: null });
  await db.remover('viagens', id);
  await recarregar();
}

export async function apagarAbastecimento(id) {
  const x = D.despesas.find(x => x.abastecimento_id === id);
  if (x) await db.remover('despesas', x.id);
  await db.remover('abastecimentos', id);
  await recarregar();
}

export async function apagarManutencao(id) {
  const x = D.despesas.find(x => x.manutencao_id === id);
  if (x) await db.remover('despesas', x.id);
  await db.remover('manutencoes', id);
  await recarregar();
}

export async function apagarPlano(id) {
  for (const m of D.manutencoes.filter(m => m.plano_id === id)) await db.atualizar('manutencoes', m.id, { plano_id: null });
  await db.remover('planos_manutencao', id);
  await recarregar();
}

export async function apagar(tabela, id) {
  await db.remover(tabela, id);
  await recarregar();
}

// ---------------------------------------------------------------------------
// Cópia de segurança
// ---------------------------------------------------------------------------
export function exportarJSON() {
  return JSON.stringify({ sistema: 'controle-frota', versao: 1, gerado_em: new Date().toISOString(), dados: D }, null, 2);
}

export async function importarJSON(texto) {
  const obj = JSON.parse(texto);
  if (obj.sistema !== 'controle-frota' || !obj.dados) throw new Error('Arquivo não é uma cópia de segurança deste sistema.');
  // Ordem respeita as dependências entre tabelas.
  for (const t of TABELAS) await db.importar(t, obj.dados[t] || []);
  await recarregar();
}
