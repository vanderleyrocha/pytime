# Rotina de atualização do PyTime

Passo a passo do que **você** faz a cada mudança no código ou no banco: do
branch de trabalho até a produção. Configuração inicial (criar projetos,
secrets, envs) está em [`deploy.md`](deploy.md); aqui fica só a rotina.

Peças e onde cada uma é atualizada:

| Mudou em…                                  | O que fazer                 | Onde                    |
| ------------------------------------------ | --------------------------- | ----------------------- |
| `supabase/migrations/`                     | aplicar migrations          | Supabase (produção)     |
| `app/`                                     | deploy do app               | Vercel                  |
| `engine/`, `worker/`, `fly.toml`           | deploy do worker/validador  | Fly.io (`pytime-worker`)|
| `docs/`, `.claude/`, testes, CI            | nada além do merge          | —                       |

> Comandos rodam da **raiz do repositório**, salvo indicação. Exemplos em
> bash; no PowerShell, variáveis de ambiente são `$env:NOME = "valor"`.

---

## 0. Pré-requisitos (uma vez por máquina)

```bash
git --version
node --version            # 22.x
npx supabase --version    # CLI do Supabase via npx
fly version               # flyctl  (fly auth login)
vercel --version          # só se o deploy da Vercel for manual (vercel login)
```

E o projeto Supabase de produção linkado (uma vez):

```bash
npx supabase link --project-ref jrdnelyzvpvniukqamdm
```

---

## 1. Revisar e fazer merge na `master`

As mudanças chegam num branch dedicado (ex.: `claude/...`).

### Opção A — pelo GitHub (recomendada)

1. Abra o PR do branch para a `master` (se ainda não existir).
2. Espere o **CI ficar verde**: jobs *Motor*, *App*, *Worker* e, quando os
   secrets do staging existem, *E2E*. O job *Worker* já aplica as migrations
   do branch no **staging** e roda os testes de RLS lá.
3. Se houver preview da Vercel no PR, abra e confira a tela alterada.
4. *Merge pull request* → depois *Delete branch*.

### Opção B — pela linha de comando

```bash
git fetch origin
git checkout master
git pull origin master
git merge --no-ff origin/<nome-do-branch>
git push origin master
git push origin --delete <nome-do-branch>     # opcional, limpa o branch
```

Só faça o merge local se o CI do branch estiver verde.

### Descobrir o que mudou (decide os próximos passos)

Antes do merge, compare o branch com a `master`:

```bash
git fetch origin
git diff --name-only origin/master...origin/<nome-do-branch>
```

Ou, depois do merge, compare com o último deploy (ex.: o commit anterior):

```bash
git diff --name-only <commit-do-último-deploy> origin/master
```

Use a tabela do topo para saber quais das seções 2–4 se aplicam.

---

## 2. Banco de dados (só se mudou `supabase/migrations/`)

### 2.1 Ver o que está pendente

```bash
git checkout master && git pull origin master
npx supabase migration list          # coluna "Remote" vazia = pendente
npx supabase db push --dry-run       # mostra o que seria aplicado, sem aplicar
```

### 2.2 Aplicar na produção

```bash
npx supabase db push
```

Ele aplica, em ordem, só as migrations que ainda não estão no histórico do
banco. Confirme com `npx supabase migration list` (tudo com "Remote"
preenchido).

### 2.3 Staging

O CI já aplica as migrations no staging a cada PR/push. Só faça manualmente
se estiver testando fora do CI:

```bash
npx supabase db push --db-url "<URL do session pooler do staging>"
SUPABASE_DB_URL="<mesma URL>" python supabase/tests/rodar_testes.py   # RESULTADO: OK
```

**Nunca** rode os testes de RLS ou do worker contra a produção.

### 2.4 Ordem migration × deploy

- **Regra geral (migration aditiva: tabela/coluna/RPC nova)**: aplique a
  migration **antes** do deploy do app/worker. O código novo usa o que a
  migration cria; o código antigo continua funcionando com o banco novo.
- **Migration destrutiva** (remove/renomeia coluna ou função usada hoje):
  faça o deploy do código que **não usa mais** aquilo primeiro, e aplique a
  migration depois. Se precisar, divida em duas entregas.
- Na dúvida, leia o arquivo `.sql` novo antes do `db push`.

### 2.5 Se algo der errado

Migration aplicada não "desfaz" sozinha. O caminho é uma **nova migration**
corrigindo/revertendo (peça ao Claude ou escreva em
`supabase/migrations/<timestamp>_<descricao>.sql`), passar pelo CI e aplicar
com `db push`. Não edite uma migration que já foi aplicada em produção.

---

## 3. App Next.js na Vercel (só se mudou `app/`)

### 3.1 Envs novas?

Se a mudança introduziu uma variável de ambiente nova (procure por
`process.env.` no diff ou veja o `.env.example`), cadastre **antes** do
deploy:

```bash
cd app
vercel env add <NOME> production
```

Variáveis secretas (`SUPABASE_SERVICE_ROLE_KEY`, `VALIDADOR_TOKEN`, …)
**nunca** levam o prefixo `NEXT_PUBLIC_`. Alterar uma env só vale após um
novo deploy.

### 3.2 Deploy

- **Integração Git ativa** (projeto conectado ao GitHub na Vercel): o push na
  `master` já dispara o deploy de produção. Acompanhe em *Vercel → Deployments*.
- **Manual**:

  ```bash
  cd app
  vercel deploy --prod
  ```

### 3.3 Conferir

Login no domínio de produção → painel carrega → abrir a tela alterada →
`/geracoes` abre.

### 3.4 Voltar atrás

*Vercel → Deployments* → deploy anterior → *Promote to Production*, ou:

```bash
cd app
vercel rollback
```

---

## 4. Worker e validador no Fly.io (só se mudou `engine/`, `worker/` ou `fly.toml`)

### 4.1 Deploy

Da **raiz** do repo (o build precisa enxergar `engine/` e `worker/`):

```bash
git checkout master && git pull origin master
fly deploy --remote-only
```

Atualiza os dois processos (`worker` e `validador`). Não precisa de Docker
local. Uma geração em andamento no momento do deploy pode ser interrompida;
se possível, faça o deploy quando não houver geração rodando
(`/geracoes` no app).

### 4.2 Conferir

```bash
fly status --app pytime-worker                    # máquinas "started", checks "passing"
curl https://pytime-worker.fly.dev/saude          # {"ok": true}
fly logs --app pytime-worker                      # "Worker PyTime iniciado." e
                                                  # "Validador PyTime ouvindo na porta 8080."
```

Depois, no app: gere um horário pequeno e abra a edição manual de um
cenário (o veredito do validador deve aparecer).

### 4.3 Secrets

Trocar um secret reinicia as máquinas automaticamente:

```bash
fly secrets list --app pytime-worker
fly secrets set --app pytime-worker NOME="valor"
```

Se trocar o `VALIDADOR_TOKEN`, cadastre o **mesmo valor** na Vercel
(`vercel env add VALIDADOR_TOKEN production`, removendo o antigo antes com
`vercel env rm`) e refaça o deploy do app.

### 4.4 Voltar atrás

```bash
fly releases --app pytime-worker --image          # lista versões e imagens
fly deploy --remote-only --image <imagem-da-versão-anterior>
```

### 4.5 Rodar os testes do worker localmente

Os testes reivindicam a geração pendente mais antiga; o worker do Fly
"rouba" o job se estiver ligado. Use sempre o **staging** e pare a máquina
do processo `worker` (o validador não precisa parar):

```bash
fly machine list --app pytime-worker              # veja qual é a do processo "worker"
fly machine stop <id> --app pytime-worker
cd worker && SUPABASE_DB_URL="<URL do staging>" pytest -q
fly machine start <id> --app pytime-worker        # NÃO esqueça de religar
```

---

## 5. Ordem completa quando várias peças mudaram

1. CI verde no PR → merge na `master` (§1).
2. `npx supabase db push` na produção (§2), se houver migration aditiva.
3. Envs novas na Vercel, se houver (§3.1).
4. Deploy do app na Vercel (§3.2) — automático ou `vercel deploy --prod`.
5. `fly deploy --remote-only` (§4), se mudou motor/worker.
6. Smoke test: login → tela alterada → gerar um horário → abrir o cenário.
7. Se a migration era destrutiva, inverta 2 e 4/5 (código antes do banco).

Mudanças com ordem especial são registradas em [`deploy.md`](deploy.md)
(ex.: "Primeira subida da Fase 3A"); confira lá antes de começar.

---

## 6. Checklist rápido

- [ ] CI verde no PR
- [ ] Merge na `master` e branch apagado
- [ ] Migrations novas? `migration list` → `db push` → `migration list`
- [ ] Envs novas na Vercel?
- [ ] App publicado (Vercel) e conferido
- [ ] Motor/worker mudou? `fly deploy --remote-only` → `fly status` → `/saude`
- [ ] Smoke test no domínio de produção
- [ ] Máquina do worker no Fly ligada (se você parou para testes)
