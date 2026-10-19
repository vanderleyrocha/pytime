begin;
select plan(16);

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
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000001a', 'Manhã'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000001a', 'Tarde');
insert into slots (id, unidade_id, turno_id, dia, ordem, hora_inicio, hora_fim) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-0000000000f1', 0, 0, '07:00', '07:50'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-0000000000f1', 0, 1, '07:50', '08:40'),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-0000000000f2', 0, 0, '13:00', '13:50');
insert into turmas (id, unidade_id, nome, turno_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000001a',
   '1º A', '00000000-0000-0000-0000-0000000000f1');
insert into disciplinas (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000001a',
   'Ed. Física');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

-- 1–4: horários sem aula da turma
select lives_ok(
  $$select salvar_sem_aula_turma('00000000-0000-0000-0000-0000000000e1',
      array['00000000-0000-0000-0000-000000000052']::uuid[])$$,
  'gestora marca horário sem aula');
select is((select count(*)::int from turmas_sem_aula
            where turma_id = '00000000-0000-0000-0000-0000000000e1'),
  1, 'marcação gravada');
select throws_ok(
  $$select salvar_sem_aula_turma('00000000-0000-0000-0000-0000000000e1',
      array['00000000-0000-0000-0000-000000000061']::uuid[])$$,
  '23514', 'O horário não pertence ao turno da turma.',
  'horário de outro turno é recusado');
select is((select slot_id from turmas_sem_aula
            where turma_id = '00000000-0000-0000-0000-0000000000e1'),
  '00000000-0000-0000-0000-000000000052'::uuid,
  'falha não apaga as marcações anteriores');

-- 5–8: disponibilidade da disciplina
select lives_ok(
  $$select salvar_disponibilidades_disciplina('00000000-0000-0000-0000-0000000000d1',
      '[{"slot_id":"00000000-0000-0000-0000-000000000051","status":"indisponivel"},
        {"slot_id":"00000000-0000-0000-0000-000000000061","status":"prefere"}]')$$,
  'gestora regrava a disponibilidade da disciplina (dois turnos)');
select is((select count(*)::int from disponibilidades_disciplina
            where disciplina_id = '00000000-0000-0000-0000-0000000000d1'),
  2, 'marcações gravadas');
select throws_ok(
  $$select salvar_disponibilidades_disciplina('00000000-0000-0000-0000-0000000000d1',
      '[{"slot_id":"00000000-0000-0000-0000-000000000099","status":"evita"}]')$$,
  '23503', null, 'slot inexistente falha');
select is((select count(*)::int from disponibilidades_disciplina
            where disciplina_id = '00000000-0000-0000-0000-0000000000d1'),
  2, 'falha não apaga as marcações anteriores');

-- 9: regras novas no catálogo
select lives_ok(
  $$insert into regras (unidade_id, tipo, hard) values
    ('00000000-0000-0000-0000-00000000001a', 'disponibilidade_disciplina', true),
    ('00000000-0000-0000-0000-00000000001a', 'preferencia_disciplina_horario', false)$$,
  'aceita as regras de disponibilidade e preferência da disciplina');

-- 10–11: professor lê mas não regrava
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"caio@a.com","role":"authenticated"}', true);
select is((select count(*)::int from turmas_sem_aula), 1, 'professor lê a unidade');
select throws_ok(
  $$select salvar_sem_aula_turma('00000000-0000-0000-0000-0000000000e1', '{}')$$,
  'P0001', 'Apenas gestores editam cadastros.', 'professor não regrava');

-- 12–14: outra unidade não vê nem escreve
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"beto@b.com","role":"authenticated"}', true);
select is((select count(*)::int from turmas_sem_aula), 0, 'outra unidade não lê');
select is((select count(*)::int from disponibilidades_disciplina), 0,
  'outra unidade não lê a disciplina');
select throws_ok(
  $$select salvar_disponibilidades_disciplina('00000000-0000-0000-0000-0000000000d1', '[]')$$,
  'P0001', 'Disciplina não encontrada.', 'outra unidade não regrava');

-- 15–16: cascatas
reset role;
update turmas set turno_id = '00000000-0000-0000-0000-0000000000f2'
  where id = '00000000-0000-0000-0000-0000000000e1';
select is((select count(*)::int from turmas_sem_aula), 0,
  'mudar o turno da turma apaga as marcações do turno antigo');
delete from slots where id = '00000000-0000-0000-0000-000000000051';
select is((select count(*)::int from disponibilidades_disciplina), 1,
  'apagar o slot apaga a marcação da disciplina');

select * from finish();
rollback;
