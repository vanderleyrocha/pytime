begin;
select plan(3);

insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A');

select lives_ok(
  $$insert into regras (unidade_id, tipo, hard) values
    ('00000000-0000-0000-0000-00000000001a', 'aulas_juntas', true)$$,
  'aceita a regra aulas_juntas');
select lives_ok(
  $$insert into regras (unidade_id, tipo, hard, parametros) values
    ('00000000-0000-0000-0000-00000000001a', 'disciplina_sincronizada', true,
     '{"disciplina_id": "00000000-0000-0000-0000-0000000000d1"}')$$,
  'aceita a regra disciplina_sincronizada');
select throws_ok(
  $$insert into regras (unidade_id, tipo, hard) values
    ('00000000-0000-0000-0000-00000000001a', 'inventada', true)$$,
  '23514', null, 'tipo fora do catálogo continua recusado');

select * from finish();
rollback;
