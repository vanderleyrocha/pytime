# Deploy do PyTime (Fase 2)

Três peças: Supabase (banco/auth), Vercel (app Next.js), Fly.io (worker).

## 1. Supabase

- Projeto: `pytime` (`jrdnelyzvpvniukqamdm`, sa-east-1).
- Migrations: `npx supabase link --project-ref <ref>` e `npx supabase db push`.
- Testes de RLS: `SUPABASE_DB_URL=... python supabase/tests/rodar_testes.py`.
- Auth → URL Configuration: Site URL do ambiente + Redirect URLs (`<site>/**`),
  mantendo `http://localhost:3000/**` para dev.
- Auth → Email Templates → Invite user: link
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}`

## 2. App (Vercel)

- Root directory: `app/`.
- Envs (production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `VALIDADOR_URL` e
  `VALIDADOR_TOKEN` (edição manual, Fase 3A). `SUPABASE_SERVICE_ROLE_KEY` e
  `VALIDADOR_TOKEN` são server-only: **nunca** com prefixo `NEXT_PUBLIC_`.
- A integração Git da Vercel gera um preview por PR (Root Directory = `app`).
- Primeira vez:

```bash
cd app
vercel login
vercel link                                   # projeto "pytime", root = app/
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add NEXT_PUBLIC_SITE_URL production   # https://<dominio>.vercel.app
vercel env add VALIDADOR_URL production          # https://pytime-worker.fly.dev
vercel env add VALIDADOR_TOKEN production        # o mesmo secret do Fly
vercel deploy --prod
```

- Smoke: login no domínio de produção → painel carrega → `/geracoes` abre.

## 3. Worker e validador (Fly.io)

- App: `pytime-worker` (região `gru`) com dois processos (`fly.toml`):
  - `worker`: loop da fila de gerações, 1 máquina sempre ligada, sem HTTP;
  - `validador`: `POST /avaliar` da edição manual + `GET /saude`, 1 máquina
    sempre ligada (`https://pytime-worker.fly.dev`). Guarda em memória um
    modelo preparado por instância (≈75 MB em 80 turmas, até 4 instâncias).
- O build usa a raiz do repo como contexto (o Dockerfile copia `engine/` e
  `worker/`); a máquina local não precisa de Docker (`--remote-only`).
- Primeira vez (da RAIZ do repo):

```bash
fly auth login
fly apps create pytime-worker
fly secrets set --app pytime-worker SUPABASE_DB_URL="postgresql://postgres:<SENHA>@db.jrdnelyzvpvniukqamdm.supabase.co:5432/postgres"
fly secrets set --app pytime-worker VALIDADOR_TOKEN="$(openssl rand -hex 32)"
fly deploy --remote-only
```

- O mesmo `VALIDADOR_TOKEN` vai para a Vercel (com `VALIDADOR_URL`, §2): só
  as Server Actions do app chamam o validador; o navegador nunca recebe o
  token.
- Smoke do validador: `curl https://pytime-worker.fly.dev/saude` → `{"ok": true}`;
  sem `Authorization: Bearer <token>`, `POST /avaliar` responde 401.
- No Fly o host direto funciona por IPv6; se falhar, usar o pooler session
  `postgres.jrdnelyzvpvniukqamdm@aws-0-sa-east-1.pooler.supabase.com:5432`.
- Rodar a suíte do worker exige parar a máquina do processo `worker` antes
  (`fly machine list --app pytime-worker` mostra o processo de cada uma;
  `fly machine stop <id>`): os testes reivindicam a geração pendente mais
  antiga e o worker ao vivo rouba o job. O validador não precisa parar.
  Religue com `fly machine start <id>`.
- Logs: `fly logs --app pytime-worker` (deve mostrar "Worker PyTime iniciado.",
  "Validador PyTime ouvindo na porta 8080." e, sem jobs, silêncio — poll de 5 s).

## 4. Staging (testes de banco no CI)

Projeto Supabase separado, só para testes: o CI roda nele os testes de banco
do worker e os de RLS (pgTAP). **Nunca** aponte o CI para o banco de produção,
porque os testes do worker reivindicam a geração pendente mais antiga. E
nunca ligue um worker do Fly contra o staging.

1. **Criar o projeto**: dashboard do Supabase → *New project* → nome
   `pytime-staging`, região *South America (São Paulo)*, senha forte do banco
   (guarde no gerenciador de senhas). O plano gratuito permite 2 projetos
   ativos por organização (produção + staging).
2. **Aplicar as migrations** (da raiz do repo), sem trocar o `link` da
   produção. Use a URL do *Session pooler*: dashboard do staging →
   *Connect* → aba *Direct* (Connection string) → método *Session pooler*
   (porta 5432; a 6543 é o *Transaction pooler*, que não serve para pgTAP
   nem para os testes do worker). Ela tem o formato
   `postgresql://postgres.<ref-staging>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`.

   ```bash
   npx supabase db push --db-url "<URL do session pooler do staging>"
   ```
3. **Conferir localmente** (a mesma URL):

   ```bash
   # PowerShell: $env:SUPABASE_DB_URL = "<URL>"
   SUPABASE_DB_URL="<URL>" python supabase/tests/rodar_testes.py   # RESULTADO: OK
   cd worker && SUPABASE_DB_URL="<URL>" pytest -q                  # sem "skipped"
   ```
4. **Secret no GitHub**: repositório → *Settings* → *Secrets and variables* →
   *Actions* → *New repository secret*, nome `SUPABASE_DB_URL_STAGING`, valor =
   a URL do **session pooler**. Os runners do GitHub não têm IPv6, e o host
   direto `db.<ref>.supabase.co` só responde por IPv6.
5. **Secrets do E2E** (mesmo caminho do passo 4), todos do **staging**:
   `SUPABASE_URL_STAGING` (*Project URL*, `https://<ref-staging>.supabase.co`),
   `SUPABASE_ANON_KEY_STAGING` (chave pública/publishable) e
   `SUPABASE_SERVICE_ROLE_KEY_STAGING` (chave secreta). O job
   `staging-chaves` confere as três; o job `e2e` (Playwright) cria uma
   escola descartável via service_role, sobe um validador local com token
   descartável e apaga a massa no fim. Sem os secrets, o E2E é pulado.
6. **Manter em dia**: o job `worker` do CI aplica no staging as migrations
   do branch (`supabase db push --db-url`) antes dos testes; o passo 2 só é
   preciso fora do CI. O projeto gratuito **pausa após ~7 dias sem
   uso**; se o CI falhar com erro de conexão, reative no dashboard.

## Rotina de atualização

Passo a passo detalhado (merge, migrations, Vercel, Fly, rollback):
[`rotina-de-atualizacao.md`](rotina-de-atualizacao.md). Resumo:

1. `git push` (master).
2. Banco mudou? `npx supabase db push` (produção) **e**
   `npx supabase db push --db-url <staging>` + rodar os testes de RLS.
3. App: `cd app && vercel deploy --prod`.
4. Worker, validador ou engine mudou? `fly deploy --remote-only` (atualiza os
   dois processos).

### Primeira subida da Fase 3A (edição manual)

Ordem obrigatória — as Actions novas usam colunas e RPCs das migrations:

1. Produção: `npx supabase db push` (aplica `20261018060000_fase3a_edicao`,
   `20261018070000_policies_unidades_com_papel` e
   `20261018080000_rpcs_cadastros`; o staging já as recebeu pelo CI).
2. Vercel: `vercel env add VALIDADOR_URL production` e
   `vercel env add VALIDADOR_TOKEN production` (§2).
3. Merge do PR na `master` → `vercel deploy --prod` (ou deploy automático).
4. `fly deploy --remote-only` (worker grava a avaliação exata pós-geração).
5. Smoke: gerar → abrir o cenário → custo "avaliado" → Editar → trocar →
   veredito → Salvar → Duplicar → Marcar como oficial → exportar para o
   escolajba (o arquivo traz `origem.oficial = true` e a troca feita).
