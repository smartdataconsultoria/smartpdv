-- ══════════════════════════════════════════════════════════════
--  SmartPDV · Schema Supabase
--  Execute no SQL Editor do seu projeto Supabase
--  Smartdata Consultoria
-- ══════════════════════════════════════════════════════════════

-- ── Habilitar extensão UUID ──────────────────────────────────
create extension if not exists "pgcrypto";

-- ══════════════════════════════════════════════════════════════
--  TABELAS MESTRAS
-- ══════════════════════════════════════════════════════════════

-- Empresas (clientes da consultora — raiz multi-tenant)
create table if not exists empresas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cnpj        text,
  ativo       boolean default true,
  created_at  timestamptz default now()
);

-- Promotores (usuários de campo)
create table if not exists promotores (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  nome        text not null,
  cpf         text not null,
  senha       text not null,   -- hash em produção; migrar p/ Supabase Auth
  email       text,
  perfil      text default 'promotor', -- promotor | supervisor | admin
  ativo       boolean default true,
  created_at  timestamptz default now(),
  unique (empresa_id, cpf)
);

-- Lojas / PDVs
create table if not exists lojas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  nome        text not null,
  rede        text,
  cidade      text,
  endereco    text,
  ativo       boolean default true,
  created_at  timestamptz default now()
);

-- Relação promotor <-> loja (N:N)
create table if not exists lojas_promotor (
  id          uuid primary key default gen_random_uuid(),
  promotor_id uuid not null references promotores(id) on delete cascade,
  loja_id     uuid not null references lojas(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (promotor_id, loja_id)
);

-- Produtos
create table if not exists produtos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id) on delete cascade,
  nome             text not null,
  sku              text,
  fornecedor       text,
  preco_sugerido   numeric(10,2) default 0,
  estoque_minimo   int default 0,
  loja_ids         uuid[] default '{}',   -- lojas onde o produto é vendido (vazio = todas)
  ativo            boolean default true,
  created_at       timestamptz default now()
);

-- Similares de concorrentes
create table if not exists similares_concorrentes (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references empresas(id) on delete cascade,
  produto_id          uuid not null references produtos(id) on delete cascade,
  empresa_concorrente text not null,
  produto_similar     text not null,
  created_at          timestamptz default now()
);

-- ══════════════════════════════════════════════════════════════
--  TABELAS OPERACIONAIS
-- ══════════════════════════════════════════════════════════════

-- Lançamentos de estoque (sistema vs físico)
create table if not exists estoque_lancamentos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  loja_id         uuid not null references lojas(id),
  promotor_id     uuid not null references promotores(id),
  produto_id      uuid not null references produtos(id),
  data            date not null default current_date,
  sistema         numeric(10,2) default 0,
  fisico          numeric(10,2) default 0,
  divergencia_pct numeric(5,2)  generated always as (
    case when sistema > 0 then round(abs(sistema - fisico) / sistema * 100, 2) else 0 end
  ) stored,
  preco           numeric(10,2) default 0,
  ruptura         boolean default false,
  status          text default 'ok',  -- ok | alerta | critico
  created_at      timestamptz default now(),
  unique (loja_id, produto_id, data)   -- um lançamento por produto/loja/dia
);

-- Checklist diário
create table if not exists checklists (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  promotor_id uuid not null references promotores(id),
  loja_id     uuid not null references lojas(id),
  data        date not null default current_date,
  progresso   int default 0,
  total       int default 0,
  concluidos  int default 0,
  itens       jsonb,
  created_at  timestamptz default now(),
  unique (promotor_id, loja_id, data)
);

-- Avarias
create table if not exists avarias (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  loja_id        uuid not null references lojas(id),
  promotor_id    uuid not null references promotores(id),
  produto_id     uuid not null references produtos(id),
  data           date not null default current_date,
  quantidade     int not null,
  tipo           text not null,
  observacao     text,
  foto_url       text,
  valor_estimado numeric(10,2) default 0,
  status         text default 'pendente',  -- pendente | resolvido | descartado
  created_at     timestamptz default now()
);

-- Preços de concorrentes
create table if not exists precos_concorrentes (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references empresas(id) on delete cascade,
  loja_id             uuid not null references lojas(id),
  promotor_id         uuid not null references promotores(id),
  produto_id          uuid not null references produtos(id),
  similar_id          uuid references similares_concorrentes(id),
  data                date not null default current_date,
  preco_concorrente   numeric(10,2) not null,
  preco_proprio       numeric(10,2) default 0,
  diferenca           numeric(10,2) generated always as (preco_concorrente - preco_proprio) stored,
  diferenca_pct       numeric(5,2) generated always as (
    case when preco_proprio > 0 then round((preco_concorrente - preco_proprio) / preco_proprio * 100, 2) else 0 end
  ) stored,
  created_at          timestamptz default now()
);

-- Desempenho mensal (meta vs realizado)
create table if not exists desempenho (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  promotor_id uuid not null references promotores(id),
  periodo     text not null,   -- formato: YYYY-MM
  meta        numeric(12,2) default 0,
  realizado   numeric(12,2) default 0,
  created_at  timestamptz default now(),
  unique (promotor_id, periodo)
);

-- Oportunidades registradas
create table if not exists oportunidades (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  loja_id     uuid not null references lojas(id),
  promotor_id uuid not null references promotores(id),
  data        date not null default current_date,
  tipo        text not null,
  produto     text,
  descricao   text not null,
  prioridade  text default 'media',   -- baixa | media | alta
  status      text default 'aberta',  -- aberta | em_andamento | resolvida
  created_at  timestamptz default now()
);

-- Histórico de pontos (gamificação)
create table if not exists pontos_historico (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  promotor_id uuid not null references promotores(id),
  data        date not null default current_date,
  tipo        text not null,
  pontos      int not null,
  created_at  timestamptz default now()
);

-- ══════════════════════════════════════════════════════════════
--  VIEWS ANALÍTICAS (para Power BI via ODBC)
-- ══════════════════════════════════════════════════════════════

-- View: ranking de pontos (usado pelo app e pelo Power BI)
create or replace view pontos_ranking as
select
  empresa_id,
  promotor_id,
  to_char(date_trunc('month', data), 'YYYY-MM') as periodo,
  sum(pontos) as total
from pontos_historico
group by empresa_id, promotor_id, to_char(date_trunc('month', data), 'YYYY-MM');

-- View: acuracidade de estoque por PDV
create or replace view vw_acuracidade_estoque as
select
  e.empresa_id,
  e.loja_id,
  l.nome as loja_nome,
  e.produto_id,
  p.nome as produto_nome,
  e.data,
  e.sistema,
  e.fisico,
  e.divergencia_pct,
  e.ruptura,
  e.status,
  e.preco
from estoque_lancamentos e
join lojas l on l.id = e.loja_id
join produtos p on p.id = e.produto_id;

-- View: resumo diário por loja
create or replace view vw_resumo_pdv as
select
  el.empresa_id,
  el.loja_id,
  l.nome as loja_nome,
  el.data,
  count(*) filter (where el.status = 'ok') as produtos_ok,
  count(*) filter (where el.status = 'alerta') as produtos_alerta,
  count(*) filter (where el.status = 'critico') as produtos_critico,
  count(*) filter (where el.ruptura = true) as rupturas,
  avg(el.divergencia_pct) as divergencia_media,
  coalesce(a_count.avarias, 0) as total_avarias,
  coalesce(a_count.valor_avarias, 0) as valor_avarias,
  coalesce(ch.progresso, 0) as checklist_pct
from estoque_lancamentos el
join lojas l on l.id = el.loja_id
left join (
  select loja_id, data, count(*) as avarias, sum(valor_estimado) as valor_avarias
  from avarias group by loja_id, data
) a_count on a_count.loja_id = el.loja_id and a_count.data = el.data
left join (
  select loja_id, data, avg(progresso) as progresso
  from checklists group by loja_id, data
) ch on ch.loja_id = el.loja_id and ch.data = el.data
group by el.empresa_id, el.loja_id, l.nome, el.data,
         a_count.avarias, a_count.valor_avarias, ch.progresso;

-- View: análise de preços concorrentes
create or replace view vw_precos_concorrentes as
select
  pc.empresa_id,
  pc.loja_id,
  l.nome as loja_nome,
  pc.produto_id,
  p.nome as produto_nome,
  sc.empresa_concorrente,
  sc.produto_similar,
  pc.data,
  pc.preco_proprio,
  pc.preco_concorrente,
  pc.diferenca,
  pc.diferenca_pct
from precos_concorrentes pc
join lojas l on l.id = pc.loja_id
join produtos p on p.id = pc.produto_id
left join similares_concorrentes sc on sc.id = pc.similar_id;

-- ══════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
--  Descomentar após configurar Supabase Auth em produção
-- ══════════════════════════════════════════════════════════════

-- alter table empresas             enable row level security;
-- alter table promotores           enable row level security;
-- alter table lojas                enable row level security;
-- alter table lojas_promotor       enable row level security;
-- alter table produtos             enable row level security;
-- alter table similares_concorrentes enable row level security;
-- alter table estoque_lancamentos  enable row level security;
-- alter table checklists           enable row level security;
-- alter table avarias              enable row level security;
-- alter table precos_concorrentes  enable row level security;
-- alter table desempenho           enable row level security;
-- alter table oportunidades        enable row level security;
-- alter table pontos_historico     enable row level security;

-- ── Exemplo de policy (adaptar para cada tabela) ──────────────
-- create policy "isolamento_empresa"
-- on estoque_lancamentos for all
-- using (empresa_id = (select empresa_id from promotores where id = auth.uid()));

-- ══════════════════════════════════════════════════════════════
--  DADOS DE EXEMPLO (remover em produção)
-- ══════════════════════════════════════════════════════════════

-- insert into empresas (nome, cnpj) values ('Empresa Demo', '00.000.000/0001-00');
-- 
-- -- Anote o ID gerado acima e substitua abaixo
-- insert into promotores (empresa_id, nome, cpf, senha, perfil)
-- values ('<EMPRESA_ID>', 'Ana Promotora', '123.456.789-00', 'senha123', 'promotor');
-- 
-- insert into lojas (empresa_id, nome, rede, cidade)
-- values ('<EMPRESA_ID>', 'Atacadão Boa Viagem', 'Atacadão', 'Recife');
