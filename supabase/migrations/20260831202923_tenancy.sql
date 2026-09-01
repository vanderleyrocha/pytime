create extension if not exists pgtap;

create type papel as enum ('admin', 'coordenador', 'professor');

create table redes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criada_em timestamptz not null default now()
);

create table unidades (
  id uuid primary key default gen_random_uuid(),
  rede_id uuid references redes(id) on delete set null,
  nome text not null,
  criada_em timestamptz not null default now()
);

create table perfis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unidade_id uuid not null references unidades(id) on delete cascade,
  papel papel not null,
  criado_em timestamptz not null default now(),
  unique (user_id, unidade_id)
);

create table convites (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  email text not null,
  papel papel not null check (papel in ('admin', 'coordenador')),
  token uuid not null unique default gen_random_uuid(),
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Security definer: consultam perfis SEM passar pelo RLS de perfis
-- (evita recursão e centraliza a regra de pertencimento).
create or replace function minhas_unidades()
returns setof uuid
language sql security definer set search_path = public stable
as $fn$
  select unidade_id from perfis where user_id = (select auth.uid());
$fn$;

create or replace function tenho_papel(p_unidade uuid, variadic p_papeis papel[])
returns boolean
language sql security definer set search_path = public stable
as $fn$
  select exists (
    select 1 from perfis
    where user_id = (select auth.uid())
      and unidade_id = p_unidade
      and papel = any (p_papeis)
  );
$fn$;

alter table redes enable row level security;
alter table unidades enable row level security;
alter table perfis enable row level security;
alter table convites enable row level security;

create policy redes_select on redes for select to authenticated
  using (id in (select u.rede_id from unidades u
                where u.id in (select minhas_unidades())));

create policy unidades_select on unidades for select to authenticated
  using (id in (select minhas_unidades()));
create policy unidades_update on unidades for update to authenticated
  using (tenho_papel(id, 'admin'))
  with check (tenho_papel(id, 'admin'));
-- INSERT em unidades só pela RPC criar_unidade_com_admin (Task 7).

create policy perfis_select on perfis for select to authenticated
  using (unidade_id in (select minhas_unidades()));
create policy perfis_insert on perfis for insert to authenticated
  with check (tenho_papel(unidade_id, 'admin'));
create policy perfis_update on perfis for update to authenticated
  using (tenho_papel(unidade_id, 'admin'))
  with check (tenho_papel(unidade_id, 'admin'));
create policy perfis_delete on perfis for delete to authenticated
  using (tenho_papel(unidade_id, 'admin'));

create policy convites_select on convites for select to authenticated
  using (tenho_papel(unidade_id, 'admin'));
create policy convites_insert on convites for insert to authenticated
  with check (tenho_papel(unidade_id, 'admin'));
create policy convites_delete on convites for delete to authenticated
  using (tenho_papel(unidade_id, 'admin'));
