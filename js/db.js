// Camada de dados: mesma interface para Supabase (produção) e localStorage (demonstração).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const TABELAS = ['caminhoes', 'anotacoes', 'clientes', 'viagens', 'fretes', 'recebimentos', 'abastecimentos',
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
// Links do e-mail (confirmação de cadastro / nova senha) chegam com dados no "#".
// Lidos antes do Supabase limpar o endereço.
const hashInicial = location.hash;
export const chegouPorRecuperacao = hashInicial.includes('type=recovery');
export const erroNoLink = (() => {
  const m = hashInicial.match(/error_description=([^&]+)/);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
})();

function criarSupabase() {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const erro = e => { if (e) throw new Error(traduzirErro(e.message)); };
  const listarRanking = async () => {
    const { data, error } = await sb.from('jogo_ranking').select('nome,pontos')
      .order('pontos', { ascending: false }).order('created_at', { ascending: true }).limit(10);
    erro(error);
    return data;
  };
  return {
    modo: 'supabase',
    listarRanking,
    async registrarPontuacao(nome, pontos) {
      const { error } = await sb.from('jogo_ranking').insert({ nome, pontos });
      erro(error);
      return listarRanking();
    },
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
    async recuperarSenha(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      erro(error);
    },
    async trocarSenha(senha) {
      const { error } = await sb.auth.updateUser({ password: senha });
      erro(error);
    },
    async marcarTutorial(versao) {
      const { error } = await sb.auth.updateUser({ data: { tutorial_visto: versao } });
      erro(error);
    },
    aoRecuperarSenha(fn) {
      sb.auth.onAuthStateChange(evento => { if (evento === 'PASSWORD_RECOVERY') fn(); });
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
  if (msg.includes('different from the old password')) return 'A nova senha precisa ser diferente da anterior.';
  if (msg.includes('Auth session missing')) return 'O link expirou. Peça um novo em "Esqueci minha senha".';
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
  const CHAVE_RANKING = 'frota-jogo-renan-ranking';
  let dados;
  try { dados = JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { dados = {}; }
  for (const t of TABELAS) dados[t] ??= [];
  const salvar = () => {
    try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch { /* sem armazenamento */ }
  };
  const copia = o => JSON.parse(JSON.stringify(o));
  const listarRanking = async () => {
    try {
      const ranking = JSON.parse(localStorage.getItem(CHAVE_RANKING) || '[]');
      return Array.isArray(ranking) ? ranking : [];
    } catch {
      return [];
    }
  };

  return {
    modo: 'local',
    listarRanking,
    async registrarPontuacao(nome, pontos) {
      const ranking = [...await listarRanking(), { nome, pontos }]
        .filter(r => r && typeof r.nome === 'string' && r.nome.trim()
          && Number.isSafeInteger(r.pontos) && r.pontos >= 0)
        .sort((a, b) => b.pontos - a.pontos).slice(0, 10);
      localStorage.setItem(CHAVE_RANKING, JSON.stringify(ranking));
      return ranking;
    },
    async usuario() { return { email: 'demonstracao' }; },
    async entrar() {},
    async recuperarSenha() {},
    async trocarSenha() {},
    aoRecuperarSenha() {},
    async marcarTutorial() {},
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
