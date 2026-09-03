begin;
select plan(7);

insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A');
insert into geracoes (id, unidade_id, instancia, status, criada_em) values
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-00000000001a',
   '{}'::jsonb, 'pendente', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-00000000001a',
   '{}'::jsonb, 'pendente', now() - interval '1 minute');

select results_eq(
  $$select id from reivindicar_geracao()$$,
  array['00000000-0000-0000-0000-000000000901'::uuid],
  'claim pega a pendente mais antiga');
select results_eq(
  $$select status::text, tentativas from geracoes
    where id = '00000000-0000-0000-0000-000000000901'$$,
  $$values ('executando'::text, 1)$$,
  'claim marca executando e incrementa tentativas');
select results_eq(
  $$select id from reivindicar_geracao()$$,
  array['00000000-0000-0000-0000-000000000902'::uuid],
  'segundo claim pega a proxima (nao duplica)');
select is_empty(
  $$select id from reivindicar_geracao()$$,
  'fila vazia devolve 0 linhas');

-- Órfã com heartbeat velho volta para pendente
-- (now() é congelado para toda a transação do teste; envelhecemos o
-- heartbeat das duas linhas 'executando' explicitamente, senão a segunda
-- carrega o heartbeat "fresco" do claim e nunca seria vista como órfã)
update geracoes set heartbeat_em = now() - interval '10 minutes'
 where id in ('00000000-0000-0000-0000-000000000901',
              '00000000-0000-0000-0000-000000000902');
select results_eq(
  $$select resgatar_geracoes_orfas()$$,
  array[2],
  'resgate afeta as duas executando com heartbeat velho');
select results_eq(
  $$select status::text from geracoes
    where id = '00000000-0000-0000-0000-000000000901'$$,
  array['pendente'::text],
  'orfa com tentativas < 3 volta a pendente');

-- Na 3ª tentativa vira erro
update geracoes
   set status = 'executando', tentativas = 3,
       heartbeat_em = now() - interval '10 minutes'
 where id = '00000000-0000-0000-0000-000000000902';
select resgatar_geracoes_orfas();
select results_eq(
  $$select status::text, detalhe_erro is not null from geracoes
    where id = '00000000-0000-0000-0000-000000000902'$$,
  $$values ('erro'::text, true)$$,
  'orfa na 3a tentativa vira erro com detalhe');

select * from finish();
rollback;
