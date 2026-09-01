create type disponibilidade_status as enum
  ('disponivel', 'indisponivel', 'prefere', 'evita');

create table turnos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now()
);

create table slots (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  turno_id uuid not null references turnos(id) on delete cascade,
  dia int not null check (dia between 0 and 6),
  ordem int not null check (ordem >= 0),
  hora_inicio time,
  hora_fim time,
  unique (turno_id, dia, ordem)
);

create table turmas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  turno_id uuid not null references turnos(id) on delete restrict,
  nome text not null,
  criada_em timestamptz not null default now()
);

create table disciplinas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  nome text not null
);

create table professores (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  nome text not null
);

create table disponibilidades (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  professor_id uuid not null references professores(id) on delete cascade,
  slot_id uuid not null references slots(id) on delete cascade,
  status disponibilidade_status not null,
  unique (professor_id, slot_id)
);

create table recursos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  nome text not null,
  capacidade int not null default 1 check (capacidade >= 1)
);

-- Vínculo professor ↔ login (Fase 3; nullable por enquanto)
alter table perfis add column professor_id uuid
  references professores(id) on delete set null;

-- RLS padrão "cadastro": SELECT para membros; escrita para admin/coordenador
do $blk$
declare t text;
begin
  foreach t in array array[
    'turnos', 'slots', 'turmas', 'disciplinas',
    'professores', 'disponibilidades', 'recursos'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_select on %I for select to authenticated
         using (unidade_id in (select minhas_unidades()))', t, t);
    execute format(
      'create policy %I_escrita on %I for all to authenticated
         using (tenho_papel(unidade_id, ''admin'', ''coordenador''))
         with check (tenho_papel(unidade_id, ''admin'', ''coordenador''))', t, t);
  end loop;
end
$blk$;
