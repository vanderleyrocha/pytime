-- Fase 3A: edição manual e cenário oficial
-- (docs/superpowers/specs/2026-10-18-fase3-pos-geracao-design.md §3).
-- Gravação em cenarios/aulas_alocadas continua sem GRANT para authenticated:
-- o app confere o papel, revalida a grade com o motor e grava por estas
-- RPCs com o cliente service_role. As RPCs conferem o papel de novo
-- (p_usuario é o auth.uid() lido da sessão pelo servidor).

alter table cenarios
  add column nome text not null default 'Gerado'
    check (length(trim(nome)) between 1 and 80),
  add column origem text not null default 'gerado'
    check (origem in ('gerado', 'duplicado')),
  add column cenario_base_id uuid,
  add column versao int not null default 1,
  add column avaliacao jsonb,
  add column avaliado_em timestamptz,
  add column excecoes jsonb not null default '[]',
  add column atualizado_em timestamptz not null default now(),
  add column atualizado_por uuid references auth.users(id) on delete set null;

alter table cenarios add constraint cenarios_base_mesmo_tenant
  foreign key (cenario_base_id, unidade_id)
  references cenarios (id, unidade_id) on delete set null (cenario_base_id);

-- Um oficial por unidade, garantido pelo banco mesmo sob concorrência.
create unique index cenarios_um_oficial on cenarios (unidade_id) where oficial;

-- Unidade do cenário, se p_usuario for admin/coordenador nela; senão erro.
create or replace function cenario_exigir_gestor(p_cenario uuid, p_usuario uuid)
returns uuid
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_unidade uuid;
begin
  select unidade_id into v_unidade from cenarios where id = p_cenario;
  if v_unidade is null then
    raise exception 'Cenário não encontrado.';
  end if;
  if not exists (
    select 1 from perfis
    where user_id = p_usuario and unidade_id = v_unidade
      and papel in ('admin', 'coordenador')
  ) then
    raise exception 'Apenas gestores editam cenários.';
  end if;
  return v_unidade;
end;
$fn$;

-- Regrava a grade de um cenário (trava otimista por versão). A troca nunca
-- cria nem some aula: o multiconjunto de atribuições tem de ser o mesmo.
create or replace function salvar_grade_cenario(
  p_cenario uuid, p_versao_lida int, p_aulas jsonb,
  p_avaliacao jsonb, p_excecoes jsonb, p_usuario uuid
) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_unidade uuid;
  v_versao int;
begin
  v_unidade := cenario_exigir_gestor(p_cenario, p_usuario);
  select versao into v_versao from cenarios where id = p_cenario for update;
  if v_versao <> p_versao_lida then
    raise exception 'conflito_versao';
  end if;

  if exists (
    (select atribuicao_id, count(*) from aulas_alocadas
      where cenario_id = p_cenario group by atribuicao_id
     except
     select (a ->> 'atribuicao_id')::uuid, count(*)
      from jsonb_array_elements(p_aulas) a group by 1)
    union all
    (select (a ->> 'atribuicao_id')::uuid, count(*)
      from jsonb_array_elements(p_aulas) a group by 1
     except
     select atribuicao_id, count(*) from aulas_alocadas
      where cenario_id = p_cenario group by atribuicao_id)
  ) then
    raise exception 'Grade não corresponde ao cenário.';
  end if;

  delete from aulas_alocadas where cenario_id = p_cenario;
  insert into aulas_alocadas (unidade_id, cenario_id, atribuicao_id, slot_id)
    select v_unidade, p_cenario, (a ->> 'atribuicao_id')::uuid, (a ->> 'slot_id')::uuid
    from jsonb_array_elements(p_aulas) a;

  update cenarios set
    avaliacao = p_avaliacao,
    avaliado_em = case when p_avaliacao is null then null else now() end,
    excecoes = coalesce(p_excecoes, '[]'),
    versao = versao + 1,
    atualizado_em = now(),
    atualizado_por = p_usuario
  where id = p_cenario;
  return v_versao + 1;
end;
$fn$;

-- Copia o cenário (grade, avaliação e exceções) como nova versão editável.
create or replace function duplicar_cenario(p_cenario uuid, p_nome text, p_usuario uuid)
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_novo uuid;
begin
  perform cenario_exigir_gestor(p_cenario, p_usuario);
  insert into cenarios (unidade_id, geracao_id, nome, origem, cenario_base_id,
                        avaliacao, avaliado_em, excecoes, atualizado_por)
    select unidade_id, geracao_id,
           coalesce(nullif(trim(p_nome), ''), left('Cópia de ' || nome, 80)),
           'duplicado', id, avaliacao, avaliado_em, excecoes, p_usuario
    from cenarios where id = p_cenario
    returning id into v_novo;
  insert into aulas_alocadas (unidade_id, cenario_id, atribuicao_id, slot_id)
    select unidade_id, v_novo, atribuicao_id, slot_id
    from aulas_alocadas where cenario_id = p_cenario;
  return v_novo;
end;
$fn$;

-- Marca o cenário como o oficial da unidade (desmarca o anterior).
create or replace function marcar_oficial(p_cenario uuid, p_usuario uuid)
returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_unidade uuid;
begin
  v_unidade := cenario_exigir_gestor(p_cenario, p_usuario);
  update cenarios set oficial = false, atualizado_em = now(), atualizado_por = p_usuario
    where unidade_id = v_unidade and oficial and id <> p_cenario;
  update cenarios set oficial = true, atualizado_em = now(), atualizado_por = p_usuario
    where id = p_cenario;
end;
$fn$;

create or replace function renomear_cenario(p_cenario uuid, p_nome text, p_usuario uuid)
returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  perform cenario_exigir_gestor(p_cenario, p_usuario);
  update cenarios set nome = trim(p_nome), atualizado_em = now(), atualizado_por = p_usuario
    where id = p_cenario;
end;
$fn$;

revoke execute on function cenario_exigir_gestor(uuid, uuid) from public, anon, authenticated;
revoke execute on function salvar_grade_cenario(uuid, int, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function duplicar_cenario(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function marcar_oficial(uuid, uuid) from public, anon, authenticated;
revoke execute on function renomear_cenario(uuid, text, uuid) from public, anon, authenticated;
grant execute on function cenario_exigir_gestor(uuid, uuid) to service_role;
grant execute on function salvar_grade_cenario(uuid, int, jsonb, jsonb, jsonb, uuid) to service_role;
grant execute on function duplicar_cenario(uuid, text, uuid) to service_role;
grant execute on function marcar_oficial(uuid, uuid) to service_role;
grant execute on function renomear_cenario(uuid, text, uuid) to service_role;
