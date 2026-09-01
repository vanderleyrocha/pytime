begin;
select plan(8);

-- Seeds como postgres (bypassa RLS)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'beto@b.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A'),
  ('00000000-0000-0000-0000-00000000001b', 'Escola B');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'admin'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000001b', 'coordenador');
insert into convites (unidade_id, email, papel) values
  ('00000000-0000-0000-0000-00000000001a', 'novo@a.com', 'coordenador');

-- Vira a Ana (admin da Escola A)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select results_eq(
  'select id from unidades order by nome',
  array['00000000-0000-0000-0000-00000000001a'::uuid],
  'Ana só vê a própria unidade');
select results_eq(
  'select count(*)::int from perfis',
  array[1], 'Ana só vê perfis da própria unidade');
select results_eq(
  'select count(*)::int from convites',
  array[1], 'admin vê convites da própria unidade');
select lives_ok(
  $$insert into convites (unidade_id, email, papel)
    values ('00000000-0000-0000-0000-00000000001a', 'x@a.com', 'admin')$$,
  'admin cria convite na própria unidade');
select throws_ok(
  $$insert into convites (unidade_id, email, papel)
    values ('00000000-0000-0000-0000-00000000001b', 'x@b.com', 'admin')$$,
  '42501', null, 'admin NÃO cria convite em outra unidade');
select throws_ok(
  $$insert into convites (unidade_id, email, papel)
    values ('00000000-0000-0000-0000-00000000001a', 'p@a.com', 'professor')$$,
  '23514', null, 'convite para papel professor é rejeitado (check)');

-- Vira o Beto (coordenador da Escola B)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"beto@b.com","role":"authenticated"}', true);
select results_eq(
  'select count(*)::int from convites',
  array[0], 'coordenador não vê convites (só admin)');
select throws_ok(
  $$insert into perfis (user_id, unidade_id, papel)
    values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000001a', 'admin')$$,
  '42501', null, 'coordenador não se promove em outra unidade');

select * from finish();
rollback;
