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
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
- Primeira vez:

```bash
cd app
vercel login
vercel link                                   # projeto "pytime", root = app/
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add NEXT_PUBLIC_SITE_URL production   # https://<dominio>.vercel.app
vercel deploy --prod
```

- Smoke: login no domínio de produção → painel carrega → `/geracoes` abre.

## 3. Worker (Fly.io)

- App: `pytime-worker` (região `gru`), 1 máquina sempre ligada, sem HTTP.
- O build usa a raiz do repo como contexto (o Dockerfile copia `engine/` e
  `worker/`); a máquina local não precisa de Docker (`--remote-only`).
- Primeira vez (da RAIZ do repo):

```bash
fly auth login
fly apps create pytime-worker
fly secrets set --app pytime-worker SUPABASE_DB_URL="postgresql://postgres:<SENHA>@db.jrdnelyzvpvniukqamdm.supabase.co:5432/postgres"
fly deploy --remote-only
```

- No Fly o host direto funciona por IPv6; se falhar, usar o pooler session
  `postgres.jrdnelyzvpvniukqamdm@aws-0-sa-east-1.pooler.supabase.com:5432`.
- Logs: `fly logs --app pytime-worker` (deve mostrar "Worker PyTime iniciado."
  e, sem jobs, silêncio — poll de 5 s).

## Rotina de atualização

1. `git push` (master).
2. Banco mudou? `npx supabase db push` + rodar os testes de RLS.
3. App: `cd app && vercel deploy --prod`.
4. Worker mudou (ou o engine)? `fly deploy --remote-only`.
