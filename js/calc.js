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
  const faturadoC = fretesPeriodo.reduce((s, f) => s + centavos(f.valor_bruto), 0);
  const recebidoC = d.recebimentos
    .filter(r => fretesIds.has(r.frete_id) && noPeriodo(r.data, ini, fim))
    .reduce((s, r) => s + centavos(r.valor), 0);
  const despesasC = despesas.filter(x => noPeriodo(x.data_gasto, ini, fim))
    .reduce((s, x) => s + centavos(x.valor), 0);
  const pagamentosC = despesas.filter(x => x.pago && noPeriodo(x.data_pagamento, ini, fim))
    .reduce((s, x) => s + centavos(x.valor), 0);
  const aReceberC = fretesPeriodo.reduce((s, f) => s + Math.max(0, aReceberDoFrete(d, f)), 0);

  return {
    faturadoC, recebidoC, despesasC, pagamentosC, aReceberC,
    resultadoC: faturadoC - despesasC,
    caixaC: recebidoC - pagamentosC,
  };
}

export function somarResumos(lista) {
  const total = { faturadoC: 0, recebidoC: 0, despesasC: 0, pagamentosC: 0, aReceberC: 0, resultadoC: 0, caixaC: 0 };
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
