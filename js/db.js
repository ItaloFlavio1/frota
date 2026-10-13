// Camada de dados: mesma interface para Supabase (produção) e localStorage (demonstração).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const TABELAS = ['caminhoes', 'viagens', 'fretes', 'recebimentos', 'abastecimentos',
  'planos_manutencao', 'manutencoes', 'despesas'];

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
function criarSupabase() {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const erro = e => { if (e) throw new Error(traduzirErro(e.message)); };
  return {
    modo: 'supabase',
    async usuario() {
      const { data } = await sb.auth.getSession();
      return data.session?.user ?? null;
    },
    async entrar(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      erro(error);
    },
    // Devolve true se já entrou; false se o Supabase pediu confirmação por e-mail.
    async cadastrar(email, senha) {
      const { data, error } = await sb.auth.signUp({
        email, password: senha, options: { emailRedirectTo: location.origin + location.pathname },
      });
      erro(error);
      return !!data.session;
    },
    async sair() { await sb.auth.signOut(); },
    async listar(tabela) {
      const todos = [];
      const passo = 1000;
      for (let de = 0; ; de += passo) {
        const { data, error } = await sb.from(tabela).select('*')
          .order('created_at').range(de, de + passo - 1);
        erro(error);
        todos.push(...data);
        if (data.length < passo) break;
      }
      return todos;
    },
    async inserir(tabela, linha) {
      const { data, error } = await sb.from(tabela).insert(semOwner(linha)).select().single();
      erro(error);
      return data;
    },
    async atualizar(tabela, id, campos) {
      const { data, error } = await sb.from(tabela).update(semOwner(campos)).eq('id', id).select().single();
      erro(error);
      return data;
    },
    async remover(tabela, id) {
      const { error } = await sb.from(tabela).delete().eq('id', id);
      erro(error);
    },
    async importar(tabela, linhas) {
      if (!linhas.length) return;
      const { error } = await sb.from(tabela).upsert(linhas.map(semOwner));
      erro(error);
    },
  };
}

function semOwner(linha) {
  const { owner_id, ...resto } = linha;
  return resto;
}

function traduzirErro(msg = '') {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'E-mail ainda não confirmado. Abra o link que chegou no seu e-mail e tente de novo.';
  if (msg.includes('Database error saving new user') || msg.includes('Cadastro fechado')) return 'Os 2 logins deste sistema já foram criados. Use a opção Entrar.';
  if (msg.includes('Password should be')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (msg.includes('User already registered')) return 'Este e-mail já tem login. Use a opção Entrar.';
  if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (msg.includes('caminhoes_owner_id_placa_key')) return 'Já existe um caminhão com essa placa.';
  if (msg.includes('Recebimento excede')) return 'O recebimento ultrapassa o valor que falta receber deste frete.';
  if (msg.includes('violates foreign key')) return 'Este registro está ligado a outros lançamentos e não pode ser apagado.';
  if (msg.includes('Failed to fetch')) return 'Sem conexão com o servidor. Verifique a internet.';
  return msg;
}

// ---------------------------------------------------------------------------
// Modo demonstração (localStorage)
// ---------------------------------------------------------------------------
function criarLocal() {
  const CHAVE = 'frota-demo-v1';
  let dados;
  try { dados = JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { dados = {}; }
  for (const t of TABELAS) dados[t] ??= [];
  const salvar = () => {
    try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch { /* sem armazenamento */ }
  };
  const copia = o => JSON.parse(JSON.stringify(o));

  return {
    modo: 'local',
    async usuario() { return { email: 'demonstracao' }; },
    async entrar() {},
    async sair() {},
    async listar(tabela) { return copia(dados[tabela]); },
    async inserir(tabela, linha) {
      if (tabela === 'caminhoes' && dados.caminhoes.some(c => c.placa === linha.placa)) {
        throw new Error('Já existe um caminhão com essa placa.');
      }
      const nova = { id: uuid(), created_at: new Date().toISOString(), ...copia(linha) };
      dados[tabela].push(nova);
      salvar();
      return copia(nova);
    },
    async atualizar(tabela, id, campos) {
      const linha = dados[tabela].find(l => l.id === id);
      if (!linha) throw new Error('Registro não encontrado.');
      if (tabela === 'caminhoes' && campos.placa &&
          dados.caminhoes.some(c => c.placa === campos.placa && c.id !== id)) {
        throw new Error('Já existe um caminhão com essa placa.');
      }
      Object.assign(linha, copia(campos));
      salvar();
      return copia(linha);
    },
    async remover(tabela, id) {
      dados[tabela] = dados[tabela].filter(l => l.id !== id);
      salvar();
    },
    async importar(tabela, linhas) {
      const porId = new Map(dados[tabela].map(l => [l.id, l]));
      for (const l of linhas) porId.set(l.id, copia(l));
      dados[tabela] = [...porId.values()];
      salvar();
    },
  };
}

export const db = SUPABASE_URL && SUPABASE_ANON_KEY ? criarSupabase() : criarLocal();
