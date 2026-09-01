# Fase 2A — Fundação (Supabase + Auth + Shell do App) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo com app Next.js autenticado (auto-cadastro → escola nova → admin; convites por e-mail) sobre um projeto Supabase dedicado com schema completo da Fase 2, RLS em todas as tabelas e testes pgTAP verdes.

**Architecture:** `supabase/` guarda migrations SQL versionadas + testes pgTAP (rodados contra o projeto remoto linkado via `npx supabase test db --linked`). `app/` é Next.js App Router com `@supabase/ssr` (sessão em cookies), middleware de proteção de rotas, Server Actions para mutações e leituras direto do Supabase sob RLS. Onboarding e convites passam por RPCs `security definer` transacionais. O schema de TODAS as tabelas da Fase 2 (inclusive `geracoes`/`cenarios`/`aulas_alocadas`, consumidas pelos planos 2B/2C) é criado aqui.

**Tech Stack:** Next.js (App Router, TS), Tailwind, shadcn/ui, zod, vitest, `@supabase/ssr`, Supabase CLI (`npx supabase`), Postgres + RLS + pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-31-fase2-app-design.md` (seções 1–4 e 6; a §5 de UI e a geração/deploy ficam nos planos 2B/2C). Contexto geral: `docs/superpowers/specs/2026-08-30-pytime-design.md`.

**Decomposição da Fase 2:** este é o plano **2A** de 3. 2B (cadastros + editor de regras) e 2C (fila + worker + grade + deploy) serão escritos após a execução deste; ambos consomem o schema travado aqui.

## Global Constraints

- Identificadores de banco, rotas, variáveis e mensagens **em português** (exceto o que framework exigir).
- **RLS habilitado em toda tabela** criada; nenhuma tabela sem policy de SELECT no mínimo. Escrita de cadastros/regras/gerações só `admin|coordenador`; `perfis`/`convites` só `admin`; `resultado`/`cenarios`/`aulas_alocadas` só `service_role` (worker, plano 2C).
- Catálogo de regras tem **10 tipos** (nomes exatos do `REGISTRO` do motor): `disponibilidade_professor`, `geminadas`, `recurso_compartilhado`, `janelas_professor`, `distribuicao_disciplina`, `preferencia_professor`, `preferencia_disciplina`, `compactacao_dias`, `ultimo_horario`, `nao_mesmo_dia`. (A spec diz "9"; o número vinculante é o do código do motor.)
- `budget_segundos` em `geracoes`: default 60, máximo **600** (teto do worker dedicado, spec §5).
- `engine/` **não é tocado** neste plano.
- Ids UUID (`gen_random_uuid()`); toda tabela de domínio carrega `unidade_id`.
- Convites: validade de **7 dias**, roles `admin|coordenador` apenas.
- Segredos (service role key, senha do banco) **nunca comitados** — só `app/.env.local` (gitignored) e `.env.example` com placeholders.
- Trabalho na branch `fase2a-fundacao` a partir de `master`; commits pequenos em português (`feat(supabase): ...`, `feat(app): ...`).
- Ferramentas via `npx` (CLI Supabase não é global). Node ≥ 20 disponível.
- Validação de formulário com zod espelhando as regras do banco; Server Actions **revalidam role no servidor**.

## Estrutura de arquivos

```
pytime/
  app/                              # Next.js App Router (criado na Task 1)
    src/
      middleware.ts
      lib/
        supabase/cliente-navegador.ts
        supabase/cliente-servidor.ts
        supabase/cliente-servico.ts   # service_role, só server-side
        supabase/sessao-middleware.ts
        rotas.ts                      # ehRotaPublica() (testável)
        unidade-ativa.ts              # cookie da unidade selecionada
        validacao/auth.ts             # schemas zod (login/cadastro/escola/convite)
      app/
        (publico)/login/page.tsx  + actions.ts
        (publico)/cadastro/page.tsx + actions.ts
        (publico)/convite/[token]/page.tsx + actions.ts
        criar-escola/page.tsx + actions.ts
        (interno)/layout.tsx          # sidebar + seletor de unidade
        (interno)/painel/page.tsx
        (interno)/convites/page.tsx + actions.ts
      components/barra-lateral.tsx
      components/seletor-unidade.tsx
    tests/ (vitest)
      validacao-auth.test.ts
      rotas.test.ts
  supabase/
    config.toml                       # npx supabase init
    migrations/
      0001_tenancy.sql
      0002_estrutura.sql
      0003_atribuicoes_regras.sql
      0004_geracao.sql
      0005_rpcs_onboarding.sql
    tests/
      0001_tenancy.test.sql
      0002_estrutura.test.sql
      0003_atribuicoes_regras.test.sql
      0004_geracao.test.sql
      0005_rpcs.test.sql
```

---

### Task 1: Branch, scaffold do app Next.js + vitest

**Files:**
- Create: `app/` (via create-next-app), `app/vitest.config.ts`, `app/tests/sanidade.test.ts`
- Modify: `.gitignore` (raiz)

**Interfaces:**
- Consumes: nada.
- Produces: app Next.js compilável em `app/` com Tailwind + shadcn/ui + vitest; comando de teste `npm run teste` (alias de `vitest run`).

- [ ] **Step 1: Criar branch e scaffold**

```bash
cd d:/laragon/www/pytime
git checkout -b fase2a-fundacao
npx create-next-app@latest app --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: Instalar dependências da fundação**

```bash
cd app
npm i @supabase/ssr @supabase/supabase-js zod
npm i -D vitest @vitejs/plugin-react
npx shadcn@latest init -d
npx shadcn@latest add button input label card table dialog select
```

- [ ] **Step 3: Configurar vitest e teste de sanidade (ver falhar antes)**

`app/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

Em `app/package.json`, adicionar em `"scripts"`: `"teste": "vitest run"`.

`app/tests/sanidade.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("sanidade", () => {
  it("vitest configurado", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `cd app && npm run teste` → Expected: PASS (1 teste).
Run: `npm run build` → Expected: build sem erros.

- [ ] **Step 4: Garantir gitignore da raiz**

Conferir que `.gitignore` da raiz (ou o `app/.gitignore` gerado) cobre `node_modules/`, `.next/`, `.env*.local`. Adicionar ao `.gitignore` da raiz:

```
node_modules/
.next/
.env
.env.local
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(app): scaffold Next.js com Tailwind, shadcn/ui e vitest"
```

---

### Task 2: Projeto Supabase remoto + CLI linkada

**⚠️ CHECKPOINT COM O USUÁRIO:** esta task cria recursos remotos e precisa de credenciais. Pare e peça ao usuário o que faltar (login do CLI, senha do banco). Nada aqui é destrutivo.

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`), `.env.example` (raiz)

**Interfaces:**
- Consumes: nada.
- Produces: projeto Supabase remoto dedicado, CLI linkada (`npx supabase link`), capaz de `db push` e `test db --linked`. Variáveis anotadas em `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`.

- [ ] **Step 1: Inicializar estrutura do CLI**

```bash
cd d:/laragon/www/pytime
npx supabase init
```

- [ ] **Step 2: Criar o projeto remoto**

Preferência: usar o MCP do Supabase disponível na sessão (`list_organizations` → `get_cost` → `confirm_cost` → `create_project` com nome `pytime`, região `sa-east-1`). Alternativa: pedir ao usuário para criar o projeto `pytime` no dashboard. Anotar o `project_ref` e a senha do banco.

- [ ] **Step 3: Autenticar e linkar o CLI**

```bash
npx supabase login          # abre navegador; requer o usuário
npx supabase link --project-ref <PROJECT_REF>
```

- [ ] **Step 4: Registrar variáveis de ambiente**

`.env.example` (raiz):

```
# Supabase (dashboard > project settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://SEU-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=coloque-aqui
SUPABASE_SERVICE_ROLE_KEY=coloque-aqui   # NUNCA expor no cliente
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Criar `app/.env.local` com os valores reais (não comitar). No dashboard do Supabase (Auth > URL Configuration), definir Site URL `http://localhost:3000`.

- [ ] **Step 5: Verificar conexão**

Run: `npx supabase migration list --linked`
Expected: lista vazia (nenhuma migration aplicada), sem erro de auth.

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml .env.example
git commit -m "chore(supabase): projeto remoto linkado e config do CLI"
```

---

### Task 3: Migration 0001 — tenancy (redes, unidades, perfis, convites) + RLS + pgTAP

**Files:**
- Create: `supabase/migrations/0001_tenancy.sql`
- Test: `supabase/tests/0001_tenancy.test.sql`

**Interfaces:**
- Consumes: projeto linkado (Task 2).
- Produces: enum `papel ('admin'|'coordenador'|'professor')`; tabelas `redes`, `unidades`, `perfis(user_id, unidade_id, papel)`, `convites(email, papel, token, expira_em, aceito_em)`; funções `minhas_unidades() -> setof uuid` e `tenho_papel(uuid, variadic papel[]) -> boolean` (security definer) — usadas por TODAS as policies das tasks seguintes.

- [ ] **Step 1: Escrever o teste pgTAP que falha**

`supabase/tests/0001_tenancy.test.sql`:

```sql
begin;
select plan(8);

-- Seeds como postgres (bypassa RLS)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'beto@b.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A'),
  ('00000000-0000-0000-0000-00000000001b', 'Escola B');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'admin'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000001b', 'coordenador');
insert into convites (unidade_id, email, papel) values
  ('00000000-0000-0000-0000-00000000001a', 'novo@a.com', 'coordenador');

-- Vira a Ana (admin da Escola A)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select results_eq(
  'select id from unidades order by nome',
  array['00000000-0000-0000-0000-00000000001a'::uuid],
  'Ana só vê a própria unidade');
select results_eq(
  'select count(*)::int from perfis',
  array[1], 'Ana só vê perfis da própria unidade');
select results_eq(
  'select count(*)::int from convites',
  array[1], 'admin vê convites da própria unidade');
select lives_ok(
  $$insert into convites (unidade_id, email, papel)
    values ('00000000-0000-0000-0000-00000000001a', 'x@a.com', 'admin')$$,
  'admin cria convite na própria unidade');
select throws_ok(
  $$insert into convites (unidade_id, email, papel)
    values ('00000000-0000-0000-0000-00000000001b', 'x@b.com', 'admin')$$,
  '42501', null, 'admin NÃO cria convite em outra unidade');
select throws_ok(
  $$insert into convites (unidade_id, email, papel)
    values ('00000000-0000-0000-0000-00000000001a', 'p@a.com', 'professor')$$,
  '23514', null, 'convite para papel professor é rejeitado (check)');

-- Vira o Beto (coordenador da Escola B)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"beto@b.com","role":"authenticated"}', true);
select results_eq(
  'select count(*)::int from convites',
  array[0], 'coordenador não vê convites (só admin)');
select throws_ok(
  $$insert into perfis (user_id, unidade_id, papel)
    values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000001a', 'admin')$$,
  '42501', null, 'coordenador não se promove em outra unidade');

select * from finish();
rollback;
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase test db --linked`
Expected: FAIL — `relation "unidades" does not exist` (nenhuma migration aplicada). Se falhar por falta do pgTAP, a migration do Step 3 o instala.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/0001_tenancy.sql`:

```sql
create extension if not exists pgtap;

create type papel as enum ('admin', 'coordenador', 'professor');

create table redes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criada_em timestamptz not null default now()
);

create table unidades (
  id uuid primary key default gen_random_uuid(),
  rede_id uuid references redes(id) on delete set null,
  nome text not null,
  criada_em timestamptz not null default now()
);

create table perfis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unidade_id uuid not null references unidades(id) on delete cascade,
  papel papel not null,
  criado_em timestamptz not null default now(),
  unique (user_id, unidade_id)
);

create table convites (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  email text not null,
  papel papel not null check (papel in ('admin', 'coordenador')),
  token uuid not null unique default gen_random_uuid(),
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Security definer: consultam perfis SEM passar pelo RLS de perfis
-- (evita recursão e centraliza a regra de pertencimento).
create or replace function minhas_unidades()
returns setof uuid
language sql security definer set search_path = public stable
as $fn$
  select unidade_id from perfis where user_id = (select auth.uid());
$fn$;

create or replace function tenho_papel(p_unidade uuid, variadic p_papeis papel[])
returns boolean
language sql security definer set search_path = public stable
as $fn$
  select exists (
    select 1 from perfis
    where user_id = (select auth.uid())
      and unidade_id = p_unidade
      and papel = any (p_papeis)
  );
$fn$;

alter table redes enable row level security;
alter table unidades enable row level security;
alter table perfis enable row level security;
alter table convites enable row level security;

create policy redes_select on redes for select to authenticated
  using (id in (select u.rede_id from unidades u
                where u.id in (select minhas_unidades())));

create policy unidades_select on unidades for select to authenticated
  using (id in (select minhas_unidades()));
create policy unidades_update on unidades for update to authenticated
  using (tenho_papel(id, 'admin'))
  with check (tenho_papel(id, 'admin'));
-- INSERT em unidades só pela RPC criar_unidade_com_admin (Task 7).

create policy perfis_select on perfis for select to authenticated
  using (unidade_id in (select minhas_unidades()));
create policy perfis_insert on perfis for insert to authenticated
  with check (tenho_papel(unidade_id, 'admin'));
create policy perfis_update on perfis for update to authenticated
  using (tenho_papel(unidade_id, 'admin'))
  with check (tenho_papel(unidade_id, 'admin'));
create policy perfis_delete on perfis for delete to authenticated
  using (tenho_papel(unidade_id, 'admin'));

create policy convites_select on convites for select to authenticated
  using (tenho_papel(unidade_id, 'admin'));
create policy convites_insert on convites for insert to authenticated
  with check (tenho_papel(unidade_id, 'admin'));
create policy convites_delete on convites for delete to authenticated
  using (tenho_papel(unidade_id, 'admin'));
```

- [ ] **Step 4: Aplicar e ver o teste passar**

```bash
npx supabase db push
npx supabase test db --linked
```

Expected: 8 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_tenancy.sql supabase/tests/0001_tenancy.test.sql
git commit -m "feat(supabase): tenancy (unidades, perfis, convites) com RLS e pgTAP"
```

---

### Task 4: Migration 0002 — estrutura (turnos, slots, turmas, disciplinas, professores, disponibilidades, recursos)

**Files:**
- Create: `supabase/migrations/0002_estrutura.sql`
- Test: `supabase/tests/0002_estrutura.test.sql`

**Interfaces:**
- Consumes: `unidades`, `perfis`, `minhas_unidades()`, `tenho_papel()` (Task 3).
- Produces: enum `disponibilidade_status ('disponivel'|'indisponivel'|'prefere'|'evita')`; tabelas `turnos`, `slots(turno_id, dia 0–6, ordem, hora_inicio, hora_fim)`, `turmas(turno_id)`, `disciplinas`, `professores`, `disponibilidades(professor_id, slot_id, status)`, `recursos(capacidade>=1)`; coluna `perfis.professor_id` (nullable, Fase 3). Padrão de RLS "cadastro" (SELECT membro, escrita gestor) — reutilizado na Task 5.

- [ ] **Step 1: Escrever o teste pgTAP que falha**

`supabase/tests/0002_estrutura.test.sql`:

```sql
begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'caio@a.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A'),
  ('00000000-0000-0000-0000-00000000001b', 'Escola B');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'coordenador'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000001a', 'professor');
insert into turnos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-00000000001a', 'Manhã'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-00000000001b', 'Tarde B');

-- Coordenador da Escola A
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select results_eq('select nome from turnos', array['Manhã'::text],
  'membro só vê turnos da própria unidade');
select lives_ok(
  $$insert into slots (unidade_id, turno_id, dia, ordem, hora_inicio, hora_fim)
    values ('00000000-0000-0000-0000-00000000001a',
            '00000000-0000-0000-0000-000000000101', 0, 0, '07:00', '07:50')$$,
  'coordenador cria slot');
select throws_ok(
  $$insert into slots (unidade_id, turno_id, dia, ordem)
    values ('00000000-0000-0000-0000-00000000001a',
            '00000000-0000-0000-0000-000000000101', 7, 0)$$,
  '23514', null, 'dia fora de 0–6 é rejeitado');
select throws_ok(
  $$insert into turnos (unidade_id, nome)
    values ('00000000-0000-0000-0000-00000000001b', 'Invasão')$$,
  '42501', null, 'escrita em outra unidade bloqueada');

-- Professor (papel sem escrita em cadastros)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"caio@a.com","role":"authenticated"}', true);
select results_eq('select count(*)::int from turnos', array[1],
  'professor vê cadastros da unidade');
select throws_ok(
  $$insert into disciplinas (unidade_id, nome)
    values ('00000000-0000-0000-0000-00000000001a', 'Química')$$,
  '42501', null, 'professor não escreve em cadastros');

select * from finish();
rollback;
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase test db --linked`
Expected: 0001 PASS; 0002 FAIL — `relation "turnos" does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/0002_estrutura.sql`:

```sql
create type disponibilidade_status as enum
  ('disponivel', 'indisponivel', 'prefere', 'evita');

create table turnos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now()
);

create table slots (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  turno_id uuid not null references turnos(id) on delete cascade,
  dia int not null check (dia between 0 and 6),
  ordem int not null check (ordem >= 0),
  hora_inicio time,
  hora_fim time,
  unique (turno_id, dia, ordem)
);

create table turmas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  turno_id uuid not null references turnos(id) on delete restrict,
  nome text not null,
  criada_em timestamptz not null default now()
);

create table disciplinas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  nome text not null
);

create table professores (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  nome text not null
);

create table disponibilidades (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  professor_id uuid not null references professores(id) on delete cascade,
  slot_id uuid not null references slots(id) on delete cascade,
  status disponibilidade_status not null,
  unique (professor_id, slot_id)
);

create table recursos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  nome text not null,
  capacidade int not null default 1 check (capacidade >= 1)
);

-- Vínculo professor ↔ login (Fase 3; nullable por enquanto)
alter table perfis add column professor_id uuid
  references professores(id) on delete set null;

-- RLS padrão "cadastro": SELECT para membros; escrita para admin/coordenador
do $blk$
declare t text;
begin
  foreach t in array array[
    'turnos', 'slots', 'turmas', 'disciplinas',
    'professores', 'disponibilidades', 'recursos'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_select on %I for select to authenticated
         using (unidade_id in (select minhas_unidades()))', t, t);
    execute format(
      'create policy %I_escrita on %I for all to authenticated
         using (tenho_papel(unidade_id, ''admin'', ''coordenador''))
         with check (tenho_papel(unidade_id, ''admin'', ''coordenador''))', t, t);
  end loop;
end
$blk$;
```

- [ ] **Step 4: Aplicar e ver o teste passar**

```bash
npx supabase db push
npx supabase test db --linked
```

Expected: 0001 e 0002 PASS (14 testes no total).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_estrutura.sql supabase/tests/0002_estrutura.test.sql
git commit -m "feat(supabase): estrutura escolar (turnos a recursos) com RLS e pgTAP"
```

---

### Task 5: Migration 0003 — atribuições e regras

**Files:**
- Create: `supabase/migrations/0003_atribuicoes_regras.sql`
- Test: `supabase/tests/0003_atribuicoes_regras.test.sql`

**Interfaces:**
- Consumes: `professores`, `disciplinas`, `turmas`, `recursos` (Task 4); helpers de RLS (Task 3).
- Produces: `atribuicoes(professor_id, disciplina_id, turma_id, carga_semanal>=1, geminadas>=0)` com `unique(professor_id, disciplina_id, turma_id)`; `atribuicao_recursos(atribuicao_id, recurso_id)` N:N; `regras(tipo ∈ 10 tipos do catálogo, parametros jsonb, hard, peso>=1, ativa)`.

- [ ] **Step 1: Escrever o teste pgTAP que falha**

`supabase/tests/0003_atribuicoes_regras.test.sql`:

```sql
begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'coordenador');
insert into turnos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-00000000001a', 'Manhã');
insert into turmas (id, unidade_id, turno_id, nome) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-000000000101', '6º A');
insert into disciplinas (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-00000000001a', 'Matemática');
insert into professores (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-00000000001a', 'Paulo');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into atribuicoes (unidade_id, professor_id, disciplina_id, turma_id, carga_semanal)
    values ('00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-000000000401',
            '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 4)$$,
  'coordenador cria atribuição');
select throws_ok(
  $$insert into atribuicoes (unidade_id, professor_id, disciplina_id, turma_id, carga_semanal)
    values ('00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-000000000401',
            '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 0)$$,
  '23514', null, 'carga_semanal 0 é rejeitada');
select lives_ok(
  $$insert into regras (unidade_id, tipo, hard, peso)
    values ('00000000-0000-0000-0000-00000000001a', 'janelas_professor', false, 10)$$,
  'regra de tipo válido é aceita');
select throws_ok(
  $$insert into regras (unidade_id, tipo, hard)
    values ('00000000-0000-0000-0000-00000000001a', 'tipo_inexistente', true)$$,
  '23514', null, 'tipo fora do catálogo é rejeitado');
select results_eq('select count(*)::int from regras', array[1],
  'regras visíveis ao membro');

select * from finish();
rollback;
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase test db --linked`
Expected: 0003 FAIL — `relation "atribuicoes" does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/0003_atribuicoes_regras.sql`:

```sql
create table atribuicoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  professor_id uuid not null references professores(id) on delete restrict,
  disciplina_id uuid not null references disciplinas(id) on delete restrict,
  turma_id uuid not null references turmas(id) on delete cascade,
  carga_semanal int not null check (carga_semanal >= 1),
  geminadas int not null default 0 check (geminadas >= 0),
  unique (professor_id, disciplina_id, turma_id)
);

create table atribuicao_recursos (
  atribuicao_id uuid not null references atribuicoes(id) on delete cascade,
  recurso_id uuid not null references recursos(id) on delete cascade,
  primary key (atribuicao_id, recurso_id)
);

create table regras (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  tipo text not null check (tipo in (
    'disponibilidade_professor', 'geminadas', 'recurso_compartilhado',
    'janelas_professor', 'distribuicao_disciplina', 'preferencia_professor',
    'preferencia_disciplina', 'compactacao_dias', 'ultimo_horario',
    'nao_mesmo_dia'
  )),
  parametros jsonb not null default '{}',
  hard boolean not null,
  peso int not null default 1 check (peso >= 1),
  ativa boolean not null default true,
  criada_em timestamptz not null default now()
);

do $blk$
declare t text;
begin
  foreach t in array array['atribuicoes', 'regras'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_select on %I for select to authenticated
         using (unidade_id in (select minhas_unidades()))', t, t);
    execute format(
      'create policy %I_escrita on %I for all to authenticated
         using (tenho_papel(unidade_id, ''admin'', ''coordenador''))
         with check (tenho_papel(unidade_id, ''admin'', ''coordenador''))', t, t);
  end loop;
end
$blk$;

-- N:N sem unidade_id própria: herda o escopo da atribuição
alter table atribuicao_recursos enable row level security;
create policy atribuicao_recursos_select on atribuicao_recursos
  for select to authenticated
  using (exists (select 1 from atribuicoes a
                 where a.id = atribuicao_id
                   and a.unidade_id in (select minhas_unidades())));
create policy atribuicao_recursos_escrita on atribuicao_recursos
  for all to authenticated
  using (exists (select 1 from atribuicoes a
                 where a.id = atribuicao_id
                   and tenho_papel(a.unidade_id, 'admin', 'coordenador')))
  with check (exists (select 1 from atribuicoes a
                      where a.id = atribuicao_id
                        and tenho_papel(a.unidade_id, 'admin', 'coordenador')));
```

- [ ] **Step 4: Aplicar e ver o teste passar**

```bash
npx supabase db push
npx supabase test db --linked
```

Expected: 0001–0003 PASS (19 testes no total).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_atribuicoes_regras.sql supabase/tests/0003_atribuicoes_regras.test.sql
git commit -m "feat(supabase): atribuições, recursos N:N e catálogo de regras com RLS"
```

---

### Task 6: Migration 0004 — geração (geracoes, cenarios, aulas_alocadas) + Realtime

**Files:**
- Create: `supabase/migrations/0004_geracao.sql`
- Test: `supabase/tests/0004_geracao.test.sql`

**Interfaces:**
- Consumes: `unidades`, `atribuicoes`, `slots`, helpers de RLS.
- Produces (contrato do worker do plano 2C — NÃO renomear): enum `geracao_status ('pendente'|'executando'|'concluida'|'inviavel'|'erro')`; `geracoes(status, instancia jsonb, resultado jsonb, progresso jsonb, nucleo_conflito text[], detalhe_erro, tentativas, heartbeat_em, budget_segundos<=600, criada_por)`; `cenarios(geracao_id, oficial)`; `aulas_alocadas(cenario_id, atribuicao_id, slot_id)`; `geracoes` publicada no Realtime. Clientes: SELECT membro; INSERT de `geracoes` por gestor (status inicial `pendente`); nenhum UPDATE/DELETE de cliente — só `service_role` (worker) escreve resultado/cenários/aulas.

- [ ] **Step 1: Escrever o teste pgTAP que falha**

`supabase/tests/0004_geracao.test.sql`:

```sql
begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'caio@a.com');
insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A');
insert into perfis (user_id, unidade_id, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000001a', 'coordenador'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000001a', 'professor');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into geracoes (unidade_id, instancia)
    values ('00000000-0000-0000-0000-00000000001a', '{"turmas": []}'::jsonb)$$,
  'coordenador enfileira geração');
select throws_ok(
  $$insert into geracoes (unidade_id, instancia, budget_segundos)
    values ('00000000-0000-0000-0000-00000000001a', '{}'::jsonb, 601)$$,
  '23514', null, 'budget acima de 600 s é rejeitado');
select throws_ok(
  $$update geracoes set status = 'concluida'$$,
  '42501', null, 'cliente não atualiza geração (só o worker/service_role)');
select throws_ok(
  $$insert into cenarios (unidade_id, geracao_id)
    select unidade_id, id from geracoes limit 1$$,
  '42501', null, 'cliente não cria cenário (só o worker)');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"caio@a.com","role":"authenticated"}', true);
select throws_ok(
  $$insert into geracoes (unidade_id, instancia)
    values ('00000000-0000-0000-0000-00000000001a', '{}'::jsonb)$$,
  '42501', null, 'professor não enfileira geração');

select * from finish();
rollback;
```

Nota: `update geracoes` sem policy de UPDATE resulta em 0 linhas afetadas (não erro) quando há apenas RLS de SELECT; para o teste ser determinístico, a migration nega UPDATE via `revoke` (ver Step 3) — daí o `42501`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase test db --linked`
Expected: 0004 FAIL — `relation "geracoes" does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/0004_geracao.sql`:

```sql
create type geracao_status as enum
  ('pendente', 'executando', 'concluida', 'inviavel', 'erro');

create table geracoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  status geracao_status not null default 'pendente',
  instancia jsonb not null,
  resultado jsonb,
  progresso jsonb,
  nucleo_conflito text[] not null default '{}',
  detalhe_erro text,
  tentativas int not null default 0,
  heartbeat_em timestamptz,
  budget_segundos numeric not null default 60
    check (budget_segundos > 0 and budget_segundos <= 600),
  criada_por uuid references auth.users(id) on delete set null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index geracoes_fila on geracoes (criada_em) where status = 'pendente';

create table cenarios (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  geracao_id uuid not null references geracoes(id) on delete cascade,
  oficial boolean not null default false,
  criado_em timestamptz not null default now()
);

create table aulas_alocadas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete cascade,
  cenario_id uuid not null references cenarios(id) on delete cascade,
  atribuicao_id uuid not null references atribuicoes(id) on delete cascade,
  slot_id uuid not null references slots(id) on delete cascade
);

create index aulas_alocadas_cenario on aulas_alocadas (cenario_id);

alter table geracoes enable row level security;
alter table cenarios enable row level security;
alter table aulas_alocadas enable row level security;

create policy geracoes_select on geracoes for select to authenticated
  using (unidade_id in (select minhas_unidades()));
create policy geracoes_insert on geracoes for insert to authenticated
  with check (tenho_papel(unidade_id, 'admin', 'coordenador')
              and status = 'pendente');

create policy cenarios_select on cenarios for select to authenticated
  using (unidade_id in (select minhas_unidades()));
create policy aulas_alocadas_select on aulas_alocadas for select to authenticated
  using (unidade_id in (select minhas_unidades()));

-- Escrita de resultado é exclusiva do worker (service_role, bypassa RLS).
-- Nega no nível de GRANT para o teste (e o cliente) receberem 42501 e não
-- um "0 linhas afetadas" silencioso.
revoke update, delete on geracoes from authenticated, anon;
revoke insert, update, delete on cenarios from authenticated, anon;
revoke insert, update, delete on aulas_alocadas from authenticated, anon;

-- Progresso ao vivo na UI (plano 2C)
alter publication supabase_realtime add table geracoes;
```

- [ ] **Step 4: Aplicar e ver o teste passar**

```bash
npx supabase db push
npx supabase test db --linked
```

Expected: 0001–0004 PASS (24 testes no total).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_geracao.sql supabase/tests/0004_geracao.test.sql
git commit -m "feat(supabase): fila de gerações, cenários e aulas alocadas com RLS e Realtime"
```

---

### Task 7: Migration 0005 — RPCs de onboarding (criar_unidade_com_admin, aceitar_convite)

**Files:**
- Create: `supabase/migrations/0005_rpcs_onboarding.sql`
- Test: `supabase/tests/0005_rpcs.test.sql`

**Interfaces:**
- Consumes: `unidades`, `perfis`, `convites` (Task 3).
- Produces (chamadas pelo app nas Tasks 10 e 12 — assinaturas exatas):
  - `criar_unidade_com_admin(p_nome text) -> uuid` — transacional: cria unidade + perfil `admin` para `auth.uid()`; erro se não autenticado ou nome vazio.
  - `aceitar_convite(p_token uuid) -> uuid` — valida token (existe, não usado, não expirado, e-mail do JWT bate), faz upsert do perfil e marca `aceito_em`; devolve `unidade_id`.

- [ ] **Step 1: Escrever o teste pgTAP que falha**

`supabase/tests/0005_rpcs.test.sql`:

```sql
begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@a.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'diva@d.com');

-- Ana cria a própria escola
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"ana@a.com","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$select criar_unidade_com_admin('Escola Nova')$$,
  'usuário autenticado cria escola');
select results_eq(
  $$select papel::text from perfis
    where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  array['admin'::text], 'criador vira admin');
select throws_ok(
  $$select criar_unidade_com_admin('  ')$$,
  null, null, 'nome vazio é rejeitado');

-- Ana convida diva@d.com como coordenador
select lives_ok(
  $$insert into convites (unidade_id, email, papel, token)
    select unidade_id, 'diva@d.com', 'coordenador',
           '00000000-0000-0000-0000-0000000000f0'
    from perfis where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  'admin cria convite com token conhecido');

-- Diva aceita
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"diva@d.com","role":"authenticated"}', true);
select lives_ok(
  $$select aceitar_convite('00000000-0000-0000-0000-0000000000f0')$$,
  'convidada aceita o convite');
select results_eq(
  $$select papel::text from perfis
    where user_id = '00000000-0000-0000-0000-0000000000d1'$$,
  array['coordenador'::text], 'perfil criado com o papel do convite');
select throws_ok(
  $$select aceitar_convite('00000000-0000-0000-0000-0000000000f0')$$,
  null, 'Convite já utilizado.', 'reuso do token é rejeitado');

select * from finish();
rollback;
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase test db --linked`
Expected: 0005 FAIL — `function criar_unidade_com_admin(unknown) does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/0005_rpcs_onboarding.sql`:

```sql
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
```

- [ ] **Step 4: Aplicar e ver o teste passar**

```bash
npx supabase db push
npx supabase test db --linked
```

Expected: 0001–0005 PASS (31 testes no total).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_rpcs_onboarding.sql supabase/tests/0005_rpcs.test.sql
git commit -m "feat(supabase): RPCs transacionais de onboarding e aceite de convite"
```

---

### Task 8: Clients Supabase no app + middleware de proteção de rotas

**Files:**
- Create: `app/src/lib/supabase/cliente-navegador.ts`, `app/src/lib/supabase/cliente-servidor.ts`, `app/src/lib/supabase/cliente-servico.ts`, `app/src/lib/supabase/sessao-middleware.ts`, `app/src/lib/rotas.ts`, `app/src/middleware.ts`
- Test: `app/tests/rotas.test.ts`

**Interfaces:**
- Consumes: env vars da Task 2.
- Produces (usados por todas as tasks de app):
  - `criarClienteNavegador()` — client components.
  - `criarClienteServidor(): Promise<SupabaseClient>` — Server Components/Actions (cookies).
  - `criarClienteServico(): SupabaseClient` — service_role, **somente** em código server-side (convites).
  - `ehRotaPublica(pathname: string): boolean`.
  - Middleware: sem sessão em rota privada → redirect `/login`.

- [ ] **Step 1: Escrever o teste que falha**

`app/tests/rotas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ehRotaPublica } from "@/lib/rotas";

describe("ehRotaPublica", () => {
  it("libera login, cadastro e convite", () => {
    expect(ehRotaPublica("/login")).toBe(true);
    expect(ehRotaPublica("/cadastro")).toBe(true);
    expect(ehRotaPublica("/convite/abc-123")).toBe(true);
  });
  it("protege o restante", () => {
    expect(ehRotaPublica("/")).toBe(false);
    expect(ehRotaPublica("/painel")).toBe(false);
    expect(ehRotaPublica("/convites")).toBe(false);
    expect(ehRotaPublica("/loginfalso")).toBe(false);
  });
});
```

Run: `cd app && npm run teste` → Expected: FAIL (`Cannot find module '@/lib/rotas'`).

- [ ] **Step 2: Implementar `rotas.ts` e ver passar**

`app/src/lib/rotas.ts`:

```ts
const PREFIXOS_PUBLICOS = ["/login", "/cadastro", "/convite"];

export function ehRotaPublica(pathname: string): boolean {
  return PREFIXOS_PUBLICOS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}
```

Run: `npm run teste` → Expected: PASS.

- [ ] **Step 3: Implementar os três clients**

`app/src/lib/supabase/cliente-navegador.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

`app/src/lib/supabase/cliente-servidor.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function criarClienteServidor() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(aDefinir) {
          try {
            aDefinir.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component: o middleware renova a sessão.
          }
        },
      },
    },
  );
}
```

`app/src/lib/supabase/cliente-servico.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

// service_role: bypassa RLS. Usar APENAS onde a task mandar (convites).
export function criarClienteServico() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
```

(`npm i -D server-only` se o pacote não estiver presente; em Next recente já vem.)

- [ ] **Step 4: Middleware**

`app/src/lib/supabase/sessao-middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ehRotaPublica } from "@/lib/rotas";

export async function atualizarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(aDefinir) {
          aDefinir.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          resposta = NextResponse.next({ request });
          aDefinir.forEach(({ name, value, options }) =>
            resposta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Obrigatório entre createServerClient e o return: renova o token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !ehRotaPublica(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("proximo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return resposta;
}
```

`app/src/middleware.ts`:

```ts
import { type NextRequest } from "next/server";
import { atualizarSessao } from "@/lib/supabase/sessao-middleware";

export async function middleware(request: NextRequest) {
  return await atualizarSessao(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 5: Validar e commitar**

Run: `npm run teste && npm run build` → Expected: PASS + build ok.

```bash
git add app/src/lib app/src/middleware.ts app/tests/rotas.test.ts
git commit -m "feat(app): clients Supabase e middleware de proteção de rotas"
```

---

### Task 9: Login e cadastro (e-mail + senha com verificação)

**Files:**
- Create: `app/src/lib/validacao/auth.ts`, `app/src/app/(publico)/login/page.tsx`, `app/src/app/(publico)/login/actions.ts`, `app/src/app/(publico)/cadastro/page.tsx`, `app/src/app/(publico)/cadastro/actions.ts`
- Test: `app/tests/validacao-auth.test.ts`

**Interfaces:**
- Consumes: `criarClienteServidor` (Task 8).
- Produces: schemas zod `esquemaLogin`, `esquemaCadastro`, `esquemaCriarEscola`, `esquemaConvite` (reutilizados nas Tasks 10–12); actions `entrar`, `cadastrar`, `sair`.

- [ ] **Step 1: Escrever o teste que falha**

`app/tests/validacao-auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  esquemaCadastro,
  esquemaConvite,
  esquemaCriarEscola,
  esquemaLogin,
} from "@/lib/validacao/auth";

describe("esquemas de auth", () => {
  it("login exige e-mail válido e senha de 8+", () => {
    expect(esquemaLogin.safeParse({ email: "a@b.com", senha: "12345678" }).success).toBe(true);
    expect(esquemaLogin.safeParse({ email: "x", senha: "12345678" }).success).toBe(false);
    expect(esquemaLogin.safeParse({ email: "a@b.com", senha: "1234567" }).success).toBe(false);
  });
  it("cadastro segue as mesmas regras do login", () => {
    expect(esquemaCadastro.safeParse({ email: "a@b.com", senha: "12345678" }).success).toBe(true);
  });
  it("criar escola exige nome com 2+ caracteres úteis", () => {
    expect(esquemaCriarEscola.safeParse({ nome: "  E  " }).success).toBe(false);
    expect(esquemaCriarEscola.safeParse({ nome: "Escola Alfa" }).success).toBe(true);
  });
  it("convite restringe papel a admin|coordenador", () => {
    expect(esquemaConvite.safeParse({ email: "a@b.com", papel: "coordenador" }).success).toBe(true);
    expect(esquemaConvite.safeParse({ email: "a@b.com", papel: "professor" }).success).toBe(false);
  });
});
```

Run: `npm run teste` → Expected: FAIL (`Cannot find module '@/lib/validacao/auth'`).

- [ ] **Step 2: Implementar os schemas e ver passar**

`app/src/lib/validacao/auth.ts`:

```ts
import { z } from "zod";

export const esquemaLogin = z.object({
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

export const esquemaCadastro = esquemaLogin;

export const esquemaCriarEscola = z.object({
  nome: z.string().trim().min(2, "Informe o nome da escola"),
});

export const esquemaConvite = z.object({
  email: z.string().email("E-mail inválido"),
  papel: z.enum(["admin", "coordenador"], {
    message: "Papel deve ser admin ou coordenador",
  }),
});
```

Run: `npm run teste` → Expected: PASS.

- [ ] **Step 3: Server Actions de login/cadastro/sair**

`app/src/app/(publico)/login/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { esquemaLogin } from "@/lib/validacao/auth";

export type EstadoAuth = { erro?: string };

export async function entrar(
  _anterior: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const dados = esquemaLogin.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!dados.success) {
    return { erro: dados.error.issues[0].message };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });
  if (error) {
    return { erro: "E-mail ou senha incorretos, ou e-mail não confirmado." };
  }
  const proximo = formData.get("proximo");
  redirect(typeof proximo === "string" && proximo ? proximo : "/painel");
}

export async function sair(): Promise<void> {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
```

`app/src/app/(publico)/cadastro/actions.ts`:

```ts
"use server";

import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { esquemaCadastro } from "@/lib/validacao/auth";

export type EstadoCadastro = { erro?: string; sucesso?: boolean };

export async function cadastrar(
  _anterior: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  const dados = esquemaCadastro.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!dados.success) {
    return { erro: dados.error.issues[0].message };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signUp({
    email: dados.data.email,
    password: dados.data.senha,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login?confirmado=1`,
    },
  });
  if (error) {
    return { erro: "Não foi possível cadastrar. Tente outro e-mail." };
  }
  return { sucesso: true };
}
```

- [ ] **Step 4: Páginas**

`app/src/app/(publico)/login/page.tsx`:

```tsx
"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { entrar, type EstadoAuth } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function FormularioLogin() {
  const params = useSearchParams();
  const [estado, acao, pendente] = useActionState<EstadoAuth, FormData>(
    entrar,
    {},
  );
  return (
    <form action={acao} className="mx-auto mt-24 flex w-80 flex-col gap-4">
      <h1 className="text-2xl font-bold">Entrar no PyTime</h1>
      {params.get("confirmado") && (
        <p className="text-sm text-green-700">E-mail confirmado. Faça login.</p>
      )}
      <input type="hidden" name="proximo" value={params.get("proximo") ?? ""} />
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div>
        <Label htmlFor="senha">Senha</Label>
        <Input id="senha" name="senha" type="password" required />
      </div>
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Entrando..." : "Entrar"}
      </Button>
      <p className="text-sm">
        Não tem conta? <Link className="underline" href="/cadastro">Cadastre-se</Link>
      </p>
    </form>
  );
}

export default function PaginaLogin() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}
```

`app/src/app/(publico)/cadastro/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { cadastrar, type EstadoCadastro } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PaginaCadastro() {
  const [estado, acao, pendente] = useActionState<EstadoCadastro, FormData>(
    cadastrar,
    {},
  );
  if (estado.sucesso) {
    return (
      <div className="mx-auto mt-24 w-80">
        <h1 className="text-2xl font-bold">Confira seu e-mail</h1>
        <p className="mt-2 text-sm">
          Enviamos um link de confirmação. Depois de confirmar,{" "}
          <Link className="underline" href="/login">faça login</Link>.
        </p>
      </div>
    );
  }
  return (
    <form action={acao} className="mx-auto mt-24 flex w-80 flex-col gap-4">
      <h1 className="text-2xl font-bold">Criar conta</h1>
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div>
        <Label htmlFor="senha">Senha (mínimo 8 caracteres)</Label>
        <Input id="senha" name="senha" type="password" required />
      </div>
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Enviando..." : "Cadastrar"}
      </Button>
      <p className="text-sm">
        Já tem conta? <Link className="underline" href="/login">Entrar</Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 5: Validar e commitar**

Run: `npm run teste && npm run build` → Expected: PASS + build ok.
Smoke manual: `npm run dev`, cadastrar um e-mail real, receber confirmação, logar → redireciona para `/painel` (404 por enquanto — página vem na Task 13; o redirect acontecer já valida o fluxo).

```bash
git add app/src/app/\(publico\) app/src/lib/validacao app/tests/validacao-auth.test.ts
git commit -m "feat(app): login e cadastro com verificação de e-mail"
```

---

### Task 10: Onboarding — "criar sua escola"

**Files:**
- Create: `app/src/app/criar-escola/page.tsx`, `app/src/app/criar-escola/actions.ts`, `app/src/lib/perfis.ts`

**Interfaces:**
- Consumes: RPC `criar_unidade_com_admin` (Task 7), `esquemaCriarEscola` (Task 9), `criarClienteServidor` (Task 8).
- Produces: `obterPerfis(): Promise<Perfil[]>` com `type Perfil = { unidade_id: string; papel: "admin" | "coordenador" | "professor"; unidade_nome: string }` — usado pelo layout interno (Task 13) e pelo seletor de unidade.

- [ ] **Step 1: Helper de perfis**

`app/src/lib/perfis.ts`:

```ts
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";

export type Perfil = {
  unidade_id: string;
  papel: "admin" | "coordenador" | "professor";
  unidade_nome: string;
};

export async function obterPerfis(): Promise<Perfil[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("perfis")
    .select("unidade_id, papel, unidades(nome)")
    .order("criado_em");
  if (error || !data) return [];
  return data.map((p) => ({
    unidade_id: p.unidade_id,
    papel: p.papel,
    unidade_nome:
      (p.unidades as unknown as { nome: string } | null)?.nome ?? "Unidade",
  }));
}
```

- [ ] **Step 2: Action + página**

`app/src/app/criar-escola/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { esquemaCriarEscola } from "@/lib/validacao/auth";

export type EstadoEscola = { erro?: string };

export async function criarEscola(
  _anterior: EstadoEscola,
  formData: FormData,
): Promise<EstadoEscola> {
  const dados = esquemaCriarEscola.safeParse({ nome: formData.get("nome") });
  if (!dados.success) {
    return { erro: dados.error.issues[0].message };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("criar_unidade_com_admin", {
    p_nome: dados.data.nome,
  });
  if (error) {
    return { erro: "Não foi possível criar a escola. Tente novamente." };
  }
  redirect("/painel");
}
```

`app/src/app/criar-escola/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { obterPerfis } from "@/lib/perfis";
import { FormularioEscola } from "./formulario";

export default async function PaginaCriarEscola() {
  const perfis = await obterPerfis();
  if (perfis.length > 0) {
    redirect("/painel");
  }
  return <FormularioEscola />;
}
```

`app/src/app/criar-escola/formulario.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { criarEscola, type EstadoEscola } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioEscola() {
  const [estado, acao, pendente] = useActionState<EstadoEscola, FormData>(
    criarEscola,
    {},
  );
  return (
    <form action={acao} className="mx-auto mt-24 flex w-96 flex-col gap-4">
      <h1 className="text-2xl font-bold">Crie sua escola</h1>
      <p className="text-sm text-muted-foreground">
        Você será o administrador desta unidade.
      </p>
      <div>
        <Label htmlFor="nome">Nome da escola</Label>
        <Input id="nome" name="nome" required />
      </div>
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Criando..." : "Criar escola"}
      </Button>
    </form>
  );
}
```

(Adicionar `app/src/app/criar-escola/formulario.tsx` à lista de arquivos criados.)

- [ ] **Step 3: Validar e commitar**

Run: `npm run teste && npm run build` → Expected: PASS.
Smoke manual: logar com usuário sem perfil → `/criar-escola` → criar → redireciona `/painel`; no Supabase, `unidades` e `perfis` ganharam 1 linha cada.

```bash
git add app/src/app/criar-escola app/src/lib/perfis.ts
git commit -m "feat(app): onboarding de criação de escola com perfil admin"
```

---

### Task 11: Aceite de convite — `/convite/[token]`

**Files:**
- Create: `app/src/app/(publico)/convite/[token]/page.tsx`, `app/src/app/(publico)/convite/[token]/actions.ts`

**Interfaces:**
- Consumes: RPC `aceitar_convite` (Task 7), `criarClienteServico` e `criarClienteServidor` (Task 8).
- Produces: fluxo completo de aceite; rota já é pública no middleware (Task 8).

- [ ] **Step 1: Action de aceite**

`app/src/app/(publico)/convite/[token]/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";

export type EstadoAceite = { erro?: string };

export async function aceitarConvite(
  _anterior: EstadoAceite,
  formData: FormData,
): Promise<EstadoAceite> {
  const token = formData.get("token");
  if (typeof token !== "string" || !token) {
    return { erro: "Convite inválido." };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("aceitar_convite", { p_token: token });
  if (error) {
    // A RPC devolve mensagens em português (expirado, já utilizado, e-mail errado)
    return { erro: error.message };
  }
  redirect("/painel");
}
```

- [ ] **Step 2: Página**

`app/src/app/(publico)/convite/[token]/page.tsx`:

```tsx
import Link from "next/link";
import { criarClienteServico } from "@/lib/supabase/cliente-servico";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { FormularioAceite } from "./formulario";

export default async function PaginaConvite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Leitura via service_role: o convidado ainda não é membro da unidade,
  // então o RLS (convites só para admin) o bloquearia. Somente leitura
  // dos campos exibidos; o aceite em si passa pela RPC com o JWT do usuário.
  const servico = criarClienteServico();
  const { data: convite } = await servico
    .from("convites")
    .select("email, papel, expira_em, aceito_em, unidades(nome)")
    .eq("token", token)
    .maybeSingle();

  if (!convite) {
    return <Aviso titulo="Convite não encontrado" texto="Confira o link recebido." />;
  }
  if (convite.aceito_em) {
    return <Aviso titulo="Convite já utilizado" texto="Faça login para acessar." />;
  }
  if (new Date(convite.expira_em) < new Date()) {
    return <Aviso titulo="Convite expirado" texto="Peça um novo convite ao administrador." />;
  }

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nomeUnidade =
    (convite.unidades as unknown as { nome: string } | null)?.nome ?? "a escola";

  if (!user) {
    const proximo = encodeURIComponent(`/convite/${token}`);
    return (
      <div className="mx-auto mt-24 w-96">
        <h1 className="text-2xl font-bold">Convite para {nomeUnidade}</h1>
        <p className="mt-2 text-sm">
          Convite para <strong>{convite.email}</strong> como{" "}
          <strong>{convite.papel}</strong>. Entre ou crie a conta com esse
          e-mail para aceitar:
        </p>
        <div className="mt-4 flex gap-4 text-sm underline">
          <Link href={`/login?proximo=${proximo}`}>Entrar</Link>
          <Link href="/cadastro">Criar conta</Link>
        </div>
      </div>
    );
  }

  return (
    <FormularioAceite
      token={token}
      nomeUnidade={nomeUnidade}
      papel={convite.papel}
    />
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mx-auto mt-24 w-96">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <p className="mt-2 text-sm">{texto}</p>
    </div>
  );
}
```

`app/src/app/(publico)/convite/[token]/formulario.tsx` (adicionar à lista de arquivos):

```tsx
"use client";

import { useActionState } from "react";
import { aceitarConvite, type EstadoAceite } from "./actions";
import { Button } from "@/components/ui/button";

export function FormularioAceite({
  token,
  nomeUnidade,
  papel,
}: {
  token: string;
  nomeUnidade: string;
  papel: string;
}) {
  const [estado, acao, pendente] = useActionState<EstadoAceite, FormData>(
    aceitarConvite,
    {},
  );
  return (
    <form action={acao} className="mx-auto mt-24 flex w-96 flex-col gap-4">
      <h1 className="text-2xl font-bold">Convite para {nomeUnidade}</h1>
      <p className="text-sm">
        Você entrará como <strong>{papel}</strong>.
      </p>
      <input type="hidden" name="token" value={token} />
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Aceitando..." : "Aceitar convite"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Validar e commitar**

Run: `npm run teste && npm run build` → Expected: PASS.
Smoke manual (após Task 12 existir dá para testar ponta a ponta; por ora): inserir um convite via SQL editor do Supabase com seu segundo e-mail, abrir `/convite/<token>`, aceitar logado → vira perfil.

```bash
git add "app/src/app/(publico)/convite"
git commit -m "feat(app): aceite de convite por token com validações"
```

---

### Task 12: Unidade ativa + gestão de convites (admin)

**Files:**
- Create: `app/src/lib/unidade-ativa.ts`, `app/src/app/(interno)/convites/page.tsx`, `app/src/app/(interno)/convites/actions.ts`, `app/src/app/(interno)/convites/formulario.tsx`

**Interfaces:**
- Consumes: `obterPerfis` (Task 10), `esquemaConvite` (Task 9), clients (Task 8).
- Produces:
  - `obterUnidadeAtiva(): Promise<Perfil | null>` — cookie `unidade_ativa` validado contra os perfis; fallback primeiro perfil. Usado por TODA página interna (Task 13 e planos 2B/2C).
  - `definirUnidadeAtiva(unidadeId: string)` — server action (cookie).
  - Actions `criarConvite`, `revogarConvite`.

- [ ] **Step 1: Helper da unidade ativa**

`app/src/lib/unidade-ativa.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { obterPerfis, type Perfil } from "@/lib/perfis";

const COOKIE_UNIDADE = "unidade_ativa";

export async function obterUnidadeAtiva(): Promise<Perfil | null> {
  const perfis = await obterPerfis();
  if (perfis.length === 0) return null;
  const cookieStore = await cookies();
  const escolhida = cookieStore.get(COOKIE_UNIDADE)?.value;
  return perfis.find((p) => p.unidade_id === escolhida) ?? perfis[0];
}

export async function definirUnidadeAtiva(formData: FormData): Promise<void> {
  const unidadeId = formData.get("unidade_id");
  if (typeof unidadeId !== "string") return;
  const perfis = await obterPerfis();
  if (!perfis.some((p) => p.unidade_id === unidadeId)) return;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_UNIDADE, unidadeId, { path: "/" });
  revalidatePath("/", "layout");
}
```

- [ ] **Step 2: Actions de convites**

`app/src/app/(interno)/convites/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { criarClienteServico } from "@/lib/supabase/cliente-servico";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { esquemaConvite } from "@/lib/validacao/auth";

export type EstadoConvite = { erro?: string; sucesso?: boolean };

export async function criarConvite(
  _anterior: EstadoConvite,
  formData: FormData,
): Promise<EstadoConvite> {
  const dados = esquemaConvite.safeParse({
    email: formData.get("email"),
    papel: formData.get("papel"),
  });
  if (!dados.success) {
    return { erro: dados.error.issues[0].message };
  }
  // Revalidação de role no servidor (o RLS é a última linha de defesa)
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel !== "admin") {
    return { erro: "Apenas administradores convidam usuários." };
  }
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("convites")
    .insert({
      unidade_id: perfil.unidade_id,
      email: dados.data.email,
      papel: dados.data.papel,
    })
    .select("token")
    .single();
  if (error || !data) {
    return { erro: "Não foi possível criar o convite." };
  }
  // E-mail best-effort via Supabase Auth; se o usuário já existir, o
  // convite continua válido pelo link copiável exibido na lista.
  try {
    const servico = criarClienteServico();
    await servico.auth.admin.inviteUserByEmail(dados.data.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/convite/${data.token}`,
    });
  } catch {
    // silencioso: o link copiável cobre este caso
  }
  revalidatePath("/convites");
  return { sucesso: true };
}

export async function revogarConvite(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const supabase = await criarClienteServidor();
  await supabase.from("convites").delete().eq("id", id); // RLS: só admin
  revalidatePath("/convites");
}
```

- [ ] **Step 3: Página e formulário**

`app/src/app/(interno)/convites/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { revogarConvite } from "./actions";
import { FormularioConvite } from "./formulario";
import { Button } from "@/components/ui/button";

export default async function PaginaConvites() {
  const perfil = await obterUnidadeAtiva();
  if (!perfil) redirect("/criar-escola");
  if (perfil.papel !== "admin") redirect("/painel");

  const supabase = await criarClienteServidor();
  const { data: convites } = await supabase
    .from("convites")
    .select("id, email, papel, token, expira_em, aceito_em")
    .eq("unidade_id", perfil.unidade_id)
    .order("criado_em", { ascending: false });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Convites</h1>
      <FormularioConvite />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">E-mail</th>
            <th>Papel</th>
            <th>Situação</th>
            <th>Link</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(convites ?? []).map((c) => {
            const expirado = new Date(c.expira_em) < new Date();
            const situacao = c.aceito_em
              ? "Aceito"
              : expirado
                ? "Expirado"
                : "Pendente";
            return (
              <tr key={c.id} className="border-b">
                <td className="py-2">{c.email}</td>
                <td>{c.papel}</td>
                <td>{situacao}</td>
                <td>
                  {situacao === "Pendente" && (
                    <code className="text-xs">/convite/{c.token}</code>
                  )}
                </td>
                <td>
                  {situacao === "Pendente" && (
                    <form action={revogarConvite}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button variant="destructive" size="sm" type="submit">
                        Revogar
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

`app/src/app/(interno)/convites/formulario.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { criarConvite, type EstadoConvite } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioConvite() {
  const [estado, acao, pendente] = useActionState<EstadoConvite, FormData>(
    criarConvite,
    {},
  );
  return (
    <form action={acao} className="flex items-end gap-4">
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div>
        <Label htmlFor="papel">Papel</Label>
        <select
          id="papel"
          name="papel"
          className="block h-9 rounded-md border px-2 text-sm"
          defaultValue="coordenador"
        >
          <option value="coordenador">Coordenador</option>
          <option value="admin">Administrador</option>
        </select>
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? "Convidando..." : "Convidar"}
      </Button>
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      {estado.sucesso && (
        <p className="text-sm text-green-700">Convite criado.</p>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Validar e commitar**

Run: `npm run teste && npm run build` → Expected: PASS (a página `/convites` só renderiza dentro do layout da Task 13; o build já valida os tipos).

```bash
git add "app/src/app/(interno)/convites" app/src/lib/unidade-ativa.ts
git commit -m "feat(app): unidade ativa e gestão de convites pelo admin"
```

---

### Task 13: Layout interno — sidebar, seletor de unidade e /painel

**Files:**
- Create: `app/src/app/(interno)/layout.tsx`, `app/src/app/(interno)/painel/page.tsx`, `app/src/components/barra-lateral.tsx`, `app/src/components/seletor-unidade.tsx`
- Modify: `app/src/app/page.tsx` (redirect para /painel)

**Interfaces:**
- Consumes: `obterPerfis` (Task 10), `obterUnidadeAtiva`/`definirUnidadeAtiva` (Task 12), `sair` (Task 9).
- Produces: layout interno que TODA página futura (2B/2C) herda: usuário sem perfil → `/criar-escola`; sidebar com navegação e seletor quando houver mais de uma unidade.

- [ ] **Step 1: Redirect da raiz**

`app/src/app/page.tsx` (substituir o conteúdo gerado pelo scaffold):

```tsx
import { redirect } from "next/navigation";

export default function Raiz() {
  redirect("/painel");
}
```

- [ ] **Step 2: Layout + sidebar**

`app/src/app/(interno)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { obterPerfis } from "@/lib/perfis";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { BarraLateral } from "@/components/barra-lateral";

export default async function LayoutInterno({
  children,
}: {
  children: React.ReactNode;
}) {
  const perfis = await obterPerfis();
  if (perfis.length === 0) {
    redirect("/criar-escola");
  }
  const ativa = await obterUnidadeAtiva();
  return (
    <div className="flex min-h-screen">
      <BarraLateral perfis={perfis} ativa={ativa!} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

`app/src/components/barra-lateral.tsx`:

```tsx
import Link from "next/link";
import type { Perfil } from "@/lib/perfis";
import { sair } from "@/app/(publico)/login/actions";
import { SeletorUnidade } from "@/components/seletor-unidade";
import { Button } from "@/components/ui/button";

export function BarraLateral({
  perfis,
  ativa,
}: {
  perfis: Perfil[];
  ativa: Perfil;
}) {
  return (
    <aside className="flex w-60 flex-col gap-6 border-r p-4">
      <div>
        <div className="text-lg font-bold">PyTime</div>
        {perfis.length > 1 ? (
          <SeletorUnidade perfis={perfis} ativa={ativa.unidade_id} />
        ) : (
          <div className="text-sm text-muted-foreground">
            {ativa.unidade_nome}
          </div>
        )}
      </div>
      <nav className="flex flex-col gap-2 text-sm">
        <Link href="/painel">Painel</Link>
        {ativa.papel === "admin" && <Link href="/convites">Convites</Link>}
        {/* Rotas de cadastros/regras/gerações entram nos planos 2B/2C */}
      </nav>
      <form action={sair} className="mt-auto">
        <Button variant="outline" size="sm" type="submit">
          Sair
        </Button>
      </form>
    </aside>
  );
}
```

`app/src/components/seletor-unidade.tsx`:

```tsx
"use client";

import { useRef } from "react";
import type { Perfil } from "@/lib/perfis";
import { definirUnidadeAtiva } from "@/lib/unidade-ativa";

export function SeletorUnidade({
  perfis,
  ativa,
}: {
  perfis: Perfil[];
  ativa: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={definirUnidadeAtiva}>
      <select
        name="unidade_id"
        defaultValue={ativa}
        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
        onChange={() => form.current?.requestSubmit()}
      >
        {perfis.map((p) => (
          <option key={p.unidade_id} value={p.unidade_id}>
            {p.unidade_nome}
          </option>
        ))}
      </select>
    </form>
  );
}
```

- [ ] **Step 3: Painel**

`app/src/app/(interno)/painel/page.tsx`:

```tsx
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PaginaPainel() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();

  async function contar(tabela: string): Promise<number> {
    const { count } = await supabase
      .from(tabela)
      .select("*", { count: "exact", head: true })
      .eq("unidade_id", perfil.unidade_id);
    return count ?? 0;
  }

  const [turmas, professores, disciplinas] = await Promise.all([
    contar("turmas"),
    contar("professores"),
    contar("disciplinas"),
  ]);
  const { data: ultima } = await supabase
    .from("geracoes")
    .select("status, criada_em")
    .eq("unidade_id", perfil.unidade_id)
    .order("criada_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cartoes = [
    { titulo: "Turmas", valor: turmas },
    { titulo: "Professores", valor: professores },
    { titulo: "Disciplinas", valor: disciplinas },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{perfil.unidade_nome}</h1>
      <div className="grid grid-cols-3 gap-4">
        {cartoes.map((c) => (
          <Card key={c.titulo}>
            <CardHeader>
              <CardTitle className="text-sm">{c.titulo}</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{c.valor}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Última geração</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {ultima
            ? `${ultima.status} em ${new Date(ultima.criada_em).toLocaleString("pt-BR")}`
            : "Nenhuma geração ainda. Cadastros e geração chegam nas próximas fases."}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Validar e commitar**

Run: `npm run teste && npm run build` → Expected: PASS.
Smoke manual: login → `/painel` com contagens 0; admin vê link Convites; criar convite; sair.

```bash
git add "app/src/app/(interno)" app/src/components app/src/app/page.tsx
git commit -m "feat(app): layout interno com sidebar, seletor de unidade e painel"
```

---

### Task 14: Validação final da fundação

**Files:**
- Modify: `CLAUDE.md` (comandos de validação do app e do supabase)

**Interfaces:**
- Consumes: tudo acima.
- Produces: fundação verde e documentada; branch pronta para merge via skill de finalização.

- [ ] **Step 1: Rodar tudo**

```bash
cd d:/laragon/www/pytime/app && npm run teste && npm run lint && npm run build
cd d:/laragon/www/pytime && npx supabase test db --linked
cd d:/laragon/www/pytime/engine && python -m pytest -q   # engine intocado: 47 PASS
```

Expected: vitest PASS, lint limpo, build ok, pgTAP 31 PASS, engine 47 PASS.

- [ ] **Step 2: Fluxo ponta a ponta manual (smoke)**

1. `/cadastro` → confirmar e-mail → `/login` → `/criar-escola` → `/painel`.
2. `/convites` → convidar segundo e-mail → abrir `/convite/<token>` no outro usuário → aceitar → `/painel` da mesma unidade.
3. Segundo usuário NÃO vê link Convites (coordenador).

- [ ] **Step 3: Atualizar CLAUDE.md**

Acrescentar ao bloco "Comandos de validação" do `CLAUDE.md`:

```bash
cd app && npm run teste && npm run lint && npm run build   # app Next.js
npx supabase test db --linked                              # RLS via pgTAP
```

- [ ] **Step 4: Commit final**

```bash
git add CLAUDE.md
git commit -m "docs: comandos de validação do app e do supabase no CLAUDE.md"
```

Depois: usar a skill `superpowers:finishing-a-development-branch` para integrar `fase2a-fundacao` ao `master` (suíte completa antes do merge).
