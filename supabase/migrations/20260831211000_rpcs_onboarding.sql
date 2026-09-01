create or replace function criar_unidade_com_admin(p_nome text)
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_unidade uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'É preciso estar autenticado para criar uma escola.';
  end if;
  if p_nome is null or length(trim(p_nome)) = 0 then
    raise exception 'Informe o nome da escola.';
  end if;
  insert into unidades (nome) values (trim(p_nome)) returning id into v_unidade;
  insert into perfis (user_id, unidade_id, papel)
    values ((select auth.uid()), v_unidade, 'admin');
  return v_unidade;
end;
$fn$;

create or replace function aceitar_convite(p_token uuid)
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v convites%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'É preciso estar autenticado para aceitar um convite.';
  end if;
  select * into v from convites where token = p_token;
  if not found then
    raise exception 'Convite não encontrado.';
  end if;
  if v.aceito_em is not null then
    raise exception 'Convite já utilizado.';
  end if;
  if v.expira_em < now() then
    raise exception 'Convite expirado.';
  end if;
  if lower(v.email) <> lower(coalesce((select auth.jwt()) ->> 'email', '')) then
    raise exception 'Este convite foi emitido para outro e-mail.';
  end if;
  insert into perfis (user_id, unidade_id, papel)
    values ((select auth.uid()), v.unidade_id, v.papel)
    on conflict (user_id, unidade_id) do update set papel = excluded.papel;
  update convites set aceito_em = now() where id = v.id;
  return v.unidade_id;
end;
$fn$;

revoke execute on function criar_unidade_com_admin(text) from public, anon;
revoke execute on function aceitar_convite(uuid) from public, anon;
grant execute on function criar_unidade_com_admin(text) to authenticated;
grant execute on function aceitar_convite(uuid) to authenticated;
