create table atribuicoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  professor_id uuid not null references professores(id) on delete restrict,
  disciplina_id uuid not null references disciplinas(id) on delete restrict,
  turma_id uuid not null references turmas(id) on delete cascade,
  carga_semanal int not null check (carga_semanal >= 1),
  geminadas int not null default 0 check (geminadas >= 0),
  unique (professor_id, disciplina_id, turma_id)
);

create table atribuicao_recursos (
  atribuicao_id uuid not null references atribuicoes(id) on delete cascade,
  recurso_id uuid not null references recursos(id) on delete cascade,
  primary key (atribuicao_id, recurso_id)
);

create table regras (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  tipo text not null check (tipo in (
    'disponibilidade_professor', 'geminadas', 'recurso_compartilhado',
    'janelas_professor', 'distribuicao_disciplina', 'preferencia_professor',
    'preferencia_disciplina', 'compactacao_dias', 'ultimo_horario',
    'nao_mesmo_dia'
  )),
  parametros jsonb not null default '{}',
  hard boolean not null,
  peso int not null default 1 check (peso >= 1),
  ativa boolean not null default true,
  criada_em timestamptz not null default now()
);

do $blk$
declare t text;
begin
  foreach t in array array['atribuicoes', 'regras'] loop
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

-- N:N sem unidade_id própria: herda o escopo da atribuição
alter table atribuicao_recursos enable row level security;
create policy atribuicao_recursos_select on atribuicao_recursos
  for select to authenticated
  using (exists (select 1 from atribuicoes a
                 where a.id = atribuicao_id
                   and a.unidade_id in (select minhas_unidades())));
create policy atribuicao_recursos_escrita on atribuicao_recursos
  for all to authenticated
  using (exists (select 1 from atribuicoes a
                 where a.id = atribuicao_id
                   and tenho_papel(a.unidade_id, 'admin', 'coordenador')))
  with check (exists (select 1 from atribuicoes a
                      where a.id = atribuicao_id
                        and tenho_papel(a.unidade_id, 'admin', 'coordenador')));
