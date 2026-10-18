begin;
select plan(24);

-- Ana coordena A; Caio é professor em A; Beto coordena B.
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

-- Estrutura mínima da Escola A: 1 turno, 2 slots, 1 turma, 2 atribuições.
insert into turnos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000001a', 'Manhã');
insert into slots (id, unidade_id, turno_id, dia, ordem, hora_inicio, hora_fim) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-0000000000f1', 1, 0, '07:00', '07:50'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-0000000000f1', 1, 1, '07:50', '08:40');
insert into turmas (id, unidade_id, nome, turno_id) values
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-00000000001a', '6º A',
   '00000000-0000-0000-0000-0000000000f1');
insert into disciplinas (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-00000000001a', 'Matemática'),
  ('00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-00000000001a', 'Português');
insert into professores (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-00000000001a', 'Prof 1');
insert into atribuicoes (id, unidade_id, professor_id, disciplina_id, turma_id, carga_semanal) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000081',
   '00000000-0000-0000-0000-000000000071', 1),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000082',
   '00000000-0000-0000-0000-000000000071', 1);

-- Uma geração concluída com um cenário (como o worker grava).
insert into geracoes (id, unidade_id, status, instancia) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000001a',
   'concluida', '{}'::jsonb);
insert into cenarios (id, unidade_id, geracao_id) values
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-0000000000d1');
insert into aulas_alocadas (unidade_id, cenario_id, atribuicao_id, slot_id) values
  ('00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-0000000000c9',
   '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000051'),
  ('00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-0000000000c9',
   '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000052');

-- 1–3: defaults das colunas novas no cenário criado como o worker cria
select is((select nome from cenarios where id = '00000000-0000-0000-0000-0000000000c9'),
  'Gerado', 'cenário gerado nasce com nome padrão');
select is((select versao from cenarios where id = '00000000-0000-0000-0000-0000000000c9'),
  1, 'cenário nasce na versão 1');
select is((select excecoes from cenarios where id = '00000000-0000-0000-0000-0000000000c9'),
  '[]'::jsonb, 'cenário nasce sem exceções');

-- 4–7: cliente autenticado (gestora!) não executa as RPCs: só o servidor
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select salvar_grade_cenario('00000000-0000-0000-0000-0000000000c9', 1, '[]'::jsonb,
      null, '[]'::jsonb, '00000000-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'authenticated não executa salvar_grade_cenario');
select throws_ok(
  $$select duplicar_cenario('00000000-0000-0000-0000-0000000000c9', 'X',
      '00000000-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'authenticated não executa duplicar_cenario');
select throws_ok(
  $$select marcar_oficial('00000000-0000-0000-0000-0000000000c9',
      '00000000-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'authenticated não executa marcar_oficial');
select throws_ok(
  $$select renomear_cenario('00000000-0000-0000-0000-0000000000c9', 'X',
      '00000000-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'authenticated não executa renomear_cenario');

-- 8: leitura das colunas novas continua escopada pela unidade
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"beto@b.com","role":"authenticated"}', true);
select is((select count(*)::int from cenarios), 0, 'gestor de outra unidade não vê o cenário');

reset role;
set local role service_role;

-- 9–12: salvar_grade_cenario (troca as duas aulas de lugar)
select is(
  salvar_grade_cenario('00000000-0000-0000-0000-0000000000c9', 1,
    '[{"atribuicao_id":"00000000-0000-0000-0000-0000000000e1","slot_id":"00000000-0000-0000-0000-000000000052"},
      {"atribuicao_id":"00000000-0000-0000-0000-0000000000e2","slot_id":"00000000-0000-0000-0000-000000000051"}]'::jsonb,
    '{"violacoes_hard":[],"custos":[],"custo_total":3,"tempo_segundos":0.1}'::jsonb,
    '[]'::jsonb, '00000000-0000-0000-0000-0000000000a1'),
  2, 'salvar com a versão lida devolve a versão seguinte');
select is(
  (select slot_id from aulas_alocadas
    where cenario_id = '00000000-0000-0000-0000-0000000000c9'
      and atribuicao_id = '00000000-0000-0000-0000-0000000000e1'),
  '00000000-0000-0000-0000-000000000052'::uuid, 'aulas regravadas com a troca');
select is(
  (select (avaliacao ->> 'custo_total')::int from cenarios
    where id = '00000000-0000-0000-0000-0000000000c9'),
  3, 'avaliação gravada no cenário');
select throws_ok(
  $$select salvar_grade_cenario('00000000-0000-0000-0000-0000000000c9', 1,
      '[{"atribuicao_id":"00000000-0000-0000-0000-0000000000e1","slot_id":"00000000-0000-0000-0000-000000000051"},
        {"atribuicao_id":"00000000-0000-0000-0000-0000000000e2","slot_id":"00000000-0000-0000-0000-000000000052"}]'::jsonb,
      null, '[]'::jsonb, '00000000-0000-0000-0000-0000000000a1')$$,
  'P0001', 'conflito_versao', 'versão velha é recusada');

-- 13–15: correspondência das aulas e papel
select throws_ok(
  $$select salvar_grade_cenario('00000000-0000-0000-0000-0000000000c9', 2,
      '[{"atribuicao_id":"00000000-0000-0000-0000-0000000000e1","slot_id":"00000000-0000-0000-0000-000000000051"}]'::jsonb,
      null, '[]'::jsonb, '00000000-0000-0000-0000-0000000000a1')$$,
  'P0001', 'Grade não corresponde ao cenário.', 'aula a menos é recusada');
select throws_ok(
  $$select salvar_grade_cenario('00000000-0000-0000-0000-0000000000c9', 2,
      '[{"atribuicao_id":"00000000-0000-0000-0000-0000000000e1","slot_id":"00000000-0000-0000-0000-000000000051"},
        {"atribuicao_id":"00000000-0000-0000-0000-0000000000e2","slot_id":"00000000-0000-0000-0000-000000000052"}]'::jsonb,
      null, '[]'::jsonb, '00000000-0000-0000-0000-0000000000c1')$$,
  'P0001', 'Apenas gestores editam cenários.', 'professor não salva');
select throws_ok(
  $$select salvar_grade_cenario('00000000-0000-0000-0000-0000000000c9', 2,
      '[{"atribuicao_id":"00000000-0000-0000-0000-0000000000e1","slot_id":"00000000-0000-0000-0000-000000000051"},
        {"atribuicao_id":"00000000-0000-0000-0000-0000000000e2","slot_id":"00000000-0000-0000-0000-000000000052"}]'::jsonb,
      null, '[]'::jsonb, '00000000-0000-0000-0000-0000000000b1')$$,
  'P0001', 'Apenas gestores editam cenários.', 'gestor de outra unidade não salva');

-- 16–18: duplicar
select isnt(
  duplicar_cenario('00000000-0000-0000-0000-0000000000c9', 'Versão B',
    '00000000-0000-0000-0000-0000000000a1'),
  null, 'duplicar devolve o id do novo cenário');
select is(
  (select count(*)::int from aulas_alocadas a join cenarios c on c.id = a.cenario_id
    where c.nome = 'Versão B'),
  2, 'cópia leva todas as aulas');
select is(
  (select origem || ':' || (cenario_base_id = '00000000-0000-0000-0000-0000000000c9')::text
    from cenarios where nome = 'Versão B'),
  'duplicado:true', 'cópia registra origem e cenário base');

-- 19–21: oficial único por unidade
select lives_ok(
  $$select marcar_oficial('00000000-0000-0000-0000-0000000000c9',
      '00000000-0000-0000-0000-0000000000a1')$$,
  'gestor marca o oficial');
select lives_ok(
  $$select marcar_oficial((select id from cenarios where nome = 'Versão B'),
      '00000000-0000-0000-0000-0000000000a1')$$,
  'marcar outro troca o oficial');
select is(
  (select array_agg(nome order by nome) from cenarios
    where unidade_id = '00000000-0000-0000-0000-00000000001a' and oficial),
  array['Versão B'], 'só um oficial na unidade');

-- 22: o índice impede dois oficiais mesmo fora da RPC
select throws_ok(
  $$update cenarios set oficial = true
      where id = '00000000-0000-0000-0000-0000000000c9'$$,
  '23505', null, 'dois oficiais na mesma unidade são rejeitados');

-- 23–24: renomear
select lives_ok(
  $$select renomear_cenario('00000000-0000-0000-0000-0000000000c9', 'Primeira versão',
      '00000000-0000-0000-0000-0000000000a1')$$,
  'gestor renomeia');
select throws_ok(
  $$select renomear_cenario('00000000-0000-0000-0000-0000000000c9', '   ',
      '00000000-0000-0000-0000-0000000000a1')$$,
  '23514', null, 'nome vazio é rejeitado');

select * from finish();
rollback;
