-- pgTAP fora do schema exposto pelo PostgREST. O search_path do banco
-- passa a incluir extensions para os testes seguirem chamando plan(),
-- ok(), etc. sem qualificação.
drop extension if exists pgtap;
create extension pgtap with schema extensions;
alter database postgres set search_path to "$user", public, extensions;
