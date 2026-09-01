begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'coordenador');
insert into turnos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-00000000001a', 'Manhã');
insert into turmas (id, unidade_id, turno_id, nome) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-000000000101', '6º A');
insert into disciplinas (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-00000000001a', 'Matemática');
insert into professores (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-00000000001a', 'Paulo');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into atribuicoes (unidade_id, professor_id, disciplina_id, turma_id, carga_semanal)
    values ('00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-000000000401',
            '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 4)$$,
  'coordenador cria atribuição');
select throws_ok(
  $$insert into atribuicoes (unidade_id, professor_id, disciplina_id, turma_id, carga_semanal)
    values ('00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-000000000401',
            '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 0)$$,
  '23514', null, 'carga_semanal 0 é rejeitada');
select lives_ok(
  $$insert into regras (unidade_id, tipo, hard, peso)
    values ('00000000-0000-0000-0000-00000000001a', 'janelas_professor', false, 10)$$,
  'regra de tipo válido é aceita');
select throws_ok(
  $$insert into regras (unidade_id, tipo, hard)
    values ('00000000-0000-0000-0000-00000000001a', 'tipo_inexistente', true)$$,
  '23514', null, 'tipo fora do catálogo é rejeitado');
select results_eq('select count(*)::int from regras', array[1],
  'regras visíveis ao membro');

select * from finish();
rollback;
