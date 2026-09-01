begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'caio@a.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A'),
  ('00000000-0000-0000-0000-00000000001b', 'Escola B');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'coordenador'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000001a', 'professor');
insert into turnos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-00000000001a', 'Manhã A'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-00000000001b', 'Manhã B');
insert into turmas (id, unidade_id, turno_id, nome) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-000000000101', '6º A'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-00000000001b',
   '00000000-0000-0000-0000-000000000102', '6º B');
insert into disciplinas (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-00000000001a', 'Matemática');
insert into professores (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-00000000001a', 'Paulo');
insert into recursos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-00000000001b', 'Lab B');
insert into atribuicoes (id, unidade_id, professor_id, disciplina_id, turma_id, carga_semanal) values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301',
   '00000000-0000-0000-0000-000000000201', 4);

-- Coordenadora da Escola A
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$insert into slots (unidade_id, turno_id, dia, ordem)
    values ('00000000-0000-0000-0000-00000000001a',
            '00000000-0000-0000-0000-000000000102', 0, 0)$$,
  '23503', null, 'slot não pode referenciar turno de outra unidade');
select lives_ok(
  $$insert into slots (unidade_id, turno_id, dia, ordem)
    values ('00000000-0000-0000-0000-00000000001a',
            '00000000-0000-0000-0000-000000000101', 0, 0)$$,
  'slot com turno da mesma unidade é aceito');
select throws_ok(
  $$insert into atribuicoes (unidade_id, professor_id, disciplina_id, turma_id, carga_semanal)
    values ('00000000-0000-0000-0000-00000000001a',
            '00000000-0000-0000-0000-000000000401',
            '00000000-0000-0000-0000-000000000301',
            '00000000-0000-0000-0000-000000000202', 4)$$,
  '23503', null, 'atribuição não pode referenciar turma de outra unidade');
select throws_ok(
  $$insert into atribuicao_recursos (atribuicao_id, recurso_id)
    values ('00000000-0000-0000-0000-000000000601',
            '00000000-0000-0000-0000-000000000502')$$,
  'P0001', null, 'vínculo com recurso de outra unidade é rejeitado pelo trigger');

-- Professor (papel sem escrita) — fecha os gaps de cobertura das T5
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"caio@a.com","role":"authenticated"}', true);
select throws_ok(
  $$insert into regras (unidade_id, tipo, hard)
    values ('00000000-0000-0000-0000-00000000001a', 'geminadas', true)$$,
  '42501', null, 'professor não cria regras');
select throws_ok(
  $$insert into atribuicoes (unidade_id, professor_id, disciplina_id, turma_id, carga_semanal)
    values ('00000000-0000-0000-0000-00000000001a',
            '00000000-0000-0000-0000-000000000401',
            '00000000-0000-0000-0000-000000000301',
            '00000000-0000-0000-0000-000000000201', 2)$$,
  '42501', null, 'professor não cria atribuições');

select * from finish();
rollback;
