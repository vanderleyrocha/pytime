-- Fila de gerações: claim atômico e resgate de órfãs (spec §2).
-- Chamadas apenas pelo worker (credencial privilegiada); revogadas dos
-- papéis de cliente.

create or replace function reivindicar_geracao()
returns setof geracoes
language sql
as $fn$
  update geracoes g
     set status = 'executando',
         tentativas = g.tentativas + 1,
         heartbeat_em = now(),
         atualizada_em = now()
   where g.id = (
     select id from geracoes
      where status = 'pendente'
      order by criada_em
      for update skip locked
      limit 1
   )
  returning g.*;
$fn$;

create or replace function resgatar_geracoes_orfas(
  p_limite interval default '2 minutes'
)
returns integer
language plpgsql
as $fn$
declare
  v_erros integer;
  v_retries integer;
begin
  update geracoes
     set status = 'erro',
         detalhe_erro = 'Worker interrompido; limite de 3 tentativas atingido.',
         atualizada_em = now()
   where status = 'executando'
     and heartbeat_em < now() - p_limite
     and tentativas >= 3;
  get diagnostics v_erros = row_count;

  update geracoes
     set status = 'pendente',
         atualizada_em = now()
   where status = 'executando'
     and heartbeat_em < now() - p_limite;
  get diagnostics v_retries = row_count;

  return v_erros + v_retries;
end;
$fn$;

revoke execute on function reivindicar_geracao() from public, anon, authenticated;
revoke execute on function resgatar_geracoes_orfas(interval) from public, anon, authenticated;
