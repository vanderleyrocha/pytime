begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'diva@d.com');

-- Ana cria a própria escola
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$select criar_unidade_com_admin('Escola Nova')$$,
  'usuário autenticado cria escola');
select results_eq(
  $$select papel::text from perfis
    where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  array['admin'::text], 'criador vira admin');
select throws_ok(
  $$select criar_unidade_com_admin('  ')$$,
  null, null, 'nome vazio é rejeitado');

-- Ana convida diva@d.com como coordenador
select lives_ok(
  $$insert into convites (unidade_id, email, papel, token)
    select unidade_id, 'diva@d.com', 'coordenador',
           '00000000-0000-0000-0000-0000000000f0'
    from perfis where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  'admin cria convite com token conhecido');

-- Diva aceita
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"diva@d.com","role":"authenticated"}', true);
select lives_ok(
  $$select aceitar_convite('00000000-0000-0000-0000-0000000000f0')$$,
  'convidada aceita o convite');
select results_eq(
  $$select papel::text from perfis
    where user_id = '00000000-0000-0000-0000-0000000000d1'$$,
  array['coordenador'::text], 'perfil criado com o papel do convite');
select throws_ok(
  $$select aceitar_convite('00000000-0000-0000-0000-0000000000f0')$$,
  null, 'Convite já utilizado.', 'reuso do token é rejeitado');

select * from finish();
rollback;
