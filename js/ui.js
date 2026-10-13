// Utilidades de interface: formatação, leitura de números, formulários e diálogos.
import { iconeAjuda } from './help.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const moedaC = c => fmtMoeda.format(c / 100);
export const moeda = v => fmtMoeda.format(Number(v || 0));
export const num = (v, casas = 1) =>
  v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas });
export const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '—';

// Aceita "1.234,56", "1234,56", "1234.56" e "1234".
export function lerNumero(texto) {
  let s = String(texto ?? '').trim().replace(/\s|R\$/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
// Mostra número em campo de formulário no formato brasileiro, sem separador de milhar.
export const paraCampo = (v, casas = 2) =>
  v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas, useGrouping: false });

export const rotuloCaminhao = c => c ? `${c.modelo} — ${c.placa}` : '—';

// ---------------------------------------------------------------------------
// Campos de formulário
// ---------------------------------------------------------------------------
export function campo({ nome, rotulo, tipo = 'text', valor = '', ajuda, obrigatorio, attrs = '', dica }) {
  const id = 'f_' + nome;
  const v = valor ?? '';
  let input;
  if (tipo === 'numero') {
    input = `<input id="${id}" name="${nome}" inputmode="decimal" autocomplete="off" value="${esc(v)}" ${obrigatorio ? 'required' : ''} ${attrs}>`;
  } else if (tipo === 'textarea') {
    input = `<textarea id="${id}" name="${nome}" rows="2" ${attrs}>${esc(v)}</textarea>`;
  } else {
    input = `<input id="${id}" name="${nome}" type="${tipo}" value="${esc(v)}" ${obrigatorio ? 'required' : ''} ${attrs}>`;
  }
  return `<div class="campo" data-campo="${nome}">
    <div class="rotulo"><label for="${id}">${esc(rotulo)}${obrigatorio ? ' <span class="obr" aria-hidden="true">*</span>' : ''}</label>${ajuda ? iconeAjuda(ajuda) : ''}</div>
    ${input}${dica ? `<small class="dica">${dica}</small>` : ''}
  </div>`;
}

export function selecao({ nome, rotulo, opcoes, valor = '', ajuda, obrigatorio, vazio, attrs = '' }) {
  const id = 'f_' + nome;
  const ops = (vazio != null ? `<option value="">${esc(vazio)}</option>` : '') +
    opcoes.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(valor ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('');
  return `<div class="campo" data-campo="${nome}">
    <div class="rotulo"><label for="${id}">${esc(rotulo)}${obrigatorio ? ' <span class="obr" aria-hidden="true">*</span>' : ''}</label>${ajuda ? iconeAjuda(ajuda) : ''}</div>
    <select id="${id}" name="${nome}" ${obrigatorio ? 'required' : ''} ${attrs}>${ops}</select>
  </div>`;
}

export function caixa({ nome, rotulo, marcado, ajuda }) {
  return `<div class="campo campo-caixa" data-campo="${nome}">
    <label><input type="checkbox" name="${nome}" ${marcado ? 'checked' : ''}> ${esc(rotulo)}</label>${ajuda ? iconeAjuda(ajuda) : ''}
  </div>`;
}

// ---------------------------------------------------------------------------
// Diálogo de formulário. `aoSalvar(form)` deve lançar Error com mensagem amigável.
// ---------------------------------------------------------------------------
export function abrirFormulario({ titulo, subtitulo = '', html, aoSalvar, aoMontar, textoSalvar = 'Salvar' }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'janela';
  dlg.innerHTML = `<form novalidate>
    <header><h2>${esc(titulo)}</h2><button type="button" class="fechar" aria-label="Fechar">×</button></header>
    ${subtitulo ? `<div class="faixa-caminhao">${subtitulo}</div>` : ''}
    <div class="corpo">${html}</div>
    <p class="erro" role="alert" hidden></p>
    <footer><button type="button" class="btn sec cancelar">Cancelar</button><button type="submit" class="btn">${esc(textoSalvar)}</button></footer>
  </form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector('form');
  const erro = dlg.querySelector('.erro');
  const fechar = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector('.fechar').onclick = fechar;
  dlg.querySelector('.cancelar').onclick = fechar;
  dlg.addEventListener('cancel', e => { e.preventDefault(); fechar(); });
  form.onsubmit = async e => {
    e.preventDefault();
    erro.hidden = true;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await aoSalvar(form);
      fechar();
    } catch (err) {
      erro.textContent = err.message || String(err);
      erro.hidden = false;
      erro.scrollIntoView({ block: 'nearest' });
    } finally {
      btn.disabled = false;
    }
  };
  aoMontar?.(form);
  dlg.showModal();
  return dlg;
}

export function confirmar(mensagem, textoBotao = 'Apagar') {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'janela pequena';
    dlg.innerHTML = `<form method="dialog">
      <div class="corpo"><p>${mensagem}</p></div>
      <footer><button value="nao" class="btn sec">Cancelar</button><button value="sim" class="btn perigo">${esc(textoBotao)}</button></footer>
    </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'sim'); dlg.remove(); });
    dlg.showModal();
  });
}

export function aviso(mensagem, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + tipo;
  el.setAttribute('role', 'status');
  el.textContent = mensagem;
  (document.querySelector('dialog[open]') || document.body).appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// Leitura de valores do formulário com validação
export function valoresDe(form) {
  const fd = new FormData(form);
  const v = {};
  for (const [k, val] of fd.entries()) v[k] = typeof val === 'string' ? val.trim() : val;
  form.querySelectorAll('input[type=checkbox]').forEach(c => { v[c.name] = c.checked; });
  return v;
}

export function exigir(cond, msg) { if (!cond) throw new Error(msg); }

export function numeroCampo(v, nome, { obrigatorio = false, positivo = false, minimo = null } = {}) {
  const n = lerNumero(v);
  if (n === null) { if (obrigatorio) throw new Error(`Preencha ${nome}.`); return null; }
  if (Number.isNaN(n)) throw new Error(`${nome[0].toUpperCase() + nome.slice(1)}: número inválido.`);
  if (positivo && n <= 0) throw new Error(`${nome[0].toUpperCase() + nome.slice(1)} deve ser maior que zero.`);
  if (minimo !== null && n < minimo) throw new Error(`${nome[0].toUpperCase() + nome.slice(1)} não pode ser negativo.`);
  return n;
}
