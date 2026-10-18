-- Grade do turno e disponibilidades do professor regravadas numa única
-- transação (backlog da Fase 2C): antes o app apagava e reinseria em
-- chamadas separadas, e uma falha no insert deixava tudo apagado.
-- Security invoker: a RLS de escrita (admin/coordenador) continua valendo;
-- a checagem explícita só dá uma mensagem clara.

create or replace function salvar_grade_turno(
  p_turno uuid, p_dias int[], p_horarios jsonb
) returns void
language plpgsql set search_path = public
as $fn$
declare
  v_unidade uuid;
begin
  select unidade_id into v_unidade from turnos where id = p_turno;
  if v_unidade is null then
    raise exception 'Turno não encontrado.';
  end if;
  if v_unidade not in (select unidades_com_papel('admin', 'coordenador')) then
    raise exception 'Apenas gestores editam cadastros.';
  end if;
  -- disponibilidades dos slots antigos caem em cascata (avisado na UI)
  delete from slots where turno_id = p_turno;
  insert into slots (unidade_id, turno_id, dia, ordem, hora_inicio, hora_fim)
    select v_unidade, p_turno, d.dia, h.ordem - 1,
           (h.valor ->> 'hora_inicio')::time, (h.valor ->> 'hora_fim')::time
    from unnest(p_dias) as d(dia)
    cross join jsonb_array_elements(p_horarios) with ordinality as h(valor, ordem);
end;
$fn$;

create or replace function salvar_disponibilidades(p_professor uuid, p_marcacoes jsonb)
returns void
language plpgsql set search_path = public
as $fn$
declare
  v_unidade uuid;
begin
  select unidade_id into v_unidade from professores where id = p_professor;
  if v_unidade is null then
    raise exception 'Professor não encontrado.';
  end if;
  if v_unidade not in (select unidades_com_papel('admin', 'coordenador')) then
    raise exception 'Apenas gestores editam cadastros.';
  end if;
  delete from disponibilidades where professor_id = p_professor;
  insert into disponibilidades (unidade_id, professor_id, slot_id, status)
    select v_unidade, p_professor, (m ->> 'slot_id')::uuid,
           (m ->> 'status')::disponibilidade_status
    from jsonb_array_elements(p_marcacoes) m;
end;
$fn$;

revoke execute on function salvar_grade_turno(uuid, int[], jsonb) from public, anon;
revoke execute on function salvar_disponibilidades(uuid, jsonb) from public, anon;
grant execute on function salvar_grade_turno(uuid, int[], jsonb) to authenticated;
grant execute on function salvar_disponibilidades(uuid, jsonb) to authenticated;
