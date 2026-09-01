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
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-00000000001a', 'Manhã'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-00000000001b', 'Tarde B');

-- Coordenador da Escola A
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select results_eq('select nome from turnos', array['Manhã'::text],
  'membro só vê turnos da própria unidade');
select lives_ok(
  $$insert into slots (unidade_id, turno_id, dia, ordem, hora_inicio, hora_fim)
    values ('00000000-0000-0000-0000-00000000001a',
            '00000000-0000-0000-0000-000000000101', 0, 0, '07:00', '07:50')$$,
  'coordenador cria slot');
select throws_ok(
  $$insert into slots (unidade_id, turno_id, dia, ordem)
    values ('00000000-0000-0000-0000-00000000001a',
            '00000000-0000-0000-0000-000000000101', 7, 0)$$,
  '23514', null, 'dia fora de 0–6 é rejeitado');
select throws_ok(
  $$insert into turnos (unidade_id, nome)
    values ('00000000-0000-0000-0000-00000000001b', 'Invasão')$$,
  '42501', null, 'escrita em outra unidade bloqueada');

-- Professor (papel sem escrita em cadastros)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"caio@a.com","role":"authenticated"}', true);
select results_eq('select count(*)::int from turnos', array[1],
  'professor vê cadastros da unidade');
select throws_ok(
  $$insert into disciplinas (unidade_id, nome)
    values ('00000000-0000-0000-0000-00000000001a', 'Química')$$,
  '42501', null, 'professor não escreve em cadastros');

select * from finish();
rollback;
