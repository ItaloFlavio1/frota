# Controle de Frota

Sistema web para controlar caminhões, viagens, fretes, recebimentos, despesas, abastecimentos e manutenções.
Funciona no celular e no computador. Hospedagem 100% gratuita:

- **GitHub Pages** → hospeda as telas
- **Supabase** (plano gratuito) → banco de dados PostgreSQL + login

Enquanto o Supabase não estiver configurado, o sistema abre em **modo demonstração** (dados só no navegador).
Na tela **Dados** há um botão para carregar um exemplo.

---

## 1. Criar o banco no Supabase (≈ 10 min)

1. Acesse <https://supabase.com>, crie uma conta e clique em **New project**.
   - Região: **South America (São Paulo)**.
   - Anote a senha do banco (não é a senha de login do sistema).
2. No menu lateral, abra **SQL Editor** → **New query**, cole todo o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Deve aparecer "Success".
   Se o banco já existe, execute o arquivo atualizado novamente para adicionar os campos de
   forma de pagamento, as anotações gerais do Resumo e o ranking compartilhado do jogo, sem apagar os dados.
3. Crie o usuário da Camila: **Authentication → Users → Add user → Create new user**.
   Informe e-mail e senha e marque **Auto Confirm User**.
4. Bloqueie cadastros de estranhos: **Authentication → Sign In / Providers** → desligue
   **Allow new users to sign up** → **Save**.
5. Pegue as chaves: **Project Settings → API** (ou o botão **Connect**). Copie:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - **anon public** key (texto longo começando com `eyJ...` ou `sb_publishable_...`)
6. Abra [`js/config.js`](js/config.js) e cole os dois valores:
   ```js
   export const SUPABASE_URL = 'https://abcd1234.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```
   A chave *anon* pode ficar pública: os dados são protegidos pelo login e pelas regras
   de segurança (RLS) criadas no passo 2. **Nunca** use a chave `service_role` aqui.

## 2. Publicar no GitHub Pages (≈ 5 min)

1. Crie uma conta em <https://github.com> e clique em **New repository**.
   - Nome: `frota` (ou outro). Visibilidade: **Public** (o Pages gratuito exige repositório público;
     não há senhas no código, então não há problema).
2. Envie os arquivos desta pasta:
   - **Pelo site:** no repositório vazio, clique em **uploading an existing file**, arraste
     todo o conteúdo da pasta `frota` (index.html, css, js, supabase…) e clique em **Commit changes**.
   - **Pelo terminal:** veja os comandos no fim deste arquivo.
3. No repositório: **Settings → Pages** → em *Build and deployment*, escolha
   **Deploy from a branch**, branch **main**, pasta **/ (root)** → **Save**.
4. Em 1–2 minutos o sistema estará em `https://SEU-USUARIO.github.io/frota/`.
5. (Opcional) No Supabase, em **Authentication → URL Configuration**, coloque esse endereço
   em **Site URL**.

Para atualizar o sistema depois, basta enviar os arquivos alterados ao repositório.

## 3. Backup automático (GitHub, a cada 3 dias)

O arquivo `.github/workflows/backup.yml` baixa todo o banco a cada 3 dias, criptografa com
uma senha sua e guarda por 90 dias em **Actions → Backup do banco → (execução) → Artifacts**.
Ele também mantém o Supabase ativo, evitando a pausa por inatividade.

Configuração (uma vez):
1. Supabase → **Project Settings → API Keys** → copie a **Secret key** (`sb_secret_...`).
2. GitHub → repositório → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_SECRET_KEY` = a secret key do passo 1
   - `BACKUP_SENHA` = uma senha forte só para os backups (guarde-a; sem ela o backup não abre)
3. Teste: **Actions → Backup do banco → Run workflow**. Deve terminar com ✅.

Restaurar: baixe o artifact, descompacte o `.zip` e, no sistema, use **Dados → Restaurar**
escolhendo o arquivo `.enc` (o sistema pede a `BACKUP_SENHA`).

## 4. Instalar no celular

Abra o site no celular e use **Adicionar à tela inicial** (Chrome: menu ⋮ → *Instalar app*;
iPhone/Safari: botão Compartilhar → *Adicionar à Tela de Início*). Abre em tela cheia com a logo.

## 5. Cuidados com o plano gratuito

- **Cópia de segurança:** o plano gratuito do Supabase não oferece backup para baixar.
  Use a tela **Dados → Baixar cópia de segurança** uma vez por semana e guarde o arquivo
  (Google Drive, e-mail, pendrive). O mesmo arquivo restaura os dados.
- **Pausa por inatividade:** projetos gratuitos do Supabase são pausados após cerca de
  7 dias sem nenhum acesso. O backup automático acessa o banco a cada 3 dias e evita isso.
  Se mesmo assim pausar, os dados não se perdem: entre no painel do Supabase e clique em
  **Restore project**.
- **Histórico de alterações:** toda criação, edição ou exclusão de frete, recebimento,
  despesa, abastecimento e manutenção fica registrada na tabela `auditoria`
  (Supabase → Table Editor).

## Estrutura

| Arquivo | Conteúdo |
|---|---|
| `index.html` | Página única do sistema |
| `css/app.css` | Visual (claro/escuro, celular/computador) |
| `js/config.js` | Endereço e chave do Supabase |
| `js/db.js` | Acesso ao banco (Supabase ou modo demonstração) |
| `js/calc.js` | Regras de cálculo (frete, diesel estimado, resultado, caixa, manutenção, média real) |
| `js/state.js` | Regras ao salvar (hodômetro, despesa única por abastecimento/manutenção, exclusões) |
| `js/forms.js` | Formulários |
| `js/help.js` | Textos e funcionamento dos ícones "?" |
| `js/app.js` | Telas e navegação |
| `js/painel.js` | Painel com gráficos (Chart.js) |
| `js/relatorio.js` | Planilha Excel (SheetJS) |
| `js/cripto.js` | Abre o backup automático criptografado |
| `sw.js`, `manifest.webmanifest` | Instalação como aplicativo |
| `scripts/backup.py`, `.github/workflows/backup.yml` | Backup automático |
| `supabase/schema.sql` | Tabelas, segurança e histórico |
| `tests/calc.html` | Testes dos cálculos (abra no navegador com um servidor local) |

## Testar no computador

```bash
cd frota
python -m http.server 8000
```
Abra <http://localhost:8000>. Testes de cálculo: <http://localhost:8000/tests/calc.html>.

## Enviar pelo terminal (alternativa ao upload pelo site)

```bash
cd frota
git remote add origin https://github.com/SEU-USUARIO/frota.git
git push -u origin main
```
