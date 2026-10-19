begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'coordenador');

create temp table pacote (dados jsonb);
grant select, update on pacote to authenticated;
insert into pacote values ($json${
  "versao": "1.0",
  "origem": {"sistema": "escolajba", "gerado_em": "2026-10-19T10:00:00-05:00"},
  "turnos": [{"codigo": "MANHA", "nome": "Manhã"}],
  "horarios": [
    {"turno": "MANHA", "dia": 0, "ordem": 0},
    {"turno": "MANHA", "dia": 0, "ordem": 1}
  ],
  "turmas": [{"codigo": "TUR-1", "nome": "1º A", "turno": "MANHA"}],
  "disciplinas": [{"codigo": "DIS-1", "nome": "Ed. Física"}],
  "professores": [{"codigo": "SRV-1", "nome": "Bruno"}],
  "turmas_sem_aula": [{"turma": "TUR-1", "turno": "MANHA", "dia": 0, "ordem": 1}],
  "disponibilidades_disciplina": [
    {"disciplina": "DIS-1", "turno": "MANHA", "dia": 0, "ordem": 0, "status": "evita"}
  ],
  "atribuicoes": [{"professor": "SRV-1", "disciplina": "DIS-1", "turma": "TUR-1",
                   "carga_semanal": 1}],
  "regras": [
    {"codigo": "R-DD", "tipo": "disponibilidade_disciplina", "hard": true},
    {"codigo": "R-PD", "tipo": "preferencia_disciplina_horario", "hard": false}
  ]
}$json$);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select importar_pacote_carga('00000000-0000-0000-0000-00000000001a', (select dados from pacote))
     -> 'turmas_sem_aula')::int,
  1, 'importa e conta os horários sem aula');
select is(
  (select s.ordem from turmas_sem_aula t join slots s on s.id = t.slot_id), 1,
  'horário sem aula aponta para o slot (turno, dia, ordem)');
select is(
  (select status::text from disponibilidades_disciplina), 'evita',
  'disponibilidade da disciplina gravada');
select is((select count(*)::int from regras), 2, 'regras novas importadas');

-- Reimportação: não duplica e atualiza o status
update pacote set dados = jsonb_set(dados,
  '{disponibilidades_disciplina,0,status}', '"indisponivel"');
select importar_pacote_carga('00000000-0000-0000-0000-00000000001a', (select dados from pacote));
select results_eq(
  $$select (select count(*) from turmas_sem_aula)::int,
           (select count(*) from disponibilidades_disciplina)::int$$,
  $$values (1, 1)$$, 'reimportação não duplica');
select is((select status::text from disponibilidades_disciplina), 'indisponivel',
  'reimportação atualiza o status');

select * from finish();
rollback;
