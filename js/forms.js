// Formulários de cadastro e lançamento.
import * as S from './state.js';
import { D } from './state.js';
import {
  esc, campo, selecao, caixa, abrirFormulario, valoresDe, exigir, numeroCampo,
  lerNumero, paraCampo, moedaC, num, rotuloCaminhao, aviso,
} from './ui.js';
import { iconeAjuda } from './help.js';
import {
  valorBrutoFrete, pesoEmToneladas, centavos, aReceberDoFrete, recebidoDoFrete,
  hojeISO, proximoVencimento, lerLinhaDigitavel, formatarLinha, soDigitos, vencimentosMensais,
} from './calc.js';

export const CATEGORIAS = [
  ['diesel', 'Diesel'], ['pedagio', 'Pedágio'], ['alimentacao', 'Alimentação'],
  ['manutencao', 'Manutenção'], ['pneus', 'Pneus'], ['comissao', 'Comissão/motorista'],
  ['financiamento', 'Parcela/financiamento'], ['seguro', 'Seguro'], ['impostos', 'Impostos e taxas'], ['outros', 'Outros'],
];
export const STATUS_VIAGEM = [
  ['planejada', 'Planejada'], ['em_andamento', 'Em andamento'], ['concluida', 'Concluída'], ['cancelada', 'Cancelada'],
];
export const nomeCategoria = c => (CATEGORIAS.find(x => x[0] === c) || [, c])[1];
export const nomeStatus = s => (STATUS_VIAGEM.find(x => x[0] === s) || [, s])[1];

let aoMudar = () => {};
export const definirAoMudar = fn => { aoMudar = fn; };
const concluir = msg => { aviso(msg); aoMudar(); };

// Opções de caminhão: ativos, mais o atual (mesmo inativo) ao editar.
function opcoesCaminhao(atualId) {
  return D.caminhoes
    .filter(c => c.ativo || c.id === atualId)
    .map(c => [c.id, rotuloCaminhao(c) + (c.ativo ? '' : ' (inativo)')]);
}

function campoCaminhao(valor) {
  const ops = opcoesCaminhao(valor);
  exigir(ops.length, 'Cadastre um caminhão antes de fazer lançamentos.');
  return selecao({ nome: 'caminhao_id', rotulo: 'Caminhão', opcoes: ops, valor: valor || (ops.length === 1 ? ops[0][0] : ''),
    ajuda: 'caminhao', obrigatorio: true, vazio: ops.length > 1 ? 'Selecione…' : null });
}

// Faixa no topo do formulário que sempre mostra modelo e placa escolhidos.
function faixa(id) {
  const c = S.caminhao(id);
  return c ? `🚚 <strong>${esc(c.modelo)}</strong> · placa <strong>${esc(c.placa)}</strong>` : 'Selecione o caminhão';
}
function ligarFaixa(form, aoTrocar) {
  const sel = form.querySelector('[name=caminhao_id]');
  const el = form.closest('dialog').querySelector('.faixa-caminhao');
  if (!sel) return;
  const atualizar = () => { el.innerHTML = faixa(sel.value); aoTrocar?.(sel.value); };
  sel.addEventListener('change', atualizar);
  atualizar();
}

const pagamentoCampos = (pago, dataPag, padraoPago) => `
  <fieldset class="grupo"><legend>Pagamento ${iconeAjuda('datas_despesa')}</legend>
    ${caixa({ nome: 'pago', rotulo: 'Já foi pago', marcado: pago ?? padraoPago })}
    ${campo({ nome: 'data_pagamento', rotulo: 'Data do pagamento', tipo: 'date', valor: dataPag })}
  </fieldset>`;

function lerPagamento(v, dataGasto) {
  if (!v.pago) return { pago: false, data_pagamento: null };
  return { pago: true, data_pagamento: v.data_pagamento || dataGasto };
}

function ligarPagamento(form, campoData) {
  const pago = form.querySelector('[name=pago]');
  const dataPag = form.querySelector('[data-campo=data_pagamento]');
  const atualizar = () => {
    dataPag.hidden = !pago.checked;
    const inp = dataPag.querySelector('input');
    if (pago.checked && !inp.value) inp.value = form.querySelector(`[name=${campoData}]`).value;
  };
  pago.addEventListener('change', atualizar);
  atualizar();
}

// ---------------------------------------------------------------------------
// Caminhão
// ---------------------------------------------------------------------------
export function formCaminhao(c = null) {
  abrirFormulario({
    titulo: c ? 'Editar caminhão' : 'Novo caminhão',
    html: `
      ${campo({ nome: 'modelo', rotulo: 'Modelo', valor: c?.modelo, obrigatorio: true, attrs: 'placeholder="Ex.: Volvo FH 540"' })}
      ${campo({ nome: 'placa', rotulo: 'Placa', valor: c?.placa, obrigatorio: true, attrs: 'placeholder="ABC1D23" style="text-transform:uppercase" maxlength="8"' })}
      <div class="linha">
        ${campo({ nome: 'ano', rotulo: 'Ano (opcional)', tipo: 'numero', valor: c?.ano })}
        ${campo({ nome: 'media_kml', rotulo: 'Média estimada (km/l)', tipo: 'numero', valor: paraCampo(c?.media_kml), ajuda: 'media_kml', attrs: 'placeholder="2,5"' })}
      </div>
      ${c ? '' : campo({ nome: 'hodometro', rotulo: 'Hodômetro atual (km)', tipo: 'numero', valor: '', ajuda: 'hodometro', obrigatorio: true })}
      ${c ? caixa({ nome: 'ativo', rotulo: 'Caminhão ativo', marcado: c.ativo }) : ''}`,
    async aoSalvar(form) {
      const v = valoresDe(form);
      exigir(v.modelo, 'Preencha o modelo.');
      const placa = v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
      exigir(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa), 'Placa inválida. Use o formato ABC1234 ou ABC1D23.');
      exigir(!D.caminhoes.some(x => x.placa === placa && x.id !== c?.id), 'Já existe um caminhão com essa placa.');
      const ano = numeroCampo(v.ano, 'ano');
      exigir(ano === null || (Number.isInteger(ano) && ano > 1950 && ano < 2100), 'Ano inválido.');
      const dados = { modelo: v.modelo, placa, ano, media_kml: numeroCampo(v.media_kml, 'média', { positivo: true }) };
      if (!c) dados.hodometro = numeroCampo(v.hodometro, 'o hodômetro', { obrigatorio: true, minimo: 0 });
      dados.ativo = c ? v.ativo : true;
      await S.salvarCaminhao(c?.id, dados);
      concluir('Caminhão salvo.');
    },
  });
}

export function formCliente(cl = null) {
  abrirFormulario({
    titulo: cl ? 'Editar cliente' : 'Novo cliente',
    html: `
      ${campo({ nome: 'nome', rotulo: 'Nome', valor: cl?.nome, obrigatorio: true, attrs: 'placeholder="Ex.: Cooperativa Agro Sul"' })}
      <div class="linha">
        ${campo({ nome: 'documento', rotulo: 'CNPJ/CPF (opcional)', valor: cl?.documento })}
        ${campo({ nome: 'telefone', rotulo: 'Telefone (opcional)', tipo: 'tel', valor: cl?.telefone })}
      </div>
      ${campo({ nome: 'observacao', rotulo: 'Observação', tipo: 'textarea', valor: cl?.observacao })}
      ${cl ? caixa({ nome: 'ativo', rotulo: 'Cliente ativo', marcado: cl.ativo }) : ''}`,
    async aoSalvar(form) {
      const v = valoresDe(form);
      exigir(v.nome, 'Preencha o nome.');
      exigir(!D.clientes.some(x => x.nome.toLowerCase() === v.nome.toLowerCase() && x.id !== cl?.id), 'Já existe um cliente com esse nome.');
      await S.salvarCliente(cl?.id, { nome: v.nome, documento: v.documento || null, telefone: v.telefone || null,
        observacao: v.observacao || null, ativo: cl ? v.ativo : true });
      concluir('Cliente salvo.');
    },
  });
}

export function formHodometro(c) {
  abrirFormulario({
    titulo: 'Corrigir hodômetro',
    subtitulo: faixa(c.id),
    html: `<p class="nota">O hodômetro sobe sozinho com viagens, abastecimentos e manutenções. Use esta correção apenas se o valor estiver errado — ela pode diminuir o número.</p>
      ${campo({ nome: 'hodometro', rotulo: 'Hodômetro correto (km)', tipo: 'numero', valor: paraCampo(c.hodometro, 1), ajuda: 'hodometro', obrigatorio: true })}`,
    textoSalvar: 'Corrigir',
    async aoSalvar(form) {
      const n = numeroCampo(valoresDe(form).hodometro, 'o hodômetro', { obrigatorio: true, minimo: 0 });
      await S.corrigirHodometro(c.id, n);
      concluir('Hodômetro corrigido.');
    },
  });
}

// ---------------------------------------------------------------------------
// Frete (campos reaproveitados no formulário de viagem)
// ---------------------------------------------------------------------------
function camposFrete(f, dataPadrao) {
  const mod = f?.modalidade || 'tonelada';
  return `
    ${campo({ nome: 'f_data', rotulo: 'Data do frete', tipo: 'date', valor: f?.data || dataPadrao, ajuda: 'data_frete', obrigatorio: true })}
    <div class="linha">
      ${campo({ nome: 'f_origem', rotulo: 'Origem da carga', valor: f?.origem })}
      ${campo({ nome: 'f_destino', rotulo: 'Destino da carga', valor: f?.destino })}
    </div>
    <div class="linha">
      ${selecao({ nome: 'f_cliente_id', rotulo: 'Cliente', ajuda: 'cliente', vazio: 'Sem cliente',
        opcoes: D.clientes.filter(c => c.ativo || c.id === f?.cliente_id).map(c => [c.id, c.nome]), valor: f?.cliente_id })}
      ${campo({ nome: 'f_vencimento', rotulo: 'Vencimento do pagamento', tipo: 'date', valor: f?.vencimento, ajuda: 'vencimento' })}
    </div>
    <div class="segmentado" role="radiogroup" aria-label="Forma de cobrança">
      <label><input type="radio" name="f_modalidade" value="tonelada" ${mod === 'tonelada' ? 'checked' : ''}> Por tonelada</label>
      <label><input type="radio" name="f_modalidade" value="fechado" ${mod === 'fechado' ? 'checked' : ''}> Valor fechado</label>
    </div>
    <div class="linha">
      ${campo({ nome: 'f_peso', rotulo: 'Peso da carga', tipo: 'numero', valor: paraCampo(f?.peso_t, 3), ajuda: 'peso', attrs: 'placeholder="32"' })}
      ${selecao({ nome: 'f_unidade', rotulo: 'Unidade', opcoes: [['t', 'toneladas (t)'], ['kg', 'quilos (kg)']], valor: 't' })}
    </div>
    <div data-mod="tonelada">${campo({ nome: 'f_preco_t', rotulo: 'Valor por tonelada (R$)', tipo: 'numero', valor: paraCampo(f?.preco_t), ajuda: 'preco_t', attrs: 'placeholder="150,00"' })}</div>
    <div data-mod="fechado">${campo({ nome: 'f_valor_fechado', rotulo: 'Valor fechado (R$)', tipo: 'numero', valor: paraCampo(f?.valor_fechado), ajuda: 'valor_fechado' })}</div>
    <p class="calculo" aria-live="polite"><span>Frete bruto ${iconeAjuda('frete_bruto')}</span> <strong data-bruto>—</strong></p>`;
}

function ligarFrete(form) {
  const atualizar = () => {
    const mod = form.querySelector('[name=f_modalidade]:checked').value;
    form.querySelectorAll('[data-mod]').forEach(el => { el.hidden = el.dataset.mod !== mod; });
    form.querySelector('[data-campo=f_peso] .rotulo label').firstChild.textContent =
      mod === 'tonelada' ? 'Peso da carga' : 'Peso da carga (opcional)';
    const out = form.querySelector('[data-bruto]');
    try {
      const f = lerFrete(valoresDe(form), true);
      out.textContent = f ? moedaC(centavos(f.valor_bruto)) +
        (mod === 'tonelada' ? ` (${num(f.peso_t, 3)} t × ${moedaC(centavos(f.preco_t))})` : '') : '—';
    } catch { out.textContent = '—'; }
  };
  form.addEventListener('input', atualizar);
  form.addEventListener('change', atualizar);
  atualizar();
}

function lerFrete(v, previa = false) {
  const modalidade = v.f_modalidade;
  const pesoDigitado = numeroCampo(v.f_peso, 'o peso', { positivo: true, obrigatorio: modalidade === 'tonelada' && !previa });
  const peso_t = pesoDigitado === null ? null : Math.round(pesoEmToneladas(pesoDigitado, v.f_unidade) * 1000) / 1000;
  if (peso_t !== null) exigir(peso_t > 0, 'Peso muito pequeno.');
  const f = { data: v.f_data, origem: v.f_origem || null, destino: v.f_destino || null, modalidade, peso_t,
    cliente_id: v.f_cliente_id || null, vencimento: v.f_vencimento || null };
  if (modalidade === 'tonelada') {
    f.preco_t = numeroCampo(v.f_preco_t, 'o valor por tonelada', { obrigatorio: !previa, minimo: 0 });
    if (f.preco_t !== null) f.preco_t = centavos(f.preco_t) / 100;
    f.valor_fechado = null;
    if (previa && (f.preco_t === null || peso_t === null)) return null;
  } else {
    f.valor_fechado = numeroCampo(v.f_valor_fechado, 'o valor fechado', { obrigatorio: !previa, minimo: 0 });
    if (f.valor_fechado !== null) f.valor_fechado = centavos(f.valor_fechado) / 100;
    f.preco_t = null;
    if (previa && f.valor_fechado === null) return null;
  }
  if (!previa) exigir(f.data, 'Preencha a data do frete.');
  f.valor_bruto = valorBrutoFrete(f);
  return f;
}

export function formFrete(viagemId, f = null) {
  const vg = S.viagem(viagemId);
  abrirFormulario({
    titulo: f ? 'Editar frete' : 'Adicionar frete',
    subtitulo: faixa(vg.caminhao_id),
    html: camposFrete(f, vg.data_inicio),
    aoMontar: ligarFrete,
    async aoSalvar(form) {
      const dados = lerFrete(valoresDe(form));
      if (f) {
        const recebido = recebidoDoFrete(D, f.id);
        exigir(centavos(dados.valor_bruto) >= recebido,
          `Já foram recebidos ${moedaC(recebido)} deste frete; o valor não pode ficar menor que isso.`);
      }
      await S.salvarFrete(f?.id, { ...dados, viagem_id: viagemId });
      concluir('Frete salvo.');
    },
  });
}

// ---------------------------------------------------------------------------
// Viagem (ao criar, já inclui o primeiro frete)
// ---------------------------------------------------------------------------
export function formViagem(vg = null, caminhaoId = null) {
  const novo = !vg;
  const hoje = hojeISO();
  abrirFormulario({
    titulo: novo ? 'Nova viagem' : 'Editar viagem',
    subtitulo: ' ',
    html: `
      ${campoCaminhao(vg?.caminhao_id || caminhaoId)}
      <div class="linha">
        ${campo({ nome: 'data_inicio', rotulo: 'Data de saída', tipo: 'date', valor: vg?.data_inicio || hoje, obrigatorio: true })}
        ${campo({ nome: 'data_fim', rotulo: 'Data de chegada', tipo: 'date', valor: vg?.data_fim })}
      </div>
      <div class="linha">
        ${campo({ nome: 'origem', rotulo: 'Origem', valor: vg?.origem })}
        ${campo({ nome: 'destino', rotulo: 'Destino', valor: vg?.destino })}
      </div>
      <div class="linha">
        ${campo({ nome: 'km_inicial', rotulo: 'Km inicial', tipo: 'numero', valor: paraCampo(vg?.km_inicial, 1), ajuda: 'km_viagem' })}
        ${campo({ nome: 'km_final', rotulo: 'Km final', tipo: 'numero', valor: paraCampo(vg?.km_final, 1), ajuda: 'km_viagem' })}
      </div>
      ${selecao({ nome: 'status', rotulo: 'Situação', opcoes: STATUS_VIAGEM, valor: vg?.status || 'em_andamento', ajuda: 'status_viagem' })}
      <fieldset class="grupo"><legend>Estimativa de diesel ${iconeAjuda('diesel_estimado')}</legend>
        <div class="linha">
          ${campo({ nome: 'media_kml_ref', rotulo: 'Média (km/l)', tipo: 'numero', valor: paraCampo(vg?.media_kml_ref), ajuda: 'media_kml' })}
          ${campo({ nome: 'preco_diesel_ref', rotulo: 'Diesel (R$/l)', tipo: 'numero', valor: paraCampo(vg?.preco_diesel_ref, 3), ajuda: 'preco_diesel_ref' })}
        </div>
        <p class="calculo" aria-live="polite"><span>Diesel estimado</span> <strong data-diesel>—</strong></p>
      </fieldset>
      ${novo ? `<fieldset class="grupo"><legend>Primeiro frete</legend>${camposFrete(null, hoje)}</fieldset>` : ''}
      ${campo({ nome: 'observacao', rotulo: 'Observação', tipo: 'textarea', valor: vg?.observacao })}`,
    aoMontar(form) {
      ligarFaixa(form, id => {
        if (!novo || !id) return;
        const c = S.caminhao(id);
        // Sugestões a partir do caminhão; ficam salvas na viagem.
        const set = (n, val) => { const el = form.querySelector(`[name=${n}]`); if (val != null) el.value = val; };
        set('km_inicial', paraCampo(c.hodometro, 1));
        set('media_kml_ref', paraCampo(c.media_kml));
        set('preco_diesel_ref', paraCampo(S.ultimoPrecoDiesel(id), 3));
      });
      if (novo) {
        ligarFrete(form);
        form.querySelector('[name=data_inicio]').addEventListener('change', e => {
          form.querySelector('[name=f_data]').value = e.target.value;
        });
      }
      const previaDiesel = () => {
        const v = valoresDe(form);
        const ki = lerNumero(v.km_inicial), kf = lerNumero(v.km_final);
        const m = lerNumero(v.media_kml_ref), p = lerNumero(v.preco_diesel_ref);
        const out = form.querySelector('[data-diesel]');
        const falta = [];
        if (ki == null || kf == null) falta.push('km inicial e final');
        if (!m) falta.push('média');
        if (p == null) falta.push('preço do diesel');
        if (falta.length) { out.textContent = `Diesel ainda não calculado — falta ${falta.join(', ')}`; return; }
        if (kf < ki) { out.textContent = 'Km final menor que o inicial'; return; }
        const dist = kf - ki, litros = dist / m;
        out.textContent = `${num(dist)} km ÷ ${num(m, 2)} km/l = ${num(litros)} l × R$ ${num(p, 3)} = ${moedaC(Math.round(litros * p * 100))}`;
      };
      form.addEventListener('input', previaDiesel);
      form.addEventListener('change', previaDiesel);
      previaDiesel();
    },
    async aoSalvar(form) {
      const v = valoresDe(form);
      exigir(v.caminhao_id, 'Escolha o caminhão.');
      exigir(v.data_inicio, 'Preencha a data de saída.');
      exigir(!v.data_fim || v.data_fim >= v.data_inicio, 'A data de chegada não pode ser antes da saída.');
      const dados = {
        caminhao_id: v.caminhao_id, data_inicio: v.data_inicio, data_fim: v.data_fim || null,
        origem: v.origem || null, destino: v.destino || null,
        km_inicial: numeroCampo(v.km_inicial, 'o km inicial', { minimo: 0 }),
        km_final: numeroCampo(v.km_final, 'o km final', { minimo: 0 }),
        status: v.status,
        media_kml_ref: numeroCampo(v.media_kml_ref, 'a média', { positivo: true }),
        preco_diesel_ref: numeroCampo(v.preco_diesel_ref, 'o preço do diesel', { minimo: 0 }),
        observacao: v.observacao || null,
      };
      exigir(dados.km_final === null || dados.km_inicial === null || dados.km_final >= dados.km_inicial,
        'O km final deve ser maior ou igual ao km inicial.');
      exigir(!(dados.km_final !== null && dados.km_inicial === null), 'Preencha o km inicial.');
      if (!novo && vg.caminhao_id !== dados.caminhao_id) {
        exigir(!D.despesas.some(x => x.viagem_id === vg.id),
          'Esta viagem tem despesas vinculadas a outro caminhão. Remova o vínculo antes de trocar o caminhão.');
      }
      const primeiro = novo ? lerFrete(v) : null;
      const salva = await S.salvarViagem(vg?.id, dados, primeiro);
      concluir('Viagem salva.');
      if (novo) location.hash = '#/viagens/' + salva.id;
    },
  });
}

// ---------------------------------------------------------------------------
// Recebimento
// ---------------------------------------------------------------------------
function opcoesFretesAbertos(caminhaoId, incluirId) {
  const vgs = new Set(D.viagens.filter(v => v.caminhao_id === caminhaoId).map(v => v.id));
  return S.ordenarPorData(D.fretes.filter(f => vgs.has(f.viagem_id)))
    .filter(f => aReceberDoFrete(D, f) > 0 || f.id === incluirId)
    .map(f => [f.id, `${dataBRc(f.data)} · ${f.origem || '?'} → ${f.destino || '?'} · falta ${moedaC(aReceberDoFrete(D, f))}`]);
}
const dataBRc = iso => iso ? iso.split('-').reverse().join('/') : '';

export function formRecebimento({ r = null, freteId = null, caminhaoId = null } = {}) {
  const fr = S.frete(r?.frete_id || freteId);
  const cId = fr ? S.viagem(fr.viagem_id).caminhao_id : caminhaoId;
  abrirFormulario({
    titulo: r ? 'Editar recebimento' : 'Novo recebimento',
    subtitulo: ' ',
    html: `
      ${fr ? `<input type="hidden" name="caminhao_id" value="${cId}">` : campoCaminhao(cId)}
      ${fr ? `<input type="hidden" name="frete_id" value="${fr.id}">` : '<div data-fretes></div>'}
      <p class="calculo" data-saldo></p>
      ${campo({ nome: 'valor', rotulo: 'Valor recebido (R$)', tipo: 'numero', valor: paraCampo(r?.valor), ajuda: 'recebido', obrigatorio: true })}
      ${campo({ nome: 'data', rotulo: 'Data do recebimento', tipo: 'date', valor: r?.data || hojeISO(), ajuda: 'data_recebimento', obrigatorio: true })}
      ${campo({ nome: 'observacao', rotulo: 'Observação', valor: r?.observacao })}`,
    aoMontar(form) {
      const saldo = () => {
        const f = S.frete(form.querySelector('[name=frete_id]')?.value);
        const el = form.querySelector('[data-saldo]');
        if (!f) { el.textContent = ''; return; }
        const recebido = recebidoDoFrete(D, f.id, r?.id);
        el.innerHTML = `Frete ${moedaC(centavos(f.valor_bruto))} · já recebido ${moedaC(recebido)} · <strong>a receber ${moedaC(centavos(f.valor_bruto) - recebido)}</strong> ${iconeAjuda('a_receber')}`;
      };
      if (!fr) {
        ligarFaixa(form, id => {
          const ops = id ? opcoesFretesAbertos(id, null) : [];
          form.querySelector('[data-fretes]').innerHTML = ops.length
            ? selecao({ nome: 'frete_id', rotulo: 'Frete', opcoes: ops, obrigatorio: true })
            : `<p class="nota">${id ? 'Este caminhão não tem fretes com valor a receber.' : ''}</p>`;
          form.querySelector('[name=frete_id]')?.addEventListener('change', saldo);
          saldo();
        });
      } else {
        form.closest('dialog').querySelector('.faixa-caminhao').innerHTML = faixa(cId);
        saldo();
      }
    },
    async aoSalvar(form) {
      const v = valoresDe(form);
      const f = S.frete(v.frete_id);
      exigir(f, 'Escolha o frete.');
      const valor = numeroCampo(v.valor, 'o valor', { obrigatorio: true, positivo: true });
      exigir(v.data, 'Preencha a data do recebimento.');
      const falta = centavos(f.valor_bruto) - recebidoDoFrete(D, f.id, r?.id);
      exigir(centavos(valor) <= falta, `O valor ultrapassa o que falta receber deste frete (${moedaC(falta)}).`);
      await S.salvarRecebimento(r?.id, { frete_id: f.id, valor, data: v.data, observacao: v.observacao || null });
      concluir('Recebimento salvo.');
    },
  });
}

// ---------------------------------------------------------------------------
// Despesa
// ---------------------------------------------------------------------------
function opcoesViagens(caminhaoId) {
  return S.ordenarPorData(D.viagens.filter(v => v.caminhao_id === caminhaoId), 'data_inicio')
    .map(v => [v.id, `${dataBRc(v.data_inicio)} · ${v.origem || '?'} → ${v.destino || '?'}`]);
}

// Despesa comum ou boleto (despesa com vencimento). Um boleto novo pode ser parcelado:
// cada parcela vira uma despesa com a data do gasto igual ao próprio vencimento.
export function formDespesa({ x = null, caminhaoId = null, viagemId = null, boleto = false } = {}) {
  exigir(!x?.abastecimento_id && !x?.manutencao_id, 'Esta despesa foi gerada por um abastecimento ou manutenção. Edite pelo lançamento de origem.');
  const vId = x?.viagem_id ?? viagemId;
  const cId = x?.caminhao_id || caminhaoId || (vId && S.viagem(vId)?.caminhao_id);
  const ehBoleto = boleto || !!x?.vencimento || !!x?.linha_digitavel;
  const novo = !x;
  abrirFormulario({
    titulo: x ? (ehBoleto ? 'Editar boleto' : 'Editar despesa') : (ehBoleto ? 'Novo boleto' : 'Nova despesa'),
    subtitulo: ' ',
    html: `
      ${campoCaminhao(cId)}
      <div data-viagens></div>
      ${caixa({ nome: 'eh_boleto', rotulo: 'É um boleto / conta com vencimento', marcado: ehBoleto, ajuda: 'boleto' })}
      <fieldset class="grupo" data-boleto><legend>Boleto</legend>
        ${campo({ nome: 'linha_digitavel', rotulo: 'Código do boleto (linha digitável)', valor: x?.linha_digitavel ? formatarLinha(x.linha_digitavel) : '',
          ajuda: 'linha_digitavel', attrs: 'inputmode="numeric" autocomplete="off" placeholder="Cole ou digite os números"' })}
        <p class="calculo" data-leitura aria-live="polite"></p>
        ${campo({ nome: 'fornecedor', rotulo: 'Fornecedor / quem cobra', valor: x?.fornecedor, attrs: 'placeholder="Ex.: Banco Volvo, Oficina Diesel Sul"' })}
        <div class="linha">
          ${campo({ nome: 'vencimento', rotulo: novo ? 'Vencimento (1ª parcela)' : 'Vencimento', tipo: 'date', valor: x?.vencimento, ajuda: 'vencimento_boleto' })}
          ${novo ? campo({ nome: 'parcelas', rotulo: 'Nº de parcelas', tipo: 'numero', valor: '1', ajuda: 'parcelas' }) : ''}
        </div>
        ${x?.total_parcelas > 1 ? `<p class="nota">Parcela ${x.parcela} de ${x.total_parcelas}.</p>` : ''}
        <p class="calculo" data-parcelas aria-live="polite"></p>
      </fieldset>
      ${selecao({ nome: 'categoria', rotulo: 'Categoria', opcoes: CATEGORIAS, valor: x?.categoria, obrigatorio: true, vazio: 'Selecione…' })}
      ${campo({ nome: 'descricao', rotulo: 'Descrição', valor: x?.descricao })}
      <div class="linha">
        ${campo({ nome: 'valor', rotulo: 'Valor (R$)', tipo: 'numero', valor: paraCampo(x?.valor), obrigatorio: true })}
        <div data-campo-gasto>${campo({ nome: 'data_gasto', rotulo: 'Data do gasto', tipo: 'date', valor: x?.data_gasto || hojeISO(), ajuda: 'datas_despesa', obrigatorio: true })}</div>
      </div>
      ${pagamentoCampos(x?.pago, x?.data_pagamento, !ehBoleto)}`,
    aoMontar(form) {
      ligarFaixa(form, id => {
        form.querySelector('[data-viagens]').innerHTML = id
          ? selecao({ nome: 'viagem_id', rotulo: 'Viagem (opcional)', opcoes: opcoesViagens(id), valor: vId, ajuda: 'despesa_viagem', vazio: 'Sem viagem — gasto geral do caminhão' })
          : '';
      });
      ligarPagamento(form, 'data_gasto');
      const caixaBoleto = form.querySelector('[name=eh_boleto]');
      const grupo = form.querySelector('[data-boleto]');
      const leitura = form.querySelector('[data-leitura]');
      const prev = form.querySelector('[data-parcelas]');
      const atualizar = () => {
        grupo.hidden = !caixaBoleto.checked;
        const v = valoresDe(form);
        const n = Number(lerNumero(v.parcelas)) || 1;
        // Parcelado: a data do gasto de cada parcela é o próprio vencimento.
        form.querySelector('[data-campo-gasto]').hidden = caixaBoleto.checked && novo && n > 1;
        const valor = lerNumero(v.valor);
        if (caixaBoleto.checked && novo && n > 1 && v.vencimento && valor > 0) {
          const datas = vencimentosMensais(v.vencimento, n);
          prev.textContent = `${n}× ${moedaC(centavos(valor))} = ${moedaC(centavos(valor) * n)} · de ${dataBRc(datas[0])} até ${dataBRc(datas.at(-1))}, todo mês`;
        } else prev.textContent = '';
      };
      form.querySelector('[name=linha_digitavel]').addEventListener('input', e => {
        const info = lerLinhaDigitavel(e.target.value);
        if (!info) {
          const qtd = soDigitos(e.target.value).length;
          leitura.textContent = qtd ? `${qtd} dígitos — o boleto tem 47 (bancário) ou 48 (contas de consumo e tributos).` : '';
          return;
        }
        // Preenche vencimento e valor lidos do código, se ainda estiverem vazios.
        if (info.vencimento && !form.vencimento.value) form.vencimento.value = info.vencimento;
        if (info.valor && !form.valor.value) form.valor.value = paraCampo(info.valor);
        leitura.textContent = (info.dvOk ? '✔ Código lido' : '⚠ Confira o código: os dígitos verificadores não batem')
          + (info.vencimento ? ` · vence ${dataBRc(info.vencimento)}` : '') + (info.valor ? ` · ${moedaC(centavos(info.valor))}` : '');
        atualizar();
      });
      form.addEventListener('input', atualizar);
      form.addEventListener('change', atualizar);
      atualizar();
    },
    async aoSalvar(form) {
      const v = valoresDe(form);
      exigir(v.caminhao_id, 'Escolha o caminhão.');
      exigir(v.categoria, 'Escolha a categoria.');
      const valor = numeroCampo(v.valor, 'o valor', { obrigatorio: true, minimo: 0 });
      const viagem_id = v.viagem_id || null;
      exigir(!viagem_id || S.viagem(viagem_id).caminhao_id === v.caminhao_id, 'A viagem escolhida é de outro caminhão.');
      const base = { caminhao_id: v.caminhao_id, viagem_id, categoria: v.categoria, descricao: v.descricao || null, valor };

      if (!v.eh_boleto) {
        exigir(v.data_gasto, 'Preencha a data do gasto.');
        await S.salvarDespesa(x?.id, { ...base, data_gasto: v.data_gasto, ...lerPagamento(v, v.data_gasto),
          fornecedor: null, vencimento: null, linha_digitavel: null });
        concluir('Despesa salva.');
        return;
      }
      exigir(v.vencimento, 'Preencha o vencimento do boleto.');
      const digitos = soDigitos(v.linha_digitavel);
      exigir(!digitos || digitos.length === 47 || digitos.length === 48, 'O código do boleto deve ter 47 ou 48 números (ou deixe em branco).');
      const boletoBase = { ...base, fornecedor: v.fornecedor || null, linha_digitavel: digitos || null };
      const parcelas = novo ? numeroCampo(v.parcelas, 'o nº de parcelas', { positivo: true }) || 1 : 1;
      exigir(Number.isInteger(parcelas) && parcelas <= 120, 'Nº de parcelas deve ser um número inteiro até 120.');

      if (parcelas > 1) {
        exigir(!v.pago, 'Para boleto parcelado, salve sem marcar "Já foi pago" e dê baixa em cada parcela na tela Boletos.');
        await S.salvarParcelas(vencimentosMensais(v.vencimento, parcelas).map((venc, i) => ({
          ...boletoBase, linha_digitavel: i === 0 ? boletoBase.linha_digitavel : null,
          vencimento: venc, data_gasto: venc, pago: false, data_pagamento: null, parcela: i + 1, total_parcelas: parcelas,
        })));
        concluir(`${parcelas} parcelas lançadas.`);
        return;
      }
      exigir(v.data_gasto, 'Preencha a data do gasto.');
      await S.salvarDespesa(x?.id, { ...boletoBase, vencimento: v.vencimento, data_gasto: v.data_gasto, ...lerPagamento(v, v.vencimento) });
      concluir('Boleto salvo.');
    },
  });
}

// Dar baixa: confirma valor pago e data do pagamento.
export function formPagarBoleto(x) {
  abrirFormulario({
    titulo: 'Marcar boleto como pago',
    subtitulo: faixa(x.caminhao_id),
    html: `<p><strong>${esc(x.fornecedor || nomeCategoria(x.categoria))}</strong>${x.total_parcelas > 1 ? ` · parcela ${x.parcela}/${x.total_parcelas}` : ''}<br>
        <small>vence ${dataBRc(x.vencimento)} · ${moedaC(centavos(x.valor))}</small></p>
      ${campo({ nome: 'data_pagamento', rotulo: 'Data do pagamento', tipo: 'date', valor: hojeISO(), obrigatorio: true })}
      ${campo({ nome: 'valor', rotulo: 'Valor pago (R$)', tipo: 'numero', valor: paraCampo(x.valor), obrigatorio: true, dica: 'Ajuste se pagou com juros ou desconto.' })}`,
    textoSalvar: 'Confirmar pagamento',
    async aoSalvar(form) {
      const v = valoresDe(form);
      exigir(v.data_pagamento, 'Preencha a data do pagamento.');
      const valor = numeroCampo(v.valor, 'o valor', { obrigatorio: true, minimo: 0 });
      await S.salvarDespesa(x.id, { pago: true, data_pagamento: v.data_pagamento, valor });
      concluir('Pagamento registrado.');
    },
  });
}

// ---------------------------------------------------------------------------
// Abastecimento
// ---------------------------------------------------------------------------
export function formAbastecimento({ a = null, caminhaoId = null } = {}) {
  const desp = a && D.despesas.find(x => x.abastecimento_id === a.id);
  abrirFormulario({
    titulo: a ? 'Editar abastecimento' : 'Novo abastecimento',
    subtitulo: ' ',
    html: `
      <p class="nota">${iconeAjuda('abastecimento')} O abastecimento entra uma única vez no financeiro do caminhão e não é somado ao diesel estimado das viagens.</p>
      ${campoCaminhao(a?.caminhao_id || caminhaoId)}
      <div class="linha">
        ${campo({ nome: 'data', rotulo: 'Data', tipo: 'date', valor: a?.data || hojeISO(), obrigatorio: true })}
        ${campo({ nome: 'hodometro', rotulo: 'Hodômetro (km)', tipo: 'numero', valor: paraCampo(a?.hodometro, 1), ajuda: 'hodometro' })}
      </div>
      <div class="linha">
        ${campo({ nome: 'litros', rotulo: 'Litros', tipo: 'numero', valor: paraCampo(a?.litros, 3), obrigatorio: true })}
        ${campo({ nome: 'preco_litro', rotulo: 'Preço por litro (R$)', tipo: 'numero', valor: paraCampo(a?.preco_litro, 3), obrigatorio: true })}
      </div>
      ${campo({ nome: 'total', rotulo: 'Total pago (R$)', tipo: 'numero', valor: paraCampo(a?.total), obrigatorio: true, dica: 'Calculado automaticamente; ajuste se o cupom tiver outro valor.' })}
      ${campo({ nome: 'posto', rotulo: 'Posto (opcional)', valor: a?.posto })}
      ${caixa({ nome: 'tanque_cheio', rotulo: 'Tanque completo', marcado: a?.tanque_cheio, ajuda: 'tanque_cheio' })}
      ${pagamentoCampos(desp?.pago, desp?.data_pagamento, true)}`,
    aoMontar(form) {
      ligarFaixa(form);
      ligarPagamento(form, 'data');
      const total = form.querySelector('[name=total]');
      let manual = !!a;
      total.addEventListener('input', () => { manual = true; });
      const calc = () => {
        if (manual) return;
        const l = lerNumero(form.litros.value), p = lerNumero(form.preco_litro.value);
        total.value = l && p != null && !Number.isNaN(l * p) ? paraCampo(Math.round(l * p * 100) / 100) : '';
      };
      form.litros.addEventListener('input', calc);
      form.preco_litro.addEventListener('input', calc);
    },
    async aoSalvar(form) {
      const v = valoresDe(form);
      exigir(v.caminhao_id, 'Escolha o caminhão.');
      exigir(v.data, 'Preencha a data.');
      const dados = {
        caminhao_id: v.caminhao_id, data: v.data,
        hodometro: numeroCampo(v.hodometro, 'o hodômetro', { minimo: 0 }),
        litros: numeroCampo(v.litros, 'os litros', { obrigatorio: true, positivo: true }),
        preco_litro: numeroCampo(v.preco_litro, 'o preço por litro', { obrigatorio: true, minimo: 0 }),
        total: numeroCampo(v.total, 'o total', { obrigatorio: true, minimo: 0 }),
        posto: v.posto || null, tanque_cheio: v.tanque_cheio,
      };
      exigir(!dados.tanque_cheio || dados.hodometro !== null, 'Para tanque completo, informe o hodômetro (necessário para calcular a média real).');
      await S.salvarAbastecimento(a?.id, dados, lerPagamento(v, v.data));
      concluir('Abastecimento salvo.');
    },
  });
}

// ---------------------------------------------------------------------------
// Manutenção prevista (plano) e realizada
// ---------------------------------------------------------------------------
export function formPlano({ p = null, caminhaoId = null } = {}) {
  abrirFormulario({
    titulo: p ? 'Editar manutenção prevista' : 'Nova manutenção prevista',
    subtitulo: ' ',
    html: `
      ${campoCaminhao(p?.caminhao_id || caminhaoId)}
      ${campo({ nome: 'servico', rotulo: 'Serviço', valor: p?.servico, obrigatorio: true, attrs: 'placeholder="Ex.: troca de óleo"' })}
      <fieldset class="grupo"><legend>Próximo vencimento ${iconeAjuda('proxima_manutencao')}</legend>
        <div class="linha">
          ${campo({ nome: 'proximo_km', rotulo: 'No km', tipo: 'numero', valor: paraCampo(p?.proximo_km, 1) })}
          ${campo({ nome: 'proxima_data', rotulo: 'Na data', tipo: 'date', valor: p?.proxima_data })}
        </div>
      </fieldset>
      <fieldset class="grupo"><legend>Repetir a cada (opcional) ${iconeAjuda('intervalo')}</legend>
        <div class="linha">
          ${campo({ nome: 'intervalo_km', rotulo: 'km', tipo: 'numero', valor: paraCampo(p?.intervalo_km, 1) })}
          ${campo({ nome: 'intervalo_dias', rotulo: 'dias', tipo: 'numero', valor: p?.intervalo_dias })}
        </div>
      </fieldset>
      <fieldset class="grupo"><legend>Avisar com antecedência de ${iconeAjuda('aviso')}</legend>
        <div class="linha">
          ${campo({ nome: 'aviso_km', rotulo: 'km', tipo: 'numero', valor: paraCampo(p?.aviso_km ?? 1000, 1) })}
          ${campo({ nome: 'aviso_dias', rotulo: 'dias', tipo: 'numero', valor: p?.aviso_dias ?? 30 })}
        </div>
      </fieldset>`,
    aoMontar: form => ligarFaixa(form),
    async aoSalvar(form) {
      const v = valoresDe(form);
      exigir(v.caminhao_id, 'Escolha o caminhão.');
      exigir(v.servico, 'Preencha o serviço.');
      const dados = {
        caminhao_id: v.caminhao_id, servico: v.servico,
        proximo_km: numeroCampo(v.proximo_km, 'o km', { minimo: 0 }),
        proxima_data: v.proxima_data || null,
        intervalo_km: numeroCampo(v.intervalo_km, 'o intervalo em km', { positivo: true }),
        intervalo_dias: numeroCampo(v.intervalo_dias, 'o intervalo em dias', { positivo: true }),
        aviso_km: numeroCampo(v.aviso_km, 'o aviso em km', { minimo: 0 }) ?? 1000,
        aviso_dias: numeroCampo(v.aviso_dias, 'o aviso em dias', { minimo: 0 }) ?? 30,
      };
      exigir(dados.intervalo_dias === null || Number.isInteger(dados.intervalo_dias), 'Intervalo em dias deve ser um número inteiro.');
      exigir(Number.isInteger(dados.aviso_dias), 'Aviso em dias deve ser um número inteiro.');
      exigir(dados.proximo_km !== null || dados.proxima_data, 'Informe o próximo km e/ou a próxima data.');
      dados.ativo = true;
      await S.salvarPlano(p?.id, dados);
      concluir('Manutenção prevista salva.');
    },
  });
}

export function formManutencao({ m = null, caminhaoId = null, planoId = null } = {}) {
  const plano = D.planos_manutencao.find(p => p.id === (m?.plano_id || planoId));
  const desp = m && D.despesas.find(x => x.manutencao_id === m.id);
  const cId = m?.caminhao_id || plano?.caminhao_id || caminhaoId;
  const registrandoPlano = plano && !m;
  abrirFormulario({
    titulo: m ? 'Editar manutenção realizada' : 'Registrar manutenção realizada',
    subtitulo: ' ',
    html: `
      ${plano ? `<input type="hidden" name="caminhao_id" value="${cId}">` : campoCaminhao(cId)}
      <div class="linha">
        ${campo({ nome: 'data', rotulo: 'Data', tipo: 'date', valor: m?.data || hojeISO(), obrigatorio: true })}
        ${campo({ nome: 'km', rotulo: 'Km no serviço', tipo: 'numero', valor: paraCampo(m?.km ?? (registrandoPlano ? S.caminhao(cId)?.hodometro : null), 1), ajuda: 'hodometro' })}
      </div>
      ${campo({ nome: 'servico', rotulo: 'Serviço / peça', valor: m?.servico ?? plano?.servico, obrigatorio: true })}
      <div class="linha">
        ${campo({ nome: 'custo', rotulo: 'Custo (R$)', tipo: 'numero', valor: paraCampo(m?.custo), obrigatorio: true })}
        ${campo({ nome: 'oficina', rotulo: 'Oficina (opcional)', valor: m?.oficina })}
      </div>
      ${registrandoPlano ? `<fieldset class="grupo"><legend>Próximo vencimento: repetir a cada ${iconeAjuda('intervalo')}</legend>
        <div class="linha">
          ${campo({ nome: 'intervalo_km', rotulo: 'km', tipo: 'numero', valor: paraCampo(plano.intervalo_km, 1) })}
          ${campo({ nome: 'intervalo_dias', rotulo: 'dias', tipo: 'numero', valor: plano.intervalo_dias })}
        </div>
        <p class="calculo" data-proximo aria-live="polite"></p>
      </fieldset>` : ''}
      ${pagamentoCampos(desp?.pago, desp?.data_pagamento, true)}`,
    aoMontar(form) {
      if (plano) form.closest('dialog').querySelector('.faixa-caminhao').innerHTML = faixa(cId);
      else ligarFaixa(form);
      ligarPagamento(form, 'data');
      if (registrandoPlano) {
        const prev = () => {
          const v = valoresDe(form);
          const r = proximoVencimento({ km: lerNumero(v.km), data: v.data,
            intervalo_km: lerNumero(v.intervalo_km), intervalo_dias: lerNumero(v.intervalo_dias) });
          form.querySelector('[data-proximo]').textContent = r.ativo
            ? 'Próximo: ' + [r.proximo_km !== null ? `${num(r.proximo_km)} km` : '', r.proxima_data ? dataBRc(r.proxima_data) : ''].filter(Boolean).join(' ou ') + ', o que vier primeiro'
            : 'Sem intervalo: o histórico fica salvo e não será criado próximo vencimento.';
        };
        form.addEventListener('input', prev);
        prev();
      }
    },
    async aoSalvar(form) {
      const v = valoresDe(form);
      exigir(v.caminhao_id, 'Escolha o caminhão.');
      exigir(v.data, 'Preencha a data.');
      exigir(v.servico, 'Preencha o serviço.');
      const dados = {
        caminhao_id: v.caminhao_id, plano_id: plano?.id || null, data: v.data,
        km: numeroCampo(v.km, 'o km', { minimo: 0 }), servico: v.servico,
        custo: numeroCampo(v.custo, 'o custo', { obrigatorio: true, minimo: 0 }), oficina: v.oficina || null,
      };
      let intervalos = null;
      if (registrandoPlano) {
        intervalos = {
          intervalo_km: numeroCampo(v.intervalo_km, 'o intervalo em km', { positivo: true }),
          intervalo_dias: numeroCampo(v.intervalo_dias, 'o intervalo em dias', { positivo: true }),
        };
        exigir(intervalos.intervalo_dias === null || Number.isInteger(intervalos.intervalo_dias), 'Intervalo em dias deve ser inteiro.');
        exigir(!intervalos.intervalo_km || dados.km !== null, 'Informe o km do serviço para calcular o próximo vencimento por km.');
      }
      await S.salvarManutencao(m?.id, dados, lerPagamento(v, v.data), intervalos);
      concluir('Manutenção salva.');
    },
  });
}

// ---------------------------------------------------------------------------
// Ação rápida "Novo lançamento"
// ---------------------------------------------------------------------------
export function novoLancamento(caminhaoId = null) {
  if (!D.caminhoes.some(c => c.ativo)) { formCaminhao(); aviso('Primeiro cadastre um caminhão.', 'info'); return; }
  const tipos = [
    ['viagem', '🛣️ Viagem / frete'], ['despesa', '🧾 Despesa'], ['abastecimento', '⛽ Abastecimento'],
    ['recebimento', '💰 Recebimento'], ['boleto', '📄 Boleto a pagar'], ['manutencao', '🔧 Manutenção realizada'], ['plano', '📅 Manutenção prevista'],
  ];
  const dlg = abrirFormulario({
    titulo: 'Novo lançamento',
    subtitulo: ' ',
    html: `${campoCaminhao(caminhaoId)}
      <fieldset class="grupo"><legend>O que você quer lançar?</legend>
        <div class="tipos">${tipos.map(([t, n], i) => `<label><input type="radio" name="tipo" value="${t}" ${i === 0 ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      </fieldset>`,
    textoSalvar: 'Continuar',
    aoMontar: form => ligarFaixa(form),
    async aoSalvar(form) {
      const v = valoresDe(form);
      exigir(v.caminhao_id, 'Escolha o caminhão.');
      const c = v.caminhao_id;
      setTimeout(() => ({
        viagem: () => formViagem(null, c),
        despesa: () => formDespesa({ caminhaoId: c }),
        abastecimento: () => formAbastecimento({ caminhaoId: c }),
        recebimento: () => formRecebimento({ caminhaoId: c }),
        boleto: () => formDespesa({ caminhaoId: c, boleto: true }),
        manutencao: () => formManutencao({ caminhaoId: c }),
        plano: () => formPlano({ caminhaoId: c }),
      })[v.tipo](), 0);
    },
  });
  return dlg;
}
