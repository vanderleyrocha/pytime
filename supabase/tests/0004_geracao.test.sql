begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'caio@a.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'coordenador'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000001a', 'professor');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into geracoes (unidade_id, instancia)
    values ('00000000-0000-0000-0000-00000000001a', '{"turmas": []}'::jsonb)$$,
  'coordenador enfileira geração');
select throws_ok(
  $$insert into geracoes (unidade_id, instancia, budget_segundos)
    values ('00000000-0000-0000-0000-00000000001a', '{}'::jsonb, 601)$$,
  '23514', null, 'budget acima de 600 s é rejeitado');
select throws_ok(
  $$update geracoes set status = 'concluida'$$,
  '42501', null, 'cliente não atualiza geração (só o worker/service_role)');
select throws_ok(
  $$insert into cenarios (unidade_id, geracao_id)
    select unidade_id, id from geracoes limit 1$$,
  '42501', null, 'cliente não cria cenário (só o worker)');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"caio@a.com","role":"authenticated"}', true);
select throws_ok(
  $$insert into geracoes (unidade_id, instancia)
    values ('00000000-0000-0000-0000-00000000001a', '{}'::jsonb)$$,
  '42501', null, 'professor não enfileira geração');

select * from finish();
rollback;
