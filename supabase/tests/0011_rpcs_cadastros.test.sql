begin;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'caio@a.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'beto@b.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A'),
  ('00000000-0000-0000-0000-00000000001b', 'Escola B');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'coordenador'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000001a', 'professor'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000001b', 'coordenador');
insert into turnos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000001a', 'Manhã');
insert into slots (id, unidade_id, turno_id, dia, ordem, hora_inicio, hora_fim) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-0000000000f1', 0, 0, '07:00', '07:50');
insert into professores (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-00000000001a', 'Prof 1');
insert into disponibilidades (unidade_id, professor_id, slot_id, status) values
  ('00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-000000000091',
   '00000000-0000-0000-0000-000000000051', 'indisponivel');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

-- 1–3: grade do turno regravada numa transação (2 dias × 2 horários)
select lives_ok(
  $$select salvar_grade_turno('00000000-0000-0000-0000-0000000000f1', array[0, 1],
      '[{"hora_inicio":"07:00","hora_fim":"07:50"},{"hora_inicio":"07:50","hora_fim":"08:40"}]')$$,
  'gestora regrava a grade do turno');
select is((select count(*)::int from slots
            where turno_id = '00000000-0000-0000-0000-0000000000f1'),
  4, 'grade nova tem dias × horários');
select throws_ok(
  $$select salvar_grade_turno('00000000-0000-0000-0000-0000000000f1', array[0, 9],
      '[{"hora_inicio":"07:00","hora_fim":"07:50"}]')$$,
  '23514', null, 'dia inválido falha');
select is((select count(*)::int from slots
            where turno_id = '00000000-0000-0000-0000-0000000000f1'),
  4, 'falha não apaga a grade anterior');

-- 5–7: disponibilidades regravadas numa transação
select lives_ok(
  format($$select salvar_disponibilidades('00000000-0000-0000-0000-000000000091',
      '[{"slot_id":"%s","status":"prefere"}]')$$,
    (select id from slots where turno_id = '00000000-0000-0000-0000-0000000000f1'
      and dia = 1 and ordem = 0)),
  'gestora regrava disponibilidades');
select is((select string_agg(status::text, ',') from disponibilidades
            where professor_id = '00000000-0000-0000-0000-000000000091'),
  'prefere', 'marcações antigas substituídas pelas novas');
select throws_ok(
  $$select salvar_disponibilidades('00000000-0000-0000-0000-000000000091',
      '[{"slot_id":"00000000-0000-0000-0000-000000000099","status":"prefere"}]')$$,
  '23503', null, 'slot inexistente falha');
select is((select count(*)::int from disponibilidades
            where professor_id = '00000000-0000-0000-0000-000000000091'),
  1, 'falha não apaga as marcações anteriores');

-- 9: professor não regrava
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"caio@a.com","role":"authenticated"}', true);
select throws_ok(
  $$select salvar_disponibilidades('00000000-0000-0000-0000-000000000091', '[]')$$,
  'P0001', 'Apenas gestores editam cadastros.', 'professor não regrava disponibilidades');

-- 10: gestor de outra unidade não enxerga o turno
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"beto@b.com","role":"authenticated"}', true);
select throws_ok(
  $$select salvar_grade_turno('00000000-0000-0000-0000-0000000000f1', array[0],
      '[{"hora_inicio":"07:00","hora_fim":"07:50"}]')$$,
  'P0001', 'Turno não encontrado.', 'outra unidade não regrava a grade');

select * from finish();
rollback;
