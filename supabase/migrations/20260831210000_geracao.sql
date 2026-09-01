create type geracao_status as enum
  ('pendente', 'executando', 'concluida', 'inviavel', 'erro');

create table geracoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  status geracao_status not null default 'pendente',
  instancia jsonb not null,
  resultado jsonb,
  progresso jsonb,
  nucleo_conflito text[] not null default '{}',
  detalhe_erro text,
  tentativas int not null default 0,
  heartbeat_em timestamptz,
  budget_segundos numeric not null default 60
    check (budget_segundos > 0 and budget_segundos <= 600),
  criada_por uuid references auth.users(id) on delete set null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index geracoes_fila on geracoes (criada_em) where status = 'pendente';

create table cenarios (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  geracao_id uuid not null references geracoes(id) on delete cascade,
  oficial boolean not null default false,
  criado_em timestamptz not null default now()
);

create table aulas_alocadas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  cenario_id uuid not null references cenarios(id) on delete cascade,
  atribuicao_id uuid not null references atribuicoes(id) on delete cascade,
  slot_id uuid not null references slots(id) on delete cascade
);

create index aulas_alocadas_cenario on aulas_alocadas (cenario_id);

alter table geracoes enable row level security;
alter table cenarios enable row level security;
alter table aulas_alocadas enable row level security;

create policy geracoes_select on geracoes for select to authenticated
  using (unidade_id in (select minhas_unidades()));
create policy geracoes_insert on geracoes for insert to authenticated
  with check (tenho_papel(unidade_id, 'admin', 'coordenador')
              and status = 'pendente');

create policy cenarios_select on cenarios for select to authenticated
  using (unidade_id in (select minhas_unidades()));
create policy aulas_alocadas_select on aulas_alocadas for select to authenticated
  using (unidade_id in (select minhas_unidades()));

-- Escrita de resultado é exclusiva do worker (service_role, bypassa RLS).
-- Nega no nível de GRANT para o teste (e o cliente) receberem 42501 e não
-- um "0 linhas afetadas" silencioso.
revoke update, delete on geracoes from authenticated, anon;
revoke insert, update, delete on cenarios from authenticated, anon;
revoke insert, update, delete on aulas_alocadas from authenticated, anon;

-- Progresso ao vivo na UI (plano 2C)
alter publication supabase_realtime add table geracoes;
