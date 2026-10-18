begin;
select plan(3);

-- Policies não chamam tenho_papel(<coluna>, ...) linha a linha: usam
-- unidade_id in (select unidades_com_papel(...)), avaliado uma vez por
-- consulta (como minhas_unidades()).
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and (qual ~ 'tenho_papel\(' or with_check ~ 'tenho_papel\(')),
  0, 'nenhuma policy chama tenho_papel por linha');

-- A função nova devolve só as unidades onde o usuário tem o papel pedido.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A'),
  ('00000000-0000-0000-0000-00000000001b', 'Escola B');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'coordenador'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001b', 'professor');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select array_agg(u) from unidades_com_papel('admin', 'coordenador') u),
  array['00000000-0000-0000-0000-00000000001a'::uuid],
  'unidades onde é gestora');
select is(
  (select count(*)::int from unidades_com_papel('admin')),
  0, 'sem papel de admin em nenhuma');

select * from finish();
rollback;
