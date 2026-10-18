begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'caio@a.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A'),
  ('00000000-0000-0000-0000-00000000001b', 'Escola B');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'coordenador'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001b', 'admin'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000001a', 'professor');

create temp table pacote (dados jsonb);
grant select, update on pacote to authenticated;
insert into pacote values ($json${
  "versao": "1.0",
  "origem": {"sistema": "escolajba", "gerado_em": "2026-10-18T10:00:00-05:00"},
  "turnos": [{"codigo": "INTEGRAL", "nome": "Integral"}],
  "horarios": [
    {"turno": "INTEGRAL", "dia": 0, "ordem": 0, "hora_inicio": "07:00", "hora_fim": "07:50"},
    {"turno": "INTEGRAL", "dia": 0, "ordem": 1}
  ],
  "turmas": [{"codigo": "TUR-201", "nome": "6º ano A", "turno": "INTEGRAL"}],
  "disciplinas": [{"codigo": "DIS-12", "nome": "Matemática"}, {"codigo": "DIS-14", "nome": "História"}],
  "professores": [{"codigo": "SRV-102", "nome": "Bruno"}],
  "recursos": [{"codigo": "LAB", "nome": "Laboratório", "capacidade": 1}],
  "disponibilidades": [{"professor": "SRV-102", "turno": "INTEGRAL", "dia": 0, "ordem": 1, "status": "evita"}],
  "atribuicoes": [{"professor": "SRV-102", "disciplina": "DIS-12", "turma": "TUR-201",
                   "carga_semanal": 2, "geminadas": 1, "recursos": ["LAB"]}],
  "regras": [
    {"codigo": "R-ULT", "tipo": "ultimo_horario", "hard": true, "peso": 1, "ativa": true,
     "parametros": {"disciplina": "DIS-12"}},
    {"codigo": "R-NMD", "tipo": "nao_mesmo_dia", "hard": false, "peso": 2, "ativa": true,
     "parametros": {"disciplina_a": "DIS-12", "disciplina_b": "DIS-14"}}
  ]
}$json$);

-- Professor não importa
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"caio@a.com","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select importar_pacote_carga('00000000-0000-0000-0000-00000000001a', (select dados from pacote))$$,
  null, 'Apenas gestores importam dados.', 'professor não importa pacote');

-- Coordenadora da Escola A importa
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select importar_pacote_carga('00000000-0000-0000-0000-00000000001a', (select dados from pacote))$$,
  'gestor importa pacote');

select results_eq(
  $$select (select count(*) from turnos)::int, (select count(*) from slots)::int,
           (select count(*) from turmas)::int, (select count(*) from disciplinas)::int,
           (select count(*) from professores)::int, (select count(*) from recursos)::int,
           (select count(*) from disponibilidades)::int, (select count(*) from atribuicoes)::int,
           (select count(*) from atribuicao_recursos)::int, (select count(*) from regras)::int$$,
  $$values (1, 2, 1, 2, 1, 1, 1, 1, 1, 2)$$,
  'todas as entidades gravadas');
select is(
  (select turno_id from turmas where codigo_externo = 'TUR-201'),
  (select id from turnos where codigo_externo = 'INTEGRAL'),
  'turma referencia o turno pelo código');
select is(
  (select hora_inicio::text from slots where ordem = 0), '07:00:00',
  'horário guarda hora de início');
select is(
  (select status::text from disponibilidades d join slots s on s.id = d.slot_id where s.ordem = 1),
  'evita', 'disponibilidade aponta para o slot (turno, dia, ordem)');
select is(
  (select parametros ->> 'disciplina_id' from regras where codigo_externo = 'R-ULT'),
  (select id::text from disciplinas where codigo_externo = 'DIS-12'),
  'parâmetro disciplina vira disciplina_id (uuid)');
select is(
  (select parametros from regras where codigo_externo = 'R-NMD'),
  jsonb_build_object(
    'disciplina_a', (select id from disciplinas where codigo_externo = 'DIS-12'),
    'disciplina_b', (select id from disciplinas where codigo_externo = 'DIS-14')),
  'parâmetros disciplina_a/b viram uuids');

-- Reimportação com nomes e carga alterados atualiza sem duplicar
update pacote set dados = jsonb_set(jsonb_set(jsonb_set(dados,
  '{turmas,0,nome}', '"6º ano A (manhã)"'),
  '{atribuicoes,0,carga_semanal}', '3'),
  '{atribuicoes,0,recursos}', '[]');
select lives_ok(
  $$select importar_pacote_carga('00000000-0000-0000-0000-00000000001a', (select dados from pacote))$$,
  'reimportação do mesmo pacote');
select results_eq(
  $$select (select count(*) from turmas)::int, (select count(*) from slots)::int,
           (select count(*) from atribuicoes)::int, (select count(*) from regras)::int$$,
  $$values (1, 2, 1, 2)$$,
  'reimportação não duplica');
select is((select nome from turmas), '6º ano A (manhã)', 'reimportação atualiza o nome');
select is((select carga_semanal from atribuicoes), 3, 'reimportação atualiza a carga');
select is((select count(*)::int from atribuicao_recursos), 0,
  'recursos da atribuição seguem o pacote');

-- Referência inexistente aborta tudo (atômico)
update pacote set dados = jsonb_set(jsonb_set(dados,
  '{disciplinas,0,nome}', '"Matemática alterada"'),
  '{atribuicoes,0,turma}', '"TUR-999"');
select throws_ok(
  $$select importar_pacote_carga('00000000-0000-0000-0000-00000000001a', (select dados from pacote))$$,
  null, null, 'referência a código inexistente é rejeitada');
select is((select nome from disciplinas where codigo_externo = 'DIS-12'), 'Matemática',
  'falha não deixa gravação parcial');

-- Mesmo código em outra unidade é independente
update pacote set dados = jsonb_set(dados, '{atribuicoes,0,turma}', '"TUR-201"');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
select importar_pacote_carga('00000000-0000-0000-0000-00000000001b', (select dados from pacote));
select is(
  (select count(*)::int from turmas where codigo_externo = 'TUR-201'), 2,
  'mesmo código em unidades diferentes');

select * from finish();
rollback;
