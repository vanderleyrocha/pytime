-- Disponibilidade de turmas e disciplinas (plano 2026-10-19).
-- turmas_sem_aula: horários do turno em que a turma não tem aula (o motor
-- não aloca nada neles e a carga da turma conta só os demais). Só guarda os
-- indisponíveis; ausência = tem aula.
-- disponibilidades_disciplina: matriz por slot da disciplina, com os mesmos
-- status do professor (regras disponibilidade_disciplina e
-- preferencia_disciplina_horario).

create table turmas_sem_aula (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  turma_id uuid not null references turmas(id) on delete cascade,
  slot_id uuid not null references slots(id) on delete cascade,
  unique (turma_id, slot_id)
);

create table disponibilidades_disciplina (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  disciplina_id uuid not null references disciplinas(id) on delete cascade,
  slot_id uuid not null references slots(id) on delete cascade,
  status disponibilidade_status not null,
  unique (disciplina_id, slot_id)
);

-- Integridade de tenant: mesmas FKs compostas das demais tabelas.
alter table turmas_sem_aula add constraint turmas_sem_aula_turma_mesmo_tenant
  foreign key (turma_id, unidade_id) references turmas (id, unidade_id) on delete cascade;
alter table turmas_sem_aula add constraint turmas_sem_aula_slot_mesmo_tenant
  foreign key (slot_id, unidade_id) references slots (id, unidade_id) on delete cascade;
alter table disponibilidades_disciplina add constraint disponibilidades_disciplina_disciplina_mesmo_tenant
  foreign key (disciplina_id, unidade_id) references disciplinas (id, unidade_id) on delete cascade;
alter table disponibilidades_disciplina add constraint disponibilidades_disciplina_slot_mesmo_tenant
  foreign key (slot_id, unidade_id) references slots (id, unidade_id) on delete cascade;

create index turmas_sem_aula_unidade on turmas_sem_aula (unidade_id);
create index disponibilidades_disciplina_unidade on disponibilidades_disciplina (unidade_id);

-- O horário sem aula tem de ser do turno da turma (o motor rejeita a
-- instância caso contrário).
create or replace function validar_turno_turma_sem_aula()
returns trigger
language plpgsql
as $fn$
begin
  if not exists (
    select 1 from turmas t join slots s on s.turno_id = t.turno_id
    where t.id = new.turma_id and s.id = new.slot_id
  ) then
    raise exception 'O horário não pertence ao turno da turma.'
      using errcode = '23514';
  end if;
  return new;
end;
$fn$;

create trigger turmas_sem_aula_turno
  before insert or update on turmas_sem_aula
  for each row execute function validar_turno_turma_sem_aula();

-- Turma que muda de turno perde as marcações do turno antigo.
create or replace function limpar_sem_aula_ao_mudar_turno()
returns trigger
language plpgsql
as $fn$
begin
  delete from turmas_sem_aula where turma_id = new.id;
  return new;
end;
$fn$;

create trigger turmas_turno_alterado
  after update of turno_id on turmas
  for each row when (old.turno_id is distinct from new.turno_id)
  execute function limpar_sem_aula_ao_mudar_turno();

-- RLS no padrão dos cadastros: leitura da unidade, escrita de gestores.
do $blk$
declare t text;
begin
  foreach t in array array['turmas_sem_aula', 'disponibilidades_disciplina'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated
         using (unidade_id in (select minhas_unidades()))',
      t || '_select', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (unidade_id in (select unidades_com_papel(''admin'', ''coordenador'')))
         with check (unidade_id in (select unidades_com_papel(''admin'', ''coordenador'')))',
      t || '_escrita', t);
  end loop;
end
$blk$;

-- Regravação numa única transação, no molde de salvar_disponibilidades.
create or replace function salvar_sem_aula_turma(p_turma uuid, p_slots uuid[])
returns void
language plpgsql set search_path = public
as $fn$
declare
  v_unidade uuid;
begin
  select unidade_id into v_unidade from turmas where id = p_turma;
  if v_unidade is null then
    raise exception 'Turma não encontrada.';
  end if;
  if v_unidade not in (select unidades_com_papel('admin', 'coordenador')) then
    raise exception 'Apenas gestores editam cadastros.';
  end if;
  delete from turmas_sem_aula where turma_id = p_turma;
  insert into turmas_sem_aula (unidade_id, turma_id, slot_id)
    select distinct v_unidade, p_turma, s
    from unnest(coalesce(p_slots, '{}')) as s;
end;
$fn$;

create or replace function salvar_disponibilidades_disciplina(
  p_disciplina uuid, p_marcacoes jsonb
) returns void
language plpgsql set search_path = public
as $fn$
declare
  v_unidade uuid;
begin
  select unidade_id into v_unidade from disciplinas where id = p_disciplina;
  if v_unidade is null then
    raise exception 'Disciplina não encontrada.';
  end if;
  if v_unidade not in (select unidades_com_papel('admin', 'coordenador')) then
    raise exception 'Apenas gestores editam cadastros.';
  end if;
  delete from disponibilidades_disciplina where disciplina_id = p_disciplina;
  insert into disponibilidades_disciplina (unidade_id, disciplina_id, slot_id, status)
    select v_unidade, p_disciplina, (m ->> 'slot_id')::uuid,
           (m ->> 'status')::disponibilidade_status
    from jsonb_array_elements(p_marcacoes) m;
end;
$fn$;

revoke execute on function salvar_sem_aula_turma(uuid, uuid[]) from public, anon;
revoke execute on function salvar_disponibilidades_disciplina(uuid, jsonb) from public, anon;
grant execute on function salvar_sem_aula_turma(uuid, uuid[]) to authenticated;
grant execute on function salvar_disponibilidades_disciplina(uuid, jsonb) to authenticated;

-- Catálogo: as duas regras novas do motor.
alter table regras drop constraint regras_tipo_check;
alter table regras add constraint regras_tipo_check check (tipo in (
  'disponibilidade_professor', 'geminadas', 'recurso_compartilhado',
  'janelas_professor', 'distribuicao_disciplina', 'preferencia_professor',
  'preferencia_disciplina', 'compactacao_dias', 'ultimo_horario',
  'nao_mesmo_dia', 'aulas_juntas', 'disciplina_sincronizada',
  'disponibilidade_disciplina', 'preferencia_disciplina_horario'
));
