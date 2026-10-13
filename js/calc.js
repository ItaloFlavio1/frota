// Regras de cálculo. Dinheiro é sempre somado em CENTAVOS inteiros para evitar
// erros de ponto flutuante. Funções puras: recebem os dados e devolvem números.

export const centavos = v => Math.round(Number(v || 0) * 100);
export const reais = c => c / 100;

// ---------------------------------------------------------------------------
// Datas (strings ISO "AAAA-MM-DD")
// ---------------------------------------------------------------------------
export function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function somarDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + Number(dias));
  return d.toISOString().slice(0, 10);
}
export function diferencaDias(deISO, ateISO) {
  return Math.round((new Date(ateISO + 'T12:00:00') - new Date(deISO + 'T12:00:00')) / 86400000);
}
const noPeriodo = (data, ini, fim) => !!data && (!ini || data >= ini) && (!fim || data <= fim);

// ---------------------------------------------------------------------------
// Fretes e recebimentos
// ---------------------------------------------------------------------------
export const pesoEmToneladas = (valor, unidade) =>
  unidade === 'kg' ? Number(valor) / 1000 : Number(valor);

// Valor bruto em reais com 2 casas, arredondado como o PostgreSQL (meio para cima),
// usando aritmética inteira: peso com até 3 casas × preço em centavos.
export function valorBrutoFrete({ modalidade, peso_t, preco_t, valor_fechado }) {
  if (modalidade === 'fechado') return reais(centavos(valor_fechado));
  const pesoMilesimos = Math.round(Number(peso_t) * 1000);
  const precoCent = centavos(preco_t);
  return reais(Math.floor((pesoMilesimos * precoCent + 500) / 1000));
}

export const recebidoDoFrete = (d, freteId, excetoRecebimentoId = null) =>
  d.recebimentos
    .filter(r => r.frete_id === freteId && r.id !== excetoRecebimentoId)
    .reduce((s, r) => s + centavos(r.valor), 0);

export const aReceberDoFrete = (d, frete) =>
  centavos(frete.valor_bruto) - recebidoDoFrete(d, frete.id);

export function caminhaoDoFrete(d, frete) {
  return d.viagens.find(v => v.id === frete.viagem_id)?.caminhao_id ?? null;
}

// Recebimento de frete pertence ao caminhão da viagem; o avulso tem o caminhão próprio.
export function caminhaoDoRecebimento(d, r) {
  if (!r.frete_id) return r.caminhao_id ?? null;
  const f = d.fretes.find(x => x.id === r.frete_id);
  return f ? caminhaoDoFrete(d, f) : null;
}

// ---------------------------------------------------------------------------
// Viagem: diesel estimado e resultado estimado
// ---------------------------------------------------------------------------
export function resumoViagem(d, viagem) {
  const fretes = d.fretes.filter(f => f.viagem_id === viagem.id);
  const fretesC = fretes.reduce((s, f) => s + centavos(f.valor_bruto), 0);

  // Despesas ligadas à viagem. Abastecimentos nunca entram aqui (já há o diesel estimado).
  const despesas = d.despesas.filter(x => x.viagem_id === viagem.id && !x.abastecimento_id);
  const despesasC = despesas.reduce((s, x) => s + centavos(x.valor), 0);

  const faltando = [];
  let distancia = null;
  if (viagem.km_inicial == null || viagem.km_inicial === '') faltando.push('km inicial');
  if (viagem.km_final == null || viagem.km_final === '') faltando.push('km final');
  if (!faltando.length) distancia = Number(viagem.km_final) - Number(viagem.km_inicial);
  if (!Number(viagem.media_kml_ref)) faltando.push('média estimada (km/l)');
  if (viagem.preco_diesel_ref == null || viagem.preco_diesel_ref === '') faltando.push('preço de referência do diesel');

  let litros = null, dieselC = null;
  if (!faltando.length) {
    litros = distancia / Number(viagem.media_kml_ref);
    dieselC = Math.round(litros * Number(viagem.preco_diesel_ref) * 100);
  }

  const custosC = (dieselC ?? 0) + despesasC;
  return {
    fretes, fretesC, despesas, despesasC,
    distancia, litros, dieselC, faltando,
    completo: dieselC !== null,
    custosC,
    resultadoC: fretesC - custosC,
    custoKmC: dieselC !== null && distancia > 0 ? Math.round(custosC / distancia) : null,
  };
}

// ---------------------------------------------------------------------------
// Resumo financeiro por caminhão e período
// ---------------------------------------------------------------------------
export function resumoCaminhao(d, caminhaoId, ini, fim) {
  const viagensIds = new Set(d.viagens.filter(v => v.caminhao_id === caminhaoId).map(v => v.id));
  const fretes = d.fretes.filter(f => viagensIds.has(f.viagem_id));
  const fretesIds = new Set(fretes.map(f => f.id));
  const despesas = d.despesas.filter(x => x.caminhao_id === caminhaoId);

  const fretesPeriodo = fretes.filter(f => noPeriodo(f.data, ini, fim));
  // Avulsos (sem frete) são faturamento e recebimento ao mesmo tempo, na data em que entraram.
  const avulsosC = d.recebimentos
    .filter(r => !r.frete_id && r.caminhao_id === caminhaoId && noPeriodo(r.data, ini, fim))
    .reduce((s, r) => s + centavos(r.valor), 0);
  const faturadoC = fretesPeriodo.reduce((s, f) => s + centavos(f.valor_bruto), 0) + avulsosC;
  const recebidoC = d.recebimentos
    .filter(r => r.frete_id && fretesIds.has(r.frete_id) && noPeriodo(r.data, ini, fim))
    .reduce((s, r) => s + centavos(r.valor), 0) + avulsosC;
  const despesasC = despesas.filter(x => noPeriodo(x.data_gasto, ini, fim))
    .reduce((s, x) => s + centavos(x.valor), 0);
  const pagamentosC = despesas.filter(x => x.pago && noPeriodo(x.data_pagamento, ini, fim))
    .reduce((s, x) => s + centavos(x.valor), 0);
  const aReceberC = fretesPeriodo.reduce((s, f) => s + Math.max(0, aReceberDoFrete(d, f)), 0);

  return {
    faturadoC, recebidoC, despesasC, pagamentosC, aReceberC, avulsosC,
    resultadoC: faturadoC - despesasC,
    caixaC: recebidoC - pagamentosC,
  };
}

export function somarResumos(lista) {
  const total = { faturadoC: 0, recebidoC: 0, despesasC: 0, pagamentosC: 0, aReceberC: 0, resultadoC: 0, caixaC: 0, avulsosC: 0 };
  for (const r of lista) for (const k in total) total[k] += r[k];
  return total;
}

// ---------------------------------------------------------------------------
// Consumo real entre tanques completos
// ---------------------------------------------------------------------------
export function mediaReal(abastecimentos) {
  const lista = abastecimentos
    .filter(a => a.hodometro != null && a.hodometro !== '')
    .sort((a, b) => Number(a.hodometro) - Number(b.hodometro) || a.data.localeCompare(b.data));
  const trechos = [];
  let anterior = -1;
  for (let i = 0; i < lista.length; i++) {
    if (!lista[i].tanque_cheio) continue;
    if (anterior >= 0) {
      const km = Number(lista[i].hodometro) - Number(lista[anterior].hodometro);
      const litros = lista.slice(anterior + 1, i + 1).reduce((s, a) => s + Number(a.litros), 0);
      if (km > 0 && litros > 0) trechos.push({ km, litros, media: km / litros, ate: lista[i] });
    }
    anterior = i;
  }
  if (!trechos.length) return null;
  const km = trechos.reduce((s, t) => s + t.km, 0);
  const litros = trechos.reduce((s, t) => s + t.litros, 0);
  return { ultima: trechos.at(-1), geral: km / litros, km, litros, trechos: trechos.length };
}

// ---------------------------------------------------------------------------
// Manutenção prevista: vence pelo que chegar primeiro (km ou data)
// ---------------------------------------------------------------------------
export function statusPlano(plano, caminhao, hoje = hojeISO()) {
  if (!plano.ativo) return { estado: 'concluido', texto: 'Sem próximo vencimento' };
  const temKm = plano.proximo_km != null && plano.proximo_km !== '';
  const temData = !!plano.proxima_data;
  if (!temKm && !temData) return { estado: 'sem_prazo', texto: 'Sem prazo definido' };

  const kmRestante = temKm ? Number(plano.proximo_km) - Number(caminhao?.hodometro || 0) : null;
  const diasRestantes = temData ? diferencaDias(hoje, plano.proxima_data) : null;
  const partes = [];
  if (kmRestante !== null) {
    partes.push(kmRestante >= 0 ? `faltam ${fmtNum(kmRestante)} km` : `atrasada em ${fmtNum(-kmRestante)} km`);
  }
  if (diasRestantes !== null) {
    partes.push(diasRestantes >= 0 ? `faltam ${diasRestantes} dia(s)` : `atrasada em ${-diasRestantes} dia(s)`);
  }
  let estado = 'em_dia';
  if ((kmRestante !== null && kmRestante < 0) || (diasRestantes !== null && diasRestantes < 0)) {
    estado = 'atrasada';
  } else if ((kmRestante !== null && kmRestante <= Number(plano.aviso_km ?? 1000)) ||
             (diasRestantes !== null && diasRestantes <= Number(plano.aviso_dias ?? 30))) {
    estado = 'proxima';
  }
  return { estado, kmRestante, diasRestantes, texto: partes.join(' · ') };
}

// Ao registrar uma execução: calcula o próximo vencimento a partir dos intervalos.
// Sem intervalo, não inventa vencimento (plano fica sem próximo prazo).
export function proximoVencimento({ km, data, intervalo_km, intervalo_dias }) {
  const proximo_km = intervalo_km && km != null && km !== '' ? Number(km) + Number(intervalo_km) : null;
  const proxima_data = intervalo_dias && data ? somarDias(data, intervalo_dias) : null;
  return { proximo_km, proxima_data, ativo: proximo_km !== null || proxima_data !== null };
}

const fmtNum = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

// ---------------------------------------------------------------------------
// Painel: agregados por mês/ano (usam as mesmas regras do Resumo)
// ---------------------------------------------------------------------------
const p2 = n => String(n).padStart(2, '0');
export const fimDoMes = (ano, mes) => `${ano}-${p2(mes)}-${p2(new Date(ano, mes, 0).getDate())}`;

export function anosComDados(d) {
  const anos = new Set([Number(hojeISO().slice(0, 4))]);
  for (const f of d.fretes) if (f.data) anos.add(Number(f.data.slice(0, 4)));
  for (const x of d.despesas) if (x.data_gasto) anos.add(Number(x.data_gasto.slice(0, 4)));
  for (const r of d.recebimentos) if (!r.frete_id && r.data) anos.add(Number(r.data.slice(0, 4)));
  return [...anos].sort();
}

// Distância das viagens com km inicial e final, pela data de saída.
export function kmRodados(d, caminhaoIds, ini, fim) {
  return d.viagens
    .filter(v => caminhaoIds.includes(v.caminhao_id) && noPeriodo(v.data_inicio, ini, fim)
      && v.km_inicial != null && v.km_inicial !== '' && v.km_final != null && v.km_final !== '')
    .reduce((s, v) => s + (Number(v.km_final) - Number(v.km_inicial)), 0);
}

export function dieselNoPeriodo(d, caminhaoIds, ini, fim) {
  const abs = d.abastecimentos.filter(a => caminhaoIds.includes(a.caminhao_id) && noPeriodo(a.data, ini, fim));
  const litros = abs.reduce((s, a) => s + Number(a.litros), 0);
  const totalC = abs.reduce((s, a) => s + centavos(a.total), 0);
  return { litros, totalC, precoMedio: litros > 0 ? totalC / 100 / litros : null };
}

export function indicadores(d, caminhaoIds, ini, fim) {
  const r = somarResumos(caminhaoIds.map(id => resumoCaminhao(d, id, ini, fim)));
  const km = kmRodados(d, caminhaoIds, ini, fim);
  return {
    ...r, km, diesel: dieselNoPeriodo(d, caminhaoIds, ini, fim),
    margem: r.faturadoC > 0 ? r.resultadoC / r.faturadoC : null,
    custoKmC: km > 0 ? Math.round(r.despesasC / km) : null,
  };
}

export function serieMensal(d, caminhaoIds, ano) {
  return Array.from({ length: 12 }, (_, i) => {
    const ini = `${ano}-${p2(i + 1)}-01`, fim = fimDoMes(ano, i + 1);
    return { mes: i + 1, ...indicadores(d, caminhaoIds, ini, fim) };
  });
}

export function despesasPorCategoria(d, caminhaoIds, ini, fim) {
  const tot = {};
  for (const x of d.despesas) {
    if (!caminhaoIds.includes(x.caminhao_id) || !noPeriodo(x.data_gasto, ini, fim)) continue;
    tot[x.categoria] = (tot[x.categoria] || 0) + centavos(x.valor);
  }
  return Object.entries(tot).map(([categoria, c]) => ({ categoria, c })).sort((a, b) => b.c - a.c);
}

// ---------------------------------------------------------------------------
// Clientes: a receber e atrasados
// ---------------------------------------------------------------------------
export function fretesEmAberto(d, hoje = hojeISO()) {
  return d.fretes
    .map(f => ({ f, faltaC: aReceberDoFrete(d, f) }))
    .filter(x => x.faltaC > 0)
    .map(x => ({ ...x, atrasado: !!x.f.vencimento && x.f.vencimento < hoje }));
}

// Cliente é texto livre (sem cadastro). Registros antigos podem ter só o cliente_id.
export function clienteDe(d, x) {
  if (x?.cliente_nome) return x.cliente_nome.trim();
  return d.clientes?.find(c => c.id === x?.cliente_id)?.nome || '';
}
export const chaveCliente = nome => nome.trim().toLowerCase().replace(/\s+/g, ' ');

export function receberPorCliente(d, hoje = hojeISO()) {
  const porCliente = new Map();
  for (const x of fretesEmAberto(d, hoje)) {
    const nome = clienteDe(d, x.f);
    const k = chaveCliente(nome);
    const atual = porCliente.get(k) || { nome, aReceberC: 0, atrasadoC: 0, fretes: [] };
    atual.aReceberC += x.faltaC;
    if (x.atrasado) atual.atrasadoC += x.faltaC;
    atual.fretes.push(x);
    porCliente.set(k, atual);
  }
  return [...porCliente.values()].sort((a, b) => b.aReceberC - a.aReceberC);
}

// ---------------------------------------------------------------------------
// Boletos
// ---------------------------------------------------------------------------
export const soDigitos = s => String(s || '').replace(/\D/g, '');

function mod10(numero) {
  let soma = 0, peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    let p = Number(numero[i]) * peso;
    soma += p > 9 ? p - 9 : p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

// Lê a linha digitável: boleto bancário (47 dígitos) traz vencimento e valor;
// conta de consumo/tributo (48 dígitos, começa com 8) traz só o valor.
export function lerLinhaDigitavel(texto, hoje = hojeISO()) {
  const n = soDigitos(texto);
  if (n.length === 47) {
    const dvOk = mod10(n.slice(0, 9)) === Number(n[9]) && mod10(n.slice(10, 20)) === Number(n[20])
      && mod10(n.slice(21, 31)) === Number(n[31]);
    const fator = Number(n.slice(33, 37));
    const valor = Number(n.slice(37, 47)) / 100;
    let vencimento = null;
    if (fator >= 1000) {
      // O fator recomeçou em 1000 em 22/02/2025; escolhe a data mais próxima de hoje.
      const antiga = somarDias('1997-10-07', fator);
      const nova = somarDias('2025-02-22', fator - 1000);
      vencimento = Math.abs(diferencaDias(hoje, antiga)) < Math.abs(diferencaDias(hoje, nova)) ? antiga : nova;
    }
    return { tipo: 'bancario', digitos: n, dvOk, vencimento, valor: valor > 0 ? valor : null };
  }
  if (n.length === 48 && n[0] === '8') {
    const campos = [0, 12, 24, 36].map(i => n.slice(i, i + 11));
    const ref = n[2];
    const valor = ref === '6' || ref === '8' ? Number(campos.join('').slice(4, 15)) / 100 : null;
    return { tipo: 'arrecadacao', digitos: n, dvOk: true, vencimento: null, valor: valor > 0 ? valor : null };
  }
  return null;
}

export function formatarLinha(digitos) {
  const n = soDigitos(digitos);
  if (n.length === 47) {
    return `${n.slice(0, 5)}.${n.slice(5, 10)} ${n.slice(10, 15)}.${n.slice(15, 21)} ${n.slice(21, 26)}.${n.slice(26, 32)} ${n[32]} ${n.slice(33)}`;
  }
  if (n.length === 48) return n.match(/.{12}/g).join(' ');
  return n;
}

// Despesas com vencimento ainda não pagas, separadas por situação.
export function boletosEmAberto(d, hoje = hojeISO(), dias = 7) {
  const limite = somarDias(hoje, dias);
  const abertos = d.despesas.filter(x => !x.pago && x.vencimento)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  return {
    vencidos: abertos.filter(x => x.vencimento < hoje),
    proximos: abertos.filter(x => x.vencimento >= hoje && x.vencimento <= limite),
    depois: abertos.filter(x => x.vencimento > limite),
  };
}

// Datas das parcelas mensais a partir do 1º vencimento (31/01 → 28/02 → 31/03…).
export function vencimentosMensais(primeiro, quantidade) {
  const [a, m, d] = primeiro.split('-').map(Number);
  return Array.from({ length: quantidade }, (_, i) => {
    const total = m - 1 + i;
    const ano = a + Math.floor(total / 12), mes = total % 12 + 1;
    const dia = Math.min(d, new Date(ano, mes, 0).getDate());
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  });
}
