// Relatório em Excel (SheetJS, carregado só quando pedido).
import { D } from './state.js';
import * as S from './state.js';
import { carregarScript } from './painel.js';
import { nomeCategoria, nomeStatus } from './forms.js';
import {
  centavos, serieMensal, resumoCaminhao, recebidoDoFrete, caminhaoDoFrete, receberPorCliente, hojeISO,
  caminhaoDoRecebimento, clienteDe,
} from './calc.js';

const XLSX_JS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const r$ = c => Math.round(c) / 100;
const data = iso => iso ? new Date(iso + 'T12:00:00') : null;
const placa = id => S.caminhao(id)?.placa || '';
const noAno = (iso, ano) => !!iso && iso.startsWith(String(ano));

export async function baixarExcel({ ano, caminhao }) {
  await carregarScript(XLSX_JS);
  const XLSX = window.XLSX;
  const ids = caminhao ? [caminhao] : D.caminhoes.map(c => c.id);
  const doFiltro = x => ids.includes(x.caminhao_id);
  const wb = XLSX.utils.book_new();
  const aba = (nome, linhas) => {
    const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Aviso: 'Sem registros' }], { dateNF: 'dd/mm/yyyy', cellDates: true });
    const cab = Object.keys(linhas[0] || { Aviso: '' });
    ws['!cols'] = cab.map(k => ({ wch: Math.max(12, k.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, nome);
  };

  aba('Mensal', serieMensal(D, ids, ano).map(m => ({
    'Mês': MESES[m.mes - 1], 'Faturamento': r$(m.faturadoC), 'Recebido': r$(m.recebidoC), 'Despesas': r$(m.despesasC),
    'Pagamentos': r$(m.pagamentosC), 'Resultado': r$(m.resultadoC), 'Saldo de caixa': r$(m.caixaC),
    'Km rodados': m.km, 'Diesel (litros)': Math.round(m.diesel.litros * 1000) / 1000, 'Diesel (R$)': r$(m.diesel.totalC),
  })));
  aba('Por caminhão', ids.map(id => {
    const c = S.caminhao(id), r = resumoCaminhao(D, id, `${ano}-01-01`, `${ano}-12-31`);
    return { 'Caminhão': c.modelo, 'Placa': c.placa, 'Faturamento': r$(r.faturadoC), 'Recebido': r$(r.recebidoC),
      'A receber': r$(r.aReceberC), 'Despesas': r$(r.despesasC), 'Pagamentos': r$(r.pagamentosC),
      'Resultado': r$(r.resultadoC), 'Saldo de caixa': r$(r.caixaC) };
  }));
  const fretes = D.fretes.filter(f => ids.includes(caminhaoDoFrete(D, f)) && noAno(f.data, ano));
  aba('Fretes', S.ordenarPorData(fretes).reverse().map(f => {
    const v = S.viagem(f.viagem_id), rec = recebidoDoFrete(D, f.id);
    return { 'Data': data(f.data), 'Placa': placa(v?.caminhao_id), 'Cliente': clienteDe(D, f),
      'Origem': f.origem || '', 'Destino': f.destino || '', 'Peso (t)': f.peso_t != null ? Number(f.peso_t) : '',
      'Cobrança': f.modalidade === 'tonelada' ? 'Por tonelada' : 'Valor fechado', 'R$/t': f.preco_t != null ? Number(f.preco_t) : '',
      'Valor bruto': Number(f.valor_bruto), 'Recebido': r$(rec), 'A receber': r$(centavos(f.valor_bruto) - rec),
      'Vencimento': data(f.vencimento), 'Situação da viagem': nomeStatus(v?.status), 'Lançado por': S.autor(f) };
  }));
  aba('Recebimentos', S.ordenarPorData(D.recebimentos.filter(r =>
    ids.includes(caminhaoDoRecebimento(D, r)) && noAno(r.data, ano))).reverse().map(r => {
    const f = r.frete_id && S.frete(r.frete_id);
    return { 'Data': data(r.data), 'Placa': placa(caminhaoDoRecebimento(D, r)),
      'Tipo': f ? 'Frete' : 'Avulso', 'Cliente': clienteDe(D, f || r),
      'Frete / descrição': f ? `${f.origem || '?'} → ${f.destino || '?'}` : (r.descricao || ''),
      'Valor': Number(r.valor), 'Observação': r.observacao || '', 'Lançado por': S.autor(r) };
  }));
  aba('Despesas', S.ordenarPorData(D.despesas.filter(x => doFiltro(x) && noAno(x.data_gasto, ano)), 'data_gasto').reverse().map(x => ({
    'Data do gasto': data(x.data_gasto), 'Placa': placa(x.caminhao_id), 'Categoria': nomeCategoria(x.categoria),
    'Descrição': x.descricao || '', 'Valor': Number(x.valor), 'Situação': x.pago ? 'Pago' : 'Pendente',
    'Data do pagamento': data(x.data_pagamento), 'Fornecedor': x.fornecedor || '', 'Vencimento': data(x.vencimento),
    'Parcela': x.total_parcelas > 1 ? `${x.parcela}/${x.total_parcelas}` : '', 'Código do boleto': x.linha_digitavel || '',
    'Origem': x.abastecimento_id ? 'Abastecimento' : x.manutencao_id ? 'Manutenção' : x.vencimento ? 'Boleto' : 'Lançamento',
    'Lançado por': S.autor(x),
  })));
  aba('Abastecimentos', S.ordenarPorData(D.abastecimentos.filter(a => doFiltro(a) && noAno(a.data, ano))).reverse().map(a => ({
    'Data': data(a.data), 'Placa': placa(a.caminhao_id), 'Hodômetro': a.hodometro != null ? Number(a.hodometro) : '',
    'Litros': Number(a.litros), 'R$/litro': Number(a.preco_litro), 'Total': Number(a.total), 'Posto': a.posto || '',
    'Tanque completo': a.tanque_cheio ? 'Sim' : 'Não', 'Lançado por': S.autor(a),
  })));
  aba('Manutenções', S.ordenarPorData(D.manutencoes.filter(m => doFiltro(m) && noAno(m.data, ano))).reverse().map(m => ({
    'Data': data(m.data), 'Placa': placa(m.caminhao_id), 'Km': m.km != null ? Number(m.km) : '', 'Serviço': m.servico,
    'Custo': Number(m.custo), 'Oficina': m.oficina || '', 'Lançado por': S.autor(m),
  })));
  aba('Boletos em aberto', D.despesas.filter(x => !x.pago && x.vencimento && ids.includes(x.caminhao_id))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map(x => ({
      'Vencimento': data(x.vencimento), 'Placa': placa(x.caminhao_id), 'Fornecedor': x.fornecedor || '',
      'Categoria': nomeCategoria(x.categoria), 'Descrição': x.descricao || '', 'Valor': Number(x.valor),
      'Parcela': x.total_parcelas > 1 ? `${x.parcela}/${x.total_parcelas}` : '', 'Situação': x.vencimento < hojeISO() ? 'Vencido' : 'A vencer',
      'Código do boleto': x.linha_digitavel || '',
    })));
  aba('A receber por cliente', receberPorCliente(D).map(x => ({
    'Cliente': x.nome || 'Sem cliente', 'A receber (hoje)': r$(x.aReceberC),
    'Atrasado (hoje)': r$(x.atrasadoC), 'Fretes em aberto': x.fretes.length,
  })));

  const sufixo = caminhao ? '-' + placa(caminhao) : '';
  XLSX.writeFile(wb, `cabral-frota-${ano}${sufixo}-${hojeISO()}.xlsx`, { cellDates: true });
}
