// Ajuda contextual "?": textos e comportamento (mouse, teclado e toque).

export const AJUDA = {
  caminhao: ['caminhão', 'Escolha o caminhão deste lançamento. As contas de cada veículo ficam separadas.'],
  hodometro: ['hodômetro', 'Quilometragem total mostrada no painel do caminhão nesta data.'],
  km_viagem: ['km inicial e final', 'Leituras do painel no início e no fim da viagem. A diferença calcula a distância percorrida.'],
  peso: ['peso da carga', 'Informe o peso efetivamente carregado, em toneladas. Exemplo: 32 t. Se escolher kg, o sistema converte (32.000 kg = 32 t).'],
  preco_t: ['valor por tonelada', 'Preço combinado para cada tonelada. Exemplo: 32 t × R$ 150 = R$ 4.800.'],
  valor_fechado: ['valor fechado', 'Use quando o frete tiver um preço combinado sem cálculo por tonelada.'],
  frete_bruto: ['frete bruto', 'Valor combinado da carga antes das despesas e dos recebimentos.'],
  recebido: ['valor recebido', 'Dinheiro que já entrou por este frete. Pode ser apenas uma parte do valor bruto.'],
  a_receber: ['a receber', 'Diferença entre o valor do frete e os recebimentos já lançados. No Resumo, considera os fretes do período escolhido.'],
  data_frete: ['data do frete', 'Data em que o frete foi realizado ou registrada como referência para o faturamento.'],
  data_recebimento: ['data do recebimento', 'Data em que o dinheiro entrou. Pode ser diferente da data do frete.'],
  datas_despesa: ['data do gasto e do pagamento', 'O gasto ocorreu nesta data; o pagamento é a data em que o dinheiro saiu.'],
  media_kml: ['média estimada', 'Quantos quilômetros o caminhão costuma rodar por litro. Usada para estimar diesel das viagens.'],
  preco_diesel_ref: ['preço de referência do diesel', 'Preço por litro usado para estimar o diesel desta viagem. Fica salvo na viagem.'],
  tanque_cheio: ['tanque completo', 'Marque apenas se o tanque foi completado. Duas marcações válidas ajudam a calcular o consumo real.'],
  diesel_estimado: ['diesel estimado', 'Distância da viagem ÷ média em km/l × preço por litro. É uma estimativa do diesel consumido, não o valor abastecido.'],
  abastecimento: ['abastecimento', 'Valor pago ao colocar diesel no tanque. Pode atender mais de uma viagem; não será somado novamente ao diesel estimado de uma viagem.'],
  despesa_viagem: ['despesa vinculada à viagem', 'Esta despesa entra no custo daquela viagem. Deixe sem viagem para gastos gerais do caminhão.'],
  resultado_viagem: ['resultado estimado da viagem', 'Fretes da viagem menos diesel estimado e outras despesas ligadas a ela. Pode faltar custo ainda não lançado.'],
  custo_km: ['custo por km', 'Custos estimados da viagem ÷ distância percorrida. Exemplo: R$ 2.370 ÷ 800 km = R$ 2,96/km.'],
  faturado: ['faturado', 'Soma dos fretes com data dentro do período escolhido.'],
  despesas: ['despesas registradas', 'Soma dos gastos com data do gasto dentro do período, pagos ou não. Inclui abastecimentos e manutenções.'],
  pagamentos: ['pagamentos', 'Soma das despesas pagas com data de pagamento dentro do período.'],
  resultado_caminhao: ['resultado operacional', 'Fretes cadastrados menos despesas registradas no período escolhido; depende dos lançamentos feitos. Não é lucro contábil.'],
  saldo_caixa: ['saldo de caixa', 'Recebimentos menos pagamentos nas datas escolhidas. É diferente do resultado dos fretes e não é o saldo bancário.'],
  proxima_manutencao: ['próxima manutenção', 'Km ou data previstos para o serviço. Se preencher os dois, vale o que chegar primeiro.'],
  alerta_manutencao: ['manutenção próxima ou atrasada', 'O aviso compara o km atual e a data de hoje com o prazo registrado para o serviço.'],
  intervalo: ['intervalo da manutenção', 'De quantos em quantos km e/ou dias o serviço se repete. Ao registrar a execução, o próximo vencimento é calculado. Exemplo: feito com 120.000 km, intervalo 20.000 → próximo em 140.000 km.'],
  aviso: ['faixa de aviso', 'Quanto antes do vencimento o sistema começa a avisar. Padrão: 1.000 km ou 30 dias.'],
  media_real: ['média real', 'Km rodados entre dois tanques completos ÷ litros abastecidos nesse intervalo (inclusive abastecimentos parciais no meio).'],
  cliente: ['cliente', 'Quem contratou o frete. Serve para ver quanto cada cliente deve. Cadastre clientes na tela Clientes.'],
  vencimento: ['vencimento do pagamento', 'Data combinada para o cliente pagar. Depois dela, o valor que falta aparece como atrasado.'],
  atrasados: ['recebimentos atrasados', 'Fretes com vencimento já passado e que ainda têm valor a receber.'],
  margem: ['margem', 'Resultado operacional ÷ faturamento. Exemplo: R$ 2.000 de resultado em R$ 10.000 faturados = 20%.'],
  custo_km_periodo: ['custo por km', 'Despesas registradas no período ÷ km rodados nas viagens do período (pela data de saída).'],
  km_rodados: ['km rodados', 'Soma das distâncias das viagens (km final − km inicial), pela data de saída. Viagens sem km final não entram.'],
  preco_medio_diesel: ['preço médio do diesel', 'Total pago em abastecimentos ÷ litros abastecidos.'],
  boleto: ['boleto', 'Marque para contas com data de vencimento (parcela do caminhão, oficina, seguro…). Elas aparecem na tela Boletos e avisam quando vão vencer.'],
  linha_digitavel: ['código do boleto', 'Os números embaixo ou em cima do código de barras. Ao colar, o sistema lê o vencimento e o valor sozinho. Pode deixar em branco.'],
  vencimento_boleto: ['vencimento', 'Último dia para pagar sem juros. Boletos não pagos aparecem como atrasados depois desta data.'],
  parcelas: ['parcelas', 'Para compras parceladas: o sistema cria uma conta por mês, a partir do 1º vencimento. Exemplo: 10 parcelas de R$ 1.500, a 1ª em 10/11.'],
  boletos_vencer: ['boletos a pagar', 'Boletos ainda não pagos que já venceram ou vencem nos próximos 7 dias.'],
  caminhao_desativado: ['caminhão desativado', 'Caminhão vendido ou parado. Não aparece para novos lançamentos, mas todo o histórico continua nos relatórios. Use Reativar para voltar a usar.'],
  status_viagem: ['situação da viagem', 'Planejada, em andamento, concluída ou cancelada. Serve para organizar a lista.'],
};

// `extra` (HTML opcional) aparece em "Entenda o cálculo" com os valores usados.
export function iconeAjuda(chave, extra = '') {
  const [nome, texto] = AJUDA[chave] || [chave, ''];
  return `<button type="button" class="ajuda" aria-label="Ajuda sobre ${nome}" aria-expanded="false" data-ajuda="${esc(texto)}"${extra ? ` data-extra="${esc(extra)}"` : ''}>?</button>`;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// ---------------------------------------------------------------------------
// Comportamento: um único balão reaproveitado para todos os ícones.
// ---------------------------------------------------------------------------
let balao, atual = null, fixo = false;

export function iniciarAjuda() {
  balao = document.createElement('div');
  balao.className = 'balao-ajuda';
  balao.id = 'balao-ajuda';
  balao.setAttribute('role', 'tooltip');
  balao.hidden = true;
  document.body.appendChild(balao);

  const hover = matchMedia('(hover: hover)');

  document.addEventListener('mouseover', e => {
    const b = e.target.closest?.('.ajuda');
    if (b && hover.matches && !fixo) mostrar(b);
  });
  document.addEventListener('mouseout', e => {
    const b = e.target.closest?.('.ajuda');
    if (b && b === atual && !fixo && !b.contains(e.relatedTarget)) esconder();
  });
  document.addEventListener('focusin', e => {
    const b = e.target.closest?.('.ajuda');
    if (b) { fixo = false; mostrar(b); } else if (atual && !fixo) esconder();
  });
  document.addEventListener('focusout', e => {
    if (e.target === atual && !fixo) esconder();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('.ajuda');
    if (b) {
      e.preventDefault();
      if (atual === b && fixo) { esconder(); return; }
      mostrar(b); fixo = true;
      return;
    }
    if (atual && !balao.contains(e.target)) esconder();
  });
  document.addEventListener('keydown', e => {
    // Fecha só o balão, sem fechar o formulário aberto por baixo.
    if (e.key === 'Escape' && atual) { e.preventDefault(); e.stopPropagation(); esconder(); }
  }, true);
  addEventListener('scroll', () => atual && posicionar(atual), true);
  addEventListener('resize', () => atual && posicionar(atual));
}

function mostrar(botao) {
  if (atual && atual !== botao) atual.setAttribute('aria-expanded', 'false');
  atual = botao;
  // Dentro de um <dialog> aberto, o balão precisa estar no próprio diálogo (camada superior).
  const pai = botao.closest('dialog') || document.body;
  if (balao.parentNode !== pai) pai.appendChild(balao);
  balao.textContent = botao.dataset.ajuda;
  if (botao.dataset.extra) {
    const det = document.createElement('details');
    det.innerHTML = `<summary>Entenda o cálculo</summary><div>${botao.dataset.extra}</div>`;
    balao.appendChild(det);
  }
  balao.hidden = false;
  botao.setAttribute('aria-expanded', 'true');
  botao.setAttribute('aria-describedby', 'balao-ajuda');
  posicionar(botao);
}

function esconder() {
  if (atual) {
    atual.setAttribute('aria-expanded', 'false');
    atual.removeAttribute('aria-describedby');
  }
  atual = null; fixo = false;
  balao.hidden = true;
}

function posicionar(botao) {
  const r = botao.getBoundingClientRect();
  const largura = Math.min(300, innerWidth - 24);
  balao.style.maxWidth = largura + 'px';
  const left = Math.max(12, Math.min(r.left + r.width / 2 - largura / 2, innerWidth - largura - 12));
  balao.style.left = left + 'px';
  const altura = balao.offsetHeight;
  const embaixo = r.bottom + 8 + altura < innerHeight || r.top < altura + 16;
  balao.style.top = (embaixo ? r.bottom + 8 : r.top - altura - 8) + 'px';
}
