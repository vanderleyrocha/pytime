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

- O mesmo `VALIDADOR_TOKEN` vai para a Vercel (com `VALIDADOR_URL`) quando a
  tela de edição manual entrar; o navegador nunca recebe o token.
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

## Rotina de atualização

1. `git push` (master).
2. Banco mudou? `npx supabase db push` + rodar os testes de RLS.
3. App: `cd app && vercel deploy --prod`.
4. Worker, validador ou engine mudou? `fly deploy --remote-only` (atualiza os
   dois processos).
