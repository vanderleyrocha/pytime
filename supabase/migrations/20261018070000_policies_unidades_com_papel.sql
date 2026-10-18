-- Policies de escrita avaliam o papel uma vez por consulta, não por linha
-- (backlog da Fase 2C). tenho_papel(unidade_id, ...) recebe a coluna da
-- linha, então o Postgres a executa linha a linha; envolver em (select ...)
-- não resolve, pois a subconsulta continua correlacionada. A função abaixo
-- não depende da linha e vira initplan: unidade_id in (select ...), o mesmo
-- padrão de minhas_unidades(). Semântica idêntica às policies anteriores.

create or replace function unidades_com_papel(variadic p_papeis papel[])
returns setof uuid
language sql security definer set search_path = public stable
as $fn$
  select unidade_id from perfis
  where user_id = (select auth.uid()) and papel = any (p_papeis);
$fn$;

revoke execute on function unidades_com_papel(papel[]) from public, anon;
grant execute on function unidades_com_papel(papel[]) to authenticated, service_role;

-- Cadastros e atribuições: escrita de admin/coordenador.
do $blk$
declare t text;
begin
  foreach t in array array[
    'turnos', 'slots', 'turmas', 'disciplinas', 'professores',
    'disponibilidades', 'recursos', 'atribuicoes', 'regras'
  ] loop
    execute format('drop policy %I on %I', t || '_escrita', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (unidade_id in (select unidades_com_papel(''admin'', ''coordenador'')))
         with check (unidade_id in (select unidades_com_papel(''admin'', ''coordenador'')))',
      t || '_escrita', t);
  end loop;
end
$blk$;

drop policy atribuicao_recursos_escrita on atribuicao_recursos;
create policy atribuicao_recursos_escrita on atribuicao_recursos for all to authenticated
  using (exists (select 1 from atribuicoes a
                 where a.id = atribuicao_id
                   and a.unidade_id in (select unidades_com_papel('admin', 'coordenador'))))
  with check (exists (select 1 from atribuicoes a
                      where a.id = atribuicao_id
                        and a.unidade_id in (select unidades_com_papel('admin', 'coordenador'))));

drop policy geracoes_insert on geracoes;
create policy geracoes_insert on geracoes for insert to authenticated
  with check (unidade_id in (select unidades_com_papel('admin', 'coordenador'))
              and status = 'pendente');

-- Gestão de pessoas e da unidade: só admin.
drop policy convites_select on convites;
create policy convites_select on convites for select to authenticated
  using (unidade_id in (select unidades_com_papel('admin')));
drop policy convites_insert on convites;
create policy convites_insert on convites for insert to authenticated
  with check (unidade_id in (select unidades_com_papel('admin')));
drop policy convites_delete on convites;
create policy convites_delete on convites for delete to authenticated
  using (unidade_id in (select unidades_com_papel('admin')));

drop policy perfis_insert on perfis;
create policy perfis_insert on perfis for insert to authenticated
  with check (unidade_id in (select unidades_com_papel('admin')));
drop policy perfis_update on perfis;
create policy perfis_update on perfis for update to authenticated
  using (unidade_id in (select unidades_com_papel('admin')))
  with check (unidade_id in (select unidades_com_papel('admin')));
drop policy perfis_delete on perfis;
create policy perfis_delete on perfis for delete to authenticated
  using (unidade_id in (select unidades_com_papel('admin')));

drop policy unidades_update on unidades;
create policy unidades_update on unidades for update to authenticated
  using (id in (select unidades_com_papel('admin')))
  with check (id in (select unidades_com_papel('admin')));
