-- Importação de pacote (docs/carga/README.md) com as seções opcionais
-- turmas_sem_aula e disponibilidades_disciplina (plano 2026-10-19). Mesmo
-- corpo de 20261018000000_carga_codigo_externo.sql mais os dois inserts;
-- modo "mesclar": marcações fora do pacote não são apagadas.

create or replace function importar_pacote_carga(p_unidade_id uuid, p_pacote jsonb)
returns jsonb
language plpgsql set search_path = public
as $fn$
declare
  v_atribuicoes uuid[];
begin
  if not tenho_papel(p_unidade_id, 'admin', 'coordenador') then
    raise exception 'Apenas gestores importam dados.';
  end if;

  insert into turnos (unidade_id, codigo_externo, nome)
    select p_unidade_id, t ->> 'codigo', t ->> 'nome'
    from jsonb_array_elements(coalesce(p_pacote -> 'turnos', '[]')) t
  on conflict (unidade_id, codigo_externo) where codigo_externo is not null
    do update set nome = excluded.nome;

  insert into slots (unidade_id, turno_id, dia, ordem, hora_inicio, hora_fim)
    select p_unidade_id, tn.id, (h ->> 'dia')::int, (h ->> 'ordem')::int,
           (h ->> 'hora_inicio')::time, (h ->> 'hora_fim')::time
    from jsonb_array_elements(coalesce(p_pacote -> 'horarios', '[]')) h
    left join turnos tn
      on tn.unidade_id = p_unidade_id and tn.codigo_externo = h ->> 'turno'
  on conflict (turno_id, dia, ordem)
    do update set hora_inicio = excluded.hora_inicio, hora_fim = excluded.hora_fim;

  insert into turmas (unidade_id, codigo_externo, nome, turno_id)
    select p_unidade_id, t ->> 'codigo', t ->> 'nome', tn.id
    from jsonb_array_elements(coalesce(p_pacote -> 'turmas', '[]')) t
    left join turnos tn
      on tn.unidade_id = p_unidade_id and tn.codigo_externo = t ->> 'turno'
  on conflict (unidade_id, codigo_externo) where codigo_externo is not null
    do update set nome = excluded.nome, turno_id = excluded.turno_id;

  insert into disciplinas (unidade_id, codigo_externo, nome)
    select p_unidade_id, d ->> 'codigo', d ->> 'nome'
    from jsonb_array_elements(coalesce(p_pacote -> 'disciplinas', '[]')) d
  on conflict (unidade_id, codigo_externo) where codigo_externo is not null
    do update set nome = excluded.nome;

  insert into professores (unidade_id, codigo_externo, nome)
    select p_unidade_id, p ->> 'codigo', p ->> 'nome'
    from jsonb_array_elements(coalesce(p_pacote -> 'professores', '[]')) p
  on conflict (unidade_id, codigo_externo) where codigo_externo is not null
    do update set nome = excluded.nome;

  insert into recursos (unidade_id, codigo_externo, nome, capacidade)
    select p_unidade_id, r ->> 'codigo', r ->> 'nome',
           coalesce((r ->> 'capacidade')::int, 1)
    from jsonb_array_elements(coalesce(p_pacote -> 'recursos', '[]')) r
  on conflict (unidade_id, codigo_externo) where codigo_externo is not null
    do update set nome = excluded.nome, capacidade = excluded.capacidade;

  insert into disponibilidades (unidade_id, professor_id, slot_id, status)
    select p_unidade_id, pr.id, s.id, (d ->> 'status')::disponibilidade_status
    from jsonb_array_elements(coalesce(p_pacote -> 'disponibilidades', '[]')) d
    left join professores pr
      on pr.unidade_id = p_unidade_id and pr.codigo_externo = d ->> 'professor'
    left join turnos tn
      on tn.unidade_id = p_unidade_id and tn.codigo_externo = d ->> 'turno'
    left join slots s
      on s.turno_id = tn.id and s.dia = (d ->> 'dia')::int
     and s.ordem = (d ->> 'ordem')::int
  on conflict (professor_id, slot_id) do update set status = excluded.status;

  insert into turmas_sem_aula (unidade_id, turma_id, slot_id)
    select p_unidade_id, tu.id, s.id
    from jsonb_array_elements(coalesce(p_pacote -> 'turmas_sem_aula', '[]')) t
    left join turmas tu
      on tu.unidade_id = p_unidade_id and tu.codigo_externo = t ->> 'turma'
    left join turnos tn
      on tn.unidade_id = p_unidade_id and tn.codigo_externo = t ->> 'turno'
    left join slots s
      on s.turno_id = tn.id and s.dia = (t ->> 'dia')::int
     and s.ordem = (t ->> 'ordem')::int
  on conflict (turma_id, slot_id) do nothing;

  insert into disponibilidades_disciplina (unidade_id, disciplina_id, slot_id, status)
    select p_unidade_id, di.id, s.id, (d ->> 'status')::disponibilidade_status
    from jsonb_array_elements(coalesce(p_pacote -> 'disponibilidades_disciplina', '[]')) d
    left join disciplinas di
      on di.unidade_id = p_unidade_id and di.codigo_externo = d ->> 'disciplina'
    left join turnos tn
      on tn.unidade_id = p_unidade_id and tn.codigo_externo = d ->> 'turno'
    left join slots s
      on s.turno_id = tn.id and s.dia = (d ->> 'dia')::int
     and s.ordem = (d ->> 'ordem')::int
  on conflict (disciplina_id, slot_id) do update set status = excluded.status;

  with entrada as (
    select a, pr.id as professor_id, di.id as disciplina_id, tu.id as turma_id
    from jsonb_array_elements(coalesce(p_pacote -> 'atribuicoes', '[]')) a
    left join professores pr
      on pr.unidade_id = p_unidade_id and pr.codigo_externo = a ->> 'professor'
    left join disciplinas di
      on di.unidade_id = p_unidade_id and di.codigo_externo = a ->> 'disciplina'
    left join turmas tu
      on tu.unidade_id = p_unidade_id and tu.codigo_externo = a ->> 'turma'
  ), gravadas as (
    insert into atribuicoes
      (unidade_id, professor_id, disciplina_id, turma_id, carga_semanal, geminadas)
      select p_unidade_id, professor_id, disciplina_id, turma_id,
             (a ->> 'carga_semanal')::int, coalesce((a ->> 'geminadas')::int, 0)
      from entrada
    on conflict (professor_id, disciplina_id, turma_id)
      do update set carga_semanal = excluded.carga_semanal,
                    geminadas = excluded.geminadas
    returning id
  )
  select array_agg(id) into v_atribuicoes from gravadas;

  delete from atribuicao_recursos where atribuicao_id = any (v_atribuicoes);
  insert into atribuicao_recursos (atribuicao_id, recurso_id)
    select at.id, re.id
    from jsonb_array_elements(coalesce(p_pacote -> 'atribuicoes', '[]')) a
    join professores pr
      on pr.unidade_id = p_unidade_id and pr.codigo_externo = a ->> 'professor'
    join disciplinas di
      on di.unidade_id = p_unidade_id and di.codigo_externo = a ->> 'disciplina'
    join turmas tu
      on tu.unidade_id = p_unidade_id and tu.codigo_externo = a ->> 'turma'
    join atribuicoes at
      on at.professor_id = pr.id and at.disciplina_id = di.id and at.turma_id = tu.id
    cross join jsonb_array_elements_text(coalesce(a -> 'recursos', '[]')) cod
    left join recursos re
      on re.unidade_id = p_unidade_id and re.codigo_externo = cod;

  insert into regras (unidade_id, codigo_externo, tipo, hard, peso, ativa, parametros)
    select p_unidade_id, r ->> 'codigo', r ->> 'tipo', (r ->> 'hard')::boolean,
           coalesce((r ->> 'peso')::int, 1), coalesce((r ->> 'ativa')::boolean, true),
           case r ->> 'tipo'
             when 'preferencia_disciplina' then
               (r -> 'parametros') - 'disciplina' || jsonb_build_object('disciplina_id',
                 carga_id_disciplina(p_unidade_id, r -> 'parametros' ->> 'disciplina'))
             when 'ultimo_horario' then
               jsonb_build_object('disciplina_id',
                 carga_id_disciplina(p_unidade_id, r -> 'parametros' ->> 'disciplina'))
             when 'nao_mesmo_dia' then
               jsonb_build_object(
                 'disciplina_a',
                 carga_id_disciplina(p_unidade_id, r -> 'parametros' ->> 'disciplina_a'),
                 'disciplina_b',
                 carga_id_disciplina(p_unidade_id, r -> 'parametros' ->> 'disciplina_b'))
             else coalesce(r -> 'parametros', '{}')
           end
    from jsonb_array_elements(coalesce(p_pacote -> 'regras', '[]')) r
  on conflict (unidade_id, codigo_externo) where codigo_externo is not null
    do update set tipo = excluded.tipo, hard = excluded.hard, peso = excluded.peso,
                  ativa = excluded.ativa, parametros = excluded.parametros;

  return jsonb_build_object(
    'turnos', jsonb_array_length(coalesce(p_pacote -> 'turnos', '[]')),
    'horarios', jsonb_array_length(coalesce(p_pacote -> 'horarios', '[]')),
    'turmas', jsonb_array_length(coalesce(p_pacote -> 'turmas', '[]')),
    'disciplinas', jsonb_array_length(coalesce(p_pacote -> 'disciplinas', '[]')),
    'professores', jsonb_array_length(coalesce(p_pacote -> 'professores', '[]')),
    'recursos', jsonb_array_length(coalesce(p_pacote -> 'recursos', '[]')),
    'disponibilidades', jsonb_array_length(coalesce(p_pacote -> 'disponibilidades', '[]')),
    'turmas_sem_aula', jsonb_array_length(coalesce(p_pacote -> 'turmas_sem_aula', '[]')),
    'disponibilidades_disciplina',
      jsonb_array_length(coalesce(p_pacote -> 'disponibilidades_disciplina', '[]')),
    'atribuicoes', jsonb_array_length(coalesce(p_pacote -> 'atribuicoes', '[]')),
    'regras', jsonb_array_length(coalesce(p_pacote -> 'regras', '[]')));
end;
$fn$;
