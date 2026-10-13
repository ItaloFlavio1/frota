-- =====================================================================
-- Controle de Frota — esquema do banco (Supabase / PostgreSQL)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".
-- Pode ser executado mais de uma vez sem apagar dados.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Caminhões
-- ---------------------------------------------------------------------
create table if not exists caminhoes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modelo       text not null,
  placa        text not null,
  ano          int,
  hodometro    numeric(12,1) not null default 0 check (hodometro >= 0),
  media_kml    numeric(6,2) check (media_kml is null or media_kml > 0),
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (owner_id, placa)
);

-- ---------------------------------------------------------------------
-- Clientes (contratantes dos fretes)
-- ---------------------------------------------------------------------
create table if not exists clientes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null,
  documento   text,
  telefone    text,
  observacao  text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Viagens (uma viagem pode ter um ou mais fretes)
-- ---------------------------------------------------------------------
create table if not exists viagens (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  caminhao_id       uuid not null references caminhoes(id),
  data_inicio       date not null,
  data_fim          date,
  origem            text,
  destino           text,
  km_inicial        numeric(12,1) check (km_inicial is null or km_inicial >= 0),
  km_final          numeric(12,1),
  status            text not null default 'em_andamento'
                    check (status in ('planejada','em_andamento','concluida','cancelada')),
  media_kml_ref     numeric(6,2) check (media_kml_ref is null or media_kml_ref > 0),
  preco_diesel_ref  numeric(8,3) check (preco_diesel_ref is null or preco_diesel_ref >= 0),
  observacao        text,
  created_at        timestamptz not null default now(),
  check (km_final is null or km_inicial is null or km_final >= km_inicial)
);

-- ---------------------------------------------------------------------
-- Fretes
-- ---------------------------------------------------------------------
create table if not exists fretes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  viagem_id      uuid not null references viagens(id) on delete cascade,
  data           date not null,
  origem         text,
  destino        text,
  peso_t         numeric(10,3) check (peso_t is null or peso_t > 0),
  modalidade     text not null check (modalidade in ('tonelada','fechado')),
  preco_t        numeric(12,2) check (preco_t is null or preco_t >= 0),
  valor_fechado  numeric(12,2) check (valor_fechado is null or valor_fechado >= 0),
  valor_bruto    numeric(12,2) not null check (valor_bruto >= 0),
  observacao     text,
  created_at     timestamptz not null default now(),
  check (modalidade <> 'tonelada' or (peso_t is not null and preco_t is not null
                                       and valor_bruto = round(peso_t * preco_t, 2))),
  check (modalidade <> 'fechado' or (valor_fechado is not null and valor_bruto = valor_fechado))
);

-- ---------------------------------------------------------------------
-- Recebimentos (podem ser parciais)
-- ---------------------------------------------------------------------
create table if not exists recebimentos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  frete_id    uuid not null references fretes(id) on delete cascade,
  data        date not null,
  valor       numeric(12,2) not null check (valor > 0),
  observacao  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Abastecimentos
-- ---------------------------------------------------------------------
create table if not exists abastecimentos (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  caminhao_id   uuid not null references caminhoes(id),
  data          date not null,
  hodometro     numeric(12,1) check (hodometro is null or hodometro >= 0),
  litros        numeric(10,3) not null check (litros > 0),
  preco_litro   numeric(8,3) not null check (preco_litro >= 0),
  total         numeric(12,2) not null check (total >= 0),
  posto         text,
  tanque_cheio  boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Planos de manutenção (previstas)
-- ---------------------------------------------------------------------
create table if not exists planos_manutencao (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  caminhao_id     uuid not null references caminhoes(id),
  servico         text not null,
  proximo_km      numeric(12,1) check (proximo_km is null or proximo_km >= 0),
  proxima_data    date,
  intervalo_km    numeric(12,1) check (intervalo_km is null or intervalo_km > 0),
  intervalo_dias  int check (intervalo_dias is null or intervalo_dias > 0),
  aviso_km        numeric(12,1) not null default 1000 check (aviso_km >= 0),
  aviso_dias      int not null default 30 check (aviso_dias >= 0),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Manutenções realizadas
-- ---------------------------------------------------------------------
create table if not exists manutencoes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  caminhao_id  uuid not null references caminhoes(id),
  plano_id     uuid references planos_manutencao(id) on delete set null,
  data         date not null,
  km           numeric(12,1) check (km is null or km >= 0),
  servico      text not null,
  custo        numeric(12,2) not null check (custo >= 0),
  oficina      text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Despesas (financeiro). Abastecimento e manutenção geram UMA despesa
-- vinculada cada — as restrições "unique" impedem duplicidade.
-- ---------------------------------------------------------------------
create table if not exists despesas (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  caminhao_id      uuid not null references caminhoes(id),
  viagem_id        uuid references viagens(id) on delete set null,
  categoria        text not null check (categoria in
                   ('diesel','pedagio','alimentacao','manutencao','pneus','comissao','outros')),
  descricao        text,
  valor            numeric(12,2) not null check (valor >= 0),
  data_gasto       date not null,
  pago             boolean not null default false,
  data_pagamento   date,
  abastecimento_id uuid unique references abastecimentos(id) on delete cascade,
  manutencao_id    uuid unique references manutencoes(id) on delete cascade,
  created_at       timestamptz not null default now(),
  check (not pago or data_pagamento is not null),
  check (abastecimento_id is null or manutencao_id is null),
  check (abastecimento_id is null or viagem_id is null)
);

-- ---------------------------------------------------------------------
-- Histórico de alterações financeiras
-- ---------------------------------------------------------------------
create table if not exists auditoria (
  id           bigint generated always as identity primary key,
  owner_id     uuid not null default auth.uid(),
  tabela       text not null,
  registro_id  uuid,
  acao         text not null,
  antes        jsonb,
  depois       jsonb,
  em           timestamptz not null default now()
);

create or replace function registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (owner_id, tabela, registro_id, acao, antes, depois)
  values (
    coalesce(auth.uid(), coalesce(new.owner_id, old.owner_id)),
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['fretes','recebimentos','despesas','abastecimentos','manutencoes','clientes'] loop
    execute format('drop trigger if exists trg_auditoria on %I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on %I
                    for each row execute function registrar_auditoria()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Impede recebimento acima do valor do frete
-- ---------------------------------------------------------------------
create or replace function checar_recebimento() returns trigger
language plpgsql as $$
declare total numeric; bruto numeric;
begin
  select valor_bruto into bruto from fretes where id = new.frete_id;
  select coalesce(sum(valor), 0) into total from recebimentos
   where frete_id = new.frete_id and id <> new.id;
  if total + new.valor > bruto then
    raise exception 'Recebimento excede o valor do frete (frete: %, já recebido: %, novo: %)',
      bruto, total, new.valor;
  end if;
  return new;
end $$;

drop trigger if exists trg_checar_recebimento on recebimentos;
create trigger trg_checar_recebimento before insert or update on recebimentos
  for each row execute function checar_recebimento();

-- ---------------------------------------------------------------------
-- Segurança: só quem tem login entra; todos os logins (ex.: Camila e o
-- dono/master) veem e alteram os MESMOS dados da frota. Visitantes sem
-- login não veem nada. A quantidade de logins é limitada mais abaixo.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['caminhoes','viagens','fretes','recebimentos','abastecimentos',
                           'planos_manutencao','manutencoes','despesas','clientes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists dono on %I', t);
    execute format('drop policy if exists frota on %I', t);
    execute format('create policy frota on %I for all to authenticated
                    using (true) with check (true)', t);
  end loop;
end $$;

alter table auditoria enable row level security;
drop policy if exists dono_leitura on auditoria;
drop policy if exists frota_leitura on auditoria;
create policy frota_leitura on auditoria for select to authenticated using (true);

-- Índices úteis
create index if not exists idx_viagens_caminhao   on viagens(caminhao_id);
create index if not exists idx_fretes_viagem      on fretes(viagem_id);
create index if not exists idx_receb_frete        on recebimentos(frete_id);
create index if not exists idx_desp_caminhao      on despesas(caminhao_id);
create index if not exists idx_desp_viagem        on despesas(viagem_id);
create index if not exists idx_abast_caminhao     on abastecimentos(caminhao_id);
create index if not exists idx_manut_caminhao     on manutencoes(caminhao_id);
create index if not exists idx_planos_caminhao    on planos_manutencao(caminhao_id);

-- ---------------------------------------------------------------------
-- Cadastro pela tela do sistema: só os 2 primeiros logins são aceitos
-- (ex.: Camila + master). Para permitir mais, troque o 2 abaixo e rode de novo.
-- ---------------------------------------------------------------------
create or replace function limitar_cadastros() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from auth.users) >= 2 then
    raise exception 'Cadastro fechado';
  end if;
  return new;
end $$;

drop trigger if exists trg_limitar_cadastros on auth.users;
create trigger trg_limitar_cadastros before insert on auth.users
  for each row execute function limitar_cadastros();

-- ---------------------------------------------------------------------
-- Versão 2: cliente e vencimento no frete; registro de quem lançou
-- ---------------------------------------------------------------------
alter table fretes add column if not exists cliente_id uuid references clientes(id);
alter table fretes add column if not exists vencimento date;
create index if not exists idx_fretes_cliente on fretes(cliente_id);

do $$
declare t text;
begin
  foreach t in array array['caminhoes','viagens','fretes','recebimentos','abastecimentos',
                           'planos_manutencao','manutencoes','despesas','clientes'] loop
    execute format('alter table %I add column if not exists criado_por text
                    default (auth.jwt() ->> ''email'')', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Versão 3: boletos / contas a pagar (são despesas com vencimento)
-- ---------------------------------------------------------------------
alter table despesas add column if not exists fornecedor text;
alter table despesas add column if not exists vencimento date;
alter table despesas add column if not exists linha_digitavel text;
alter table despesas add column if not exists grupo_parcelas uuid;
alter table despesas add column if not exists parcela int;
alter table despesas add column if not exists total_parcelas int;
create index if not exists idx_desp_vencimento on despesas(vencimento) where not pago;

alter table despesas drop constraint if exists despesas_categoria_check;
alter table despesas add constraint despesas_categoria_check check (categoria in
  ('diesel','pedagio','alimentacao','manutencao','pneus','comissao','financiamento','seguro','impostos','outros'));

-- ---------------------------------------------------------------------
-- Versão 4: recebimento avulso (dinheiro que entrou sem frete lançado)
-- ---------------------------------------------------------------------
alter table recebimentos alter column frete_id drop not null;
alter table recebimentos add column if not exists caminhao_id uuid references caminhoes(id);
alter table recebimentos add column if not exists cliente_id uuid references clientes(id);
alter table recebimentos add column if not exists descricao text;
alter table recebimentos drop constraint if exists recebimento_frete_ou_caminhao;
alter table recebimentos add constraint recebimento_frete_ou_caminhao
  check (frete_id is not null or caminhao_id is not null);
create index if not exists idx_receb_caminhao on recebimentos(caminhao_id);

create or replace function checar_recebimento() returns trigger
language plpgsql as $$
declare total numeric; bruto numeric;
begin
  if new.frete_id is null then return new; end if;  -- avulso: não há frete para comparar
  select valor_bruto into bruto from fretes where id = new.frete_id;
  select coalesce(sum(valor), 0) into total from recebimentos
   where frete_id = new.frete_id and id <> new.id;
  if total + new.valor > bruto then
    raise exception 'Recebimento excede o valor do frete (frete: %, já recebido: %, novo: %)',
      bruto, total, new.valor;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Versão 5: cliente em texto livre (sem cadastro)
-- ---------------------------------------------------------------------
alter table fretes add column if not exists cliente_nome text;
alter table recebimentos add column if not exists cliente_nome text;
-- Fretes antigos que usavam o cadastro passam a ter o nome escrito.
update fretes f set cliente_nome = c.nome from clientes c
 where f.cliente_id = c.id and f.cliente_nome is null;
