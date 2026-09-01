-- Integridade de tenant: FKs compostas impedem que uma linha da unidade X
-- referencie pai da unidade Y. As FKs simples originais permanecem.
alter table turnos add constraint turnos_id_unidade_unica unique (id, unidade_id);
alter table slots add constraint slots_id_unidade_unica unique (id, unidade_id);
alter table turmas add constraint turmas_id_unidade_unica unique (id, unidade_id);
alter table professores add constraint professores_id_unidade_unica unique (id, unidade_id);
alter table disciplinas add constraint disciplinas_id_unidade_unica unique (id, unidade_id);
alter table geracoes add constraint geracoes_id_unidade_unica unique (id, unidade_id);
alter table cenarios add constraint cenarios_id_unidade_unica unique (id, unidade_id);
alter table atribuicoes add constraint atribuicoes_id_unidade_unica unique (id, unidade_id);

alter table slots add constraint slots_turno_mesmo_tenant
  foreign key (turno_id, unidade_id) references turnos (id, unidade_id) on delete cascade;
alter table turmas add constraint turmas_turno_mesmo_tenant
  foreign key (turno_id, unidade_id) references turnos (id, unidade_id) on delete restrict;
alter table disponibilidades add constraint disponibilidades_professor_mesmo_tenant
  foreign key (professor_id, unidade_id) references professores (id, unidade_id) on delete cascade;
alter table disponibilidades add constraint disponibilidades_slot_mesmo_tenant
  foreign key (slot_id, unidade_id) references slots (id, unidade_id) on delete cascade;
alter table atribuicoes add constraint atribuicoes_professor_mesmo_tenant
  foreign key (professor_id, unidade_id) references professores (id, unidade_id) on delete restrict;
alter table atribuicoes add constraint atribuicoes_disciplina_mesmo_tenant
  foreign key (disciplina_id, unidade_id) references disciplinas (id, unidade_id) on delete restrict;
alter table atribuicoes add constraint atribuicoes_turma_mesmo_tenant
  foreign key (turma_id, unidade_id) references turmas (id, unidade_id) on delete cascade;
alter table cenarios add constraint cenarios_geracao_mesmo_tenant
  foreign key (geracao_id, unidade_id) references geracoes (id, unidade_id) on delete cascade;
alter table aulas_alocadas add constraint aulas_cenario_mesmo_tenant
  foreign key (cenario_id, unidade_id) references cenarios (id, unidade_id) on delete cascade;
alter table aulas_alocadas add constraint aulas_atribuicao_mesmo_tenant
  foreign key (atribuicao_id, unidade_id) references atribuicoes (id, unidade_id) on delete cascade;
alter table aulas_alocadas add constraint aulas_slot_mesmo_tenant
  foreign key (slot_id, unidade_id) references slots (id, unidade_id) on delete cascade;
alter table perfis add constraint perfis_professor_mesmo_tenant
  foreign key (professor_id, unidade_id) references professores (id, unidade_id)
  on delete set null (professor_id);

-- N:N sem unidade_id própria: trigger valida o par. Roda com os privilégios
-- do chamador: sob RLS, recurso de outra unidade é invisível (unidade nula)
-- e o par é rejeitado; service_role vê tudo e compara os valores reais.
create or replace function validar_tenant_atribuicao_recurso()
returns trigger
language plpgsql
as $fn$
declare
  v_unidade_atribuicao uuid;
  v_unidade_recurso uuid;
begin
  select unidade_id into v_unidade_atribuicao
    from atribuicoes where id = new.atribuicao_id;
  select unidade_id into v_unidade_recurso
    from recursos where id = new.recurso_id;
  if v_unidade_atribuicao is distinct from v_unidade_recurso then
    raise exception 'Atribuição e recurso pertencem a unidades diferentes.';
  end if;
  return new;
end;
$fn$;

create trigger atribuicao_recursos_tenant
  before insert or update on atribuicao_recursos
  for each row execute function validar_tenant_atribuicao_recurso();

-- Índices para policies de RLS e joins frequentes (reviews das T5/T6)
create index atribuicoes_unidade on atribuicoes (unidade_id);
create index atribuicoes_professor on atribuicoes (professor_id);
create index atribuicoes_turma on atribuicoes (turma_id);
create index atribuicoes_disciplina on atribuicoes (disciplina_id);
create index aulas_alocadas_atribuicao on aulas_alocadas (atribuicao_id);
create index aulas_alocadas_slot on aulas_alocadas (slot_id);
