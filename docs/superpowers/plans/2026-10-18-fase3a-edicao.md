# Fase 3A — Edição manual e cenário oficial — Plano de Implementação

> **Para quem executa:** siga task a task, em ordem. Cada task é TDD (teste
> que falha → implementação mínima → teste passa) e termina em um commit.
> Passos usam checkbox (`- [ ]`).

**Objetivo:** o coordenador abre um cenário gerado, troca aulas de lugar
dentro de uma turma vendo na hora o veredito do motor (violações e delta de
custo), salva (ou força, registrando a exceção), duplica versões e marca uma
como oficial — que é a que vai para o escolajba.

**Arquitetura:** a validação é sempre do motor, pelo processo `validador` no
Fly (`POST /avaliar`), chamado por Server Actions; o navegador nunca fala com
ele. A grade é avaliada contra o snapshot `geracoes.instancia`. Gravações em
`cenarios`/`aulas_alocadas` continuam sem GRANT para `authenticated`: a Server
Action confere o papel, revalida com o motor e grava com o cliente
`service_role` por RPC transacional com trava otimista (`versao`). O worker
passa a gravar a avaliação exata do cenário logo após a geração.

**Stack:** Next.js 16 (Server Actions, client components), Supabase
(Postgres/RLS/pgTAP), worker Python (`pytime_engine.AvaliadorPreparado`),
vitest, Playwright (E2E contra o staging).

**Spec:** `docs/superpowers/specs/2026-10-18-fase3-pos-geracao-design.md`
(§2 princípios, §3 modelo, §4 fluxos, §5 testes, §8 backlog, §9 decisões).
Contexto: spec master §6; `docs/exportacao/README.md` (exportação escolajba).

**Backlog herdado incluído:** policies com `(select tenho_papel(...))`
(Task 10); RPCs transacionais para `salvarGrade` (turnos) e
`salvarDisponibilidades` (Task 11); `ORDENS` derivado da grade no formulário
de regras, bounds no `esquemaGrade` e erros de select descartados nas telas
tocadas (Task 12). **Correção da spec §8:** `ORDENS` fica em
`regras/formulario.tsx` e `salvarGrade` é o editor de grade de **turnos** —
não a tela do cenário. Por isso eles viram tasks independentes, no fim.
**Fica para a 3B:** parâmetros de regra órfãos, confirmação no excluir,
custo inflado do `resolver`, ordem das restrições por `PYTHONHASHSEED`.

## Restrições globais

- Identificadores, mensagens, rotas, docstrings e commits **em português**.
- **`engine/` não muda nesta subfase.** Tudo o que o motor precisa já existe
  (`AvaliadorPreparado`, `avaliar`, `Avaliacao`). Se uma task parecer exigir
  mudança no motor, pare e reavalie com o revisor (`revisor-engine`).
- **Nenhuma regra do catálogo em TypeScript** (spec master §6). O app só
  monta pedidos, chama o validador e traduz motivos para texto.
- **Edição = troca de duas aulas da mesma turma** (P2). Matriz cheia por
  construção: nunca há slot vazio nem duplicado na turma.
- **Rascunho no cliente + salvar explícito** (P3). Avaliar o rascunho não
  grava nada; salvar revalida no servidor (nunca confia no veredito vindo do
  cliente).
- **Editam admin e coordenador** (P6), conferido em toda Server Action com
  `obterUnidadeAtiva()` + papel, e de novo dentro da RPC.
- Custos exibidos vêm de `cenarios.avaliacao` (exata). `geracoes.resultado`
  só como fallback para cenários antigos sem avaliação.
- `service_role` no app **só** nas Server Actions desta subfase e de
  convites (comentário em `lib/supabase/cliente-servico.ts` atualizado).
- Envs novas (server-only, nunca `NEXT_PUBLIC_`): `VALIDADOR_URL`,
  `VALIDADOR_TOKEN` (no `.env.example`, na Vercel e nos secrets do CI de E2E).
- Toda migration nova: aplicar no **staging antes do PR** e em produção no
  deploy (`docs/deploy.md` § Staging e § Rotina).
- Validação padrão: app `npm run teste && npm run lint && npm run build`;
  worker `pytest -q && ruff check . && ruff format --check .` (com
  `SUPABASE_DB_URL` do **staging**); RLS `python supabase/tests/rodar_testes.py`
  (staging). CI faz tudo isso com o secret `SUPABASE_DB_URL_STAGING`.
- Commits pequenos: `feat(supabase|worker|app): ...`, `docs: ...`.

## Estrutura de arquivos

```
supabase/migrations/<ts>_fase3a_edicao.sql      # Task 1
supabase/migrations/<ts>_policies_select.sql    # Task 10
supabase/migrations/<ts>_rpcs_cadastros.sql     # Task 11
supabase/tests/0009_edicao.test.sql             # Task 1
supabase/tests/0010_rpcs_cadastros.test.sql     # Task 11
worker/src/pytime_worker/fila.py                # Task 2: gravar_avaliacao
worker/src/pytime_worker/executor.py            # Task 2: avalia após concluir
worker/tests/test_executor.py                   # Task 2
app/src/lib/edicao/trocas.ts                    # Task 3: rascunho, trocas, pilha
app/src/lib/edicao/avaliacao.ts                 # Task 3: delta de custo, resumo
app/src/lib/edicao/validador.ts                 # Task 4: cliente HTTP do validador
app/src/lib/edicao/snapshot.ts                  # Task 8: hash da instância
app/src/lib/nucleo.ts                           # Task 5: motivos estruturais
app/src/app/(interno)/grade/[cenarioId]/actions.ts      # Task 6
app/src/app/(interno)/grade/[cenarioId]/page.tsx        # Task 7
app/src/app/(interno)/grade/[cenarioId]/cabecalho.tsx   # Task 7
app/src/app/(interno)/grade/[cenarioId]/editor.tsx      # Task 9
app/src/app/(interno)/geracoes/page.tsx                 # Task 7
app/tests/edicao-*.test.ts, nucleo.test.ts              # Tasks 3–6, 8
app/e2e/edicao.spec.ts + playwright.config.ts           # Task 13
.github/workflows/ci.yml                                # Task 13
docs/deploy.md, .env.example, CLAUDE.md                 # Tasks 4, 14
```

---

### Task 1: Migration — cenários editáveis, oficial único e RPCs de gravação

**Arquivos:** `supabase/migrations/<ts>_fase3a_edicao.sql`,
`supabase/tests/0009_edicao.test.sql`.

**Interfaces (SQL):**

```sql
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

create unique index cenarios_um_oficial on cenarios (unidade_id) where oficial;

-- Todas: security definer, search_path = public, EXECUTE só para service_role.
-- p_usuario é o auth.uid() que a Server Action leu da sessão; a RPC confere
-- o papel dele na unidade do cenário (defesa em profundidade).
create function salvar_grade_cenario(
  p_cenario uuid, p_versao_lida int, p_aulas jsonb,   -- [{atribuicao_id, slot_id}]
  p_avaliacao jsonb, p_excecoes jsonb, p_usuario uuid
) returns int   -- nova versão
create function duplicar_cenario(p_cenario uuid, p_nome text, p_usuario uuid)
  returns uuid  -- id do novo cenário
create function marcar_oficial(p_cenario uuid, p_usuario uuid) returns void
create function renomear_cenario(p_cenario uuid, p_nome text, p_usuario uuid)
  returns void
```

Regras das RPCs:

- Papel: `exists (select 1 from perfis where user_id = p_usuario and
  unidade_id = <unidade do cenário> and papel in ('admin','coordenador'))`,
  senão `raise exception 'Apenas gestores editam cenários.'`.
- `salvar_grade_cenario`: `select … for update` no cenário; se
  `versao <> p_versao_lida` → `raise exception 'conflito_versao'` (o app
  traduz). Confere que `p_aulas` tem exatamente o mesmo multiconjunto de
  `atribuicao_id` das aulas atuais (troca não cria nem some aula) →
  senão `raise exception 'Grade não corresponde ao cenário.'`. Apaga e
  reinsere as `aulas_alocadas` do cenário, grava `avaliacao`,
  `avaliado_em = now()`, `excecoes`, `versao = versao + 1`,
  `atualizado_em/por`. Devolve a nova versão.
- `duplicar_cenario`: copia linha (nome, `origem = 'duplicado'`,
  `cenario_base_id`, `oficial = false`, `versao = 1`, mesma avaliação e
  exceções) e todas as aulas.
- `marcar_oficial`: na mesma transação, `oficial = false` no oficial atual
  da unidade e `true` no cenário pedido (o índice parcial garante a
  unicidade mesmo sob concorrência).
- `revoke execute … from public, anon, authenticated; grant execute … to
  service_role;`

- [ ] **Passo 1 — teste que falha** (`0009_edicao.test.sql`, `plan(N)`):
  - colunas novas com defaults (cenário criado pelo worker vem com
    `nome = 'Gerado'`, `versao = 1`, `excecoes = '[]'`);
  - dois oficiais na mesma unidade → `unique_violation`; em unidades
    diferentes, ok;
  - `authenticated` (Ana, coordenadora) chamando qualquer das 4 RPCs →
    `42501` (sem EXECUTE);
  - como `service_role`: `salvar_grade_cenario` com versão certa troca as
    aulas e devolve `versao + 1`; com versão velha → `conflito_versao`; com
    aula a mais/a menos → erro de correspondência; usuário professor ou de
    outra unidade → erro de papel;
  - `duplicar_cenario` copia aulas (contagem igual) e marca origem/base;
  - `marcar_oficial` troca o oficial;
  - `renomear_cenario` com nome vazio → `check_violation`;
  - RLS de leitura das colunas novas continua escopada por unidade.
- [ ] **Passo 2 — rodar e ver falhar:**
  `python supabase/tests/rodar_testes.py supabase/tests/0009_edicao.test.sql`
  (staging, sem a migration) → falhas esperadas.
- [ ] **Passo 3 — migration.** Aplicar no staging:
  `npx supabase db push --db-url "$SUPABASE_DB_URL"`.
- [ ] **Passo 4 — todos os pgTAP verdes** (0001–0009).
- [ ] **Passo 5 — commit:** `feat(supabase): cenários editáveis, oficial
  único e RPCs de gravação da edição manual`.

---

### Task 2: Worker — avaliação exata do cenário após a geração

**Arquivos:** `worker/src/pytime_worker/fila.py`,
`worker/src/pytime_worker/executor.py`, `worker/tests/test_executor.py`.

**Interfaces:**

```python
# fila.py
def gravar_avaliacao(conn, cenario_id: str, avaliacao: dict[str, Any]) -> None:
    """update cenarios set avaliacao = %s::jsonb, avaliado_em = now() where id = %s"""

# executor.py — depois de gravar_resultado_concluido devolver cenario_id:
#   avaliacao = AvaliadorPreparado(instancia).avaliar(resultado.grade)
#   fila.gravar_avaliacao(conn, cenario_id, avaliacao.model_dump())
# Best-effort: exceção na avaliação só é logada; a geração continua
# 'concluida' e o cenário fica sem avaliação (a UI cai no fallback).
```

- [ ] **Passo 1 — teste que falha** (`test_executor.py`, banco de staging):
  `test_concluida_grava_avaliacao_exata` — processa uma instância pequena
  viável; o cenário criado tem `avaliacao` com `violacoes_hard == []` e
  `custo_total` igual ao de `avaliar(instancia, grade)` recalculado no teste;
  `test_falha_na_avaliacao_nao_derruba_geracao` — com
  `monkeypatch` fazendo `AvaliadorPreparado` levantar, a geração fica
  `concluida` e `avaliacao` é `NULL`.
- [ ] **Passo 2 — implementar** `gravar_avaliacao` + chamada no executor.
- [ ] **Passo 3 —** `cd worker && pytest -q && ruff check . && ruff format --check .`
  (com `SUPABASE_DB_URL` do staging; nenhum worker do Fly aponta para ele).
- [ ] **Passo 4 — commit:** `feat(worker): grava a avaliação exata do
  cenário após a geração`.

---

### Task 3: App — rascunho de trocas e delta de custo (funções puras)

**Arquivos:** `app/src/lib/edicao/trocas.ts`,
`app/src/lib/edicao/avaliacao.ts`, `app/tests/edicao-trocas.test.ts`,
`app/tests/edicao-avaliacao.test.ts`.

**Interfaces:**

```ts
export type Aula = { atribuicao_id: string; slot_id: string };
export type Rascunho = { aulas: Aula[]; feitas: Troca[]; desfeitas: Troca[] };
export type Troca = { slotA: string; slotB: string; turmaId: string };

/** Troca o conteúdo de dois slots da mesma turma. Erro legível se os slots
 *  não são da turma, são iguais ou algum está vazio. Não muta a entrada. */
export function aplicarTroca(aulas: Aula[], troca: Troca,
  turmaDaAtribuicao: Record<string, string>): Aula[];
export function novoRascunho(aulas: Aula[]): Rascunho;
export function trocar(r: Rascunho, t: Troca, mapa: Record<string, string>): Rascunho;
export function desfazer(r: Rascunho, mapa: …): Rascunho;   // troca é involutiva
export function refazer(r: Rascunho, mapa: …): Rascunho;
export function alterado(r: Rascunho, base: Aula[]): boolean;

// avaliacao.ts — tipos espelho de pytime_engine.Avaliacao
export type Avaliacao = { violacoes_hard: string[];
  custos: { regra_id: string; tipo: string; custo: number; detalhes: string[] }[];
  custo_total: number; tempo_segundos: number };
export function deltaCusto(base: Avaliacao | null, nova: Avaliacao):
  { total: number; porRegra: { regra_id: string; tipo: string; delta: number }[] };
```

- [ ] **Passo 1 — testes que falham:** troca na mesma turma; troca entre
  turmas recusada; mesmo slot recusado; desfazer devolve a grade original;
  refazer reaplica; nova troca limpa `desfeitas`; `alterado` falso após
  desfazer tudo; `deltaCusto` com regra que some, que aparece e base nula.
- [ ] **Passo 2 — implementar; Passo 3 —** `npm run teste && npm run lint`.
- [ ] **Passo 4 — commit:** `feat(app): rascunho de trocas com desfazer e
  delta de custo`.

---

### Task 4: App — cliente do validador

**Arquivos:** `app/src/lib/edicao/validador.ts` (`import "server-only"`),
`app/tests/edicao-validador.test.ts`, `.env.example`.

**Interface:**

```ts
export type RespostaValidador =
  | { ok: true; avaliacao: Avaliacao }
  | { ok: false; erro: string };   // mensagem para o usuário, em português

/** POST {VALIDADOR_URL}/avaliar com Bearer VALIDADOR_TOKEN, timeout 10 s.
 *  401 → "validador mal configurado"; 422 → "dados inválidos para o
 *  motor"; 5xx/timeout/rede → "validação indisponível, tente de novo". */
export async function avaliarNoValidador(instancia: InstanciaMotor,
  aulas: Aula[], opcoes?: { fetch?: typeof fetch; timeoutMs?: number }):
  Promise<RespostaValidador>;
```

- [ ] **Passo 1 — testes que falham** com `fetch` injetado: corpo e header
  corretos; 200 → `ok`; 401/422/500 → mensagens; `AbortError` (timeout) →
  indisponível; env ausente → erro de configuração sem chamar `fetch`.
- [ ] **Passo 2 — implementar**; adicionar ao `.env.example`
  `VALIDADOR_URL=https://pytime-worker.fly.dev` e `VALIDADOR_TOKEN=` com
  comentário "server-only".
- [ ] **Passo 3 —** `npm run teste && npm run lint`.
- [ ] **Passo 4 — commit:** `feat(app): cliente do validador da edição manual`.

---

### Task 5: App — motivos estruturais legíveis

**Arquivos:** `app/src/lib/nucleo.ts`, `app/tests/nucleo.test.ts`.

**Interface nova:**

```ts
export type MotivoTraduzido = { texto: string; slotIds: string[] };
/** Como traduzirNucleo, mas devolve também os slots a destacar na grade. */
export function traduzirViolacoes(motivos: string[], instancia: InstanciaMotor):
  MotivoTraduzido[];
```

Formatos novos (de `avaliador.py`): `estrutural:professor_duplo:<prof>:<slot>`,
`estrutural:turma_duplo|turma_vazio:<turma>:<slot>`,
`estrutural:fora_do_turno:<atrib>:<slot>`, `estrutural:carga:<atrib>`,
`estrutural:atribuicao_desconhecida:<id>`, `instancia:<frase>`. Slot vira
"Seg 3º horário" (dia + ordem do snapshot).

- [ ] **Passo 1 — testes que falham:** cada formato acima vira frase com
  nomes e devolve o `slotId`; motivos de regra (`disponibilidade:` etc.)
  continuam como hoje e devolvem `slotIds = []`; `instancia:` remove o
  prefixo; `traduzirNucleo` (usado em `/geracoes`) segue passando.
- [ ] **Passo 2 — implementar** reaproveitando `traduzirMotivo`.
- [ ] **Passo 3 / 4 —** validar e commit: `feat(app): violações estruturais
  da edição traduzidas com o slot`.

---

### Task 6: App — Server Actions do cenário

**Arquivo:** `app/src/app/(interno)/grade/[cenarioId]/actions.ts`,
`app/tests/edicao-actions.test.ts` (só a parte pura: esquemas zod e
mapeamento de erros das RPCs).

**Interfaces:**

```ts
type Estado<T = undefined> = { erro?: string; dados?: T };

avaliarRascunho(cenarioId, aulas): Promise<Estado<{ avaliacao: Avaliacao;
  violacoes: MotivoTraduzido[] }>>
  // papel gestor → lê cenário + geracoes.instancia (cliente do usuário, RLS)
  // → zod nas aulas → avaliarNoValidador. NÃO grava.

salvarCenario(cenarioId, versaoLida, aulas, forcar: boolean):
  Promise<Estado<{ versao: number }>>
  // papel → revalida no validador → violações e !forcar → erro com a lista
  // → excecoes = forcar ? violações (+ forcado_por/em) : []
  // → RPC salvar_grade_cenario via criarClienteServico()
  // → 'conflito_versao' vira "Outra pessoa salvou este cenário. Recarregue
  //    a página; seu rascunho continua aqui." → revalidatePath

duplicarCenario(cenarioId, nome) / marcarOficial(cenarioId) /
renomearCenario(cenarioId, nome)  // papel → RPC → revalidatePath
```

- [ ] **Passo 1 — testes que falham:** esquema das aulas (uuid, lista não
  vazia, sem duplicata de slot por turma); `mapearErroRpc` traduz
  `conflito_versao`, papel e correspondência; nome vazio/longo recusado.
- [ ] **Passo 2 — implementar** (o caminho com banco é coberto pelo E2E da
  Task 13); atualizar o comentário de `cliente-servico.ts`.
- [ ] **Passo 3 / 4 —** validar e commit: `feat(app): Server Actions de
  avaliar, salvar, duplicar, renomear e marcar cenário oficial`.

---

### Task 7: App — tela do cenário e lista com nome, oficial e custo

**Arquivos:** `grade/[cenarioId]/page.tsx`, `grade/[cenarioId]/cabecalho.tsx`,
`geracoes/page.tsx`.

- Cabeçalho: nome (renomear inline), selo **Oficial**, origem ("Cópia de
  …"), custo total e por regra de `cenarios.avaliacao` (fallback
  `geracoes.resultado` com rótulo "estimado"), exceções forçadas com quem e
  quando, versão e última edição.
- Ações para gestor: **Editar** (abre o editor da Task 9), **Duplicar**,
  **Marcar como oficial** (confirmação), links de exportação escolajba (já
  existentes), com destaque "exportar o oficial" quando for o oficial.
- `/geracoes`: cada geração concluída lista seus cenários (nome, selo
  oficial, custo avaliado, link).
- Professor (papel `professor`) vê sem ações.
- Erros de select exibidos (não descartados) nesta tela — item do backlog.
- [ ] **Passo 1 —** extrair para `lib/edicao/avaliacao.ts` a função pura que
  escolhe a fonte do custo (`custoExibido(cenario, resultado)`) com teste.
- [ ] **Passo 2 —** implementar a UI; `npm run teste && npm run lint &&
  npm run build`.
- [ ] **Passo 3 — commit:** `feat(app): cabeçalho do cenário com custo
  avaliado, oficial e ações`.

---

### Task 8: App — aviso de cadastros alterados desde a geração

**Arquivos:** `app/src/lib/edicao/snapshot.ts`,
`app/tests/edicao-snapshot.test.ts`, `grade/[cenarioId]/page.tsx`.

```ts
/** Impressão digital estável da instância (ordena listas por id e chaves
 *  de objeto; ignora budget_segundos). Igual ⇔ mesmos dados de entrada. */
export function impressaoInstancia(inst: InstanciaMotor): string;
```

- [ ] **Passo 1 — testes que falham:** mesma instância com listas em ordem
  diferente → mesma impressão; budget diferente → mesma; nome de professor
  diferente → diferente; nova atribuição → diferente.
- [ ] **Passo 2 —** implementar (SHA-256 via `node:crypto` de JSON canônico)
  e, na página, comparar com `montarInstancia(buscarDadosUnidade())`; se
  diferente, aviso da spec §4.5 (inclui reimportação do escolajba).
- [ ] **Passo 3 / 4 —** validar e commit: `feat(app): aviso quando os
  cadastros mudaram desde a geração do cenário`.

---

### Task 9: App — modo edição (client component)

**Arquivo:** `grade/[cenarioId]/editor.tsx` (+ ajustes na `TabelaGrade`
para células clicáveis).

- Visão por turma. Clique numa aula seleciona; clique em outro horário da
  mesma turma chama `trocar`. Teclado: setas movem o foco, Enter seleciona
  / troca, Esc cancela (células são `button` com `aria-pressed`).
- Após cada troca, `avaliarRascunho` com *debounce* de 300 ms e
  cancelamento da chamada anterior; enquanto não volta, selo
  "validando…" (fallback otimista).
- Painel lateral: violações (`traduzirViolacoes`) com as células dos
  `slotIds` destacadas; delta de custo total e por regra (`deltaCusto`
  contra a avaliação gravada).
- **Desfazer / Refazer** (botões + Ctrl+Z / Ctrl+Shift+Z).
- **Salvar**: sem violação → `salvarCenario(…, forcar=false)`; com violação
  → diálogo "Salvar mesmo assim?" listando-as → `forcar=true`. Cenário
  oficial → confirmação extra "isto muda o horário oficial".
- Conflito de versão: mensagem da Action, rascunho preservado, botão
  "recarregar e reaplicar minhas trocas" (reaplica `feitas` sobre a grade
  nova; troca que não cabe mais é descartada com aviso).
- Sair com rascunho alterado → `beforeunload`.
- [ ] **Passo 1 —** implementar sobre as funções já testadas (Tasks 3–6);
  lógica nova de estado vai para funções puras com teste.
- [ ] **Passo 2 —** `npm run teste && npm run lint && npm run build`;
  smoke manual em `npm run dev` contra o staging (com `VALIDADOR_URL`
  apontando para o validador do Fly e o mesmo token).
- [ ] **Passo 3 — commit:** `feat(app): edição manual da grade com veredito
  do motor`.

---

### Task 10: Backlog — policies com `(select tenho_papel(...))`

> **Executado diferente (18/10):** `(select tenho_papel(unidade_id, ...))`
> não vira initplan, porque recebe a coluna da linha e a subconsulta
> continua correlacionada. A migration cria `unidades_com_papel(variadic
> papel[])` (sem argumento de linha, como `minhas_unidades()`) e as policies
> usam `unidade_id in (select unidades_com_papel(...))`. O `EXPLAIN` mostra
> `hashed SubPlan` (uma avaliação por consulta). pgTAP `0010_policies`.

**Arquivo:** `supabase/migrations/<ts>_policies_select.sql`.

O Postgres avalia `tenho_papel(...)` por linha; envolvido em `(select …)`
vira *initplan* avaliado uma vez por consulta. Recriar (`drop policy` +
`create policy` com o mesmo nome e semântica) todas as policies que chamam
`tenho_papel` direto — lista em
`select tablename, policyname from pg_policies where qual ~ 'tenho_papel'
or with_check ~ 'tenho_papel'` no staging.

- [ ] **Passo 1 —** rodar a suíte pgTAP inteira antes (base verde).
- [ ] **Passo 2 —** migration; aplicar no staging; suíte inteira de novo,
  sem mudar nenhum teste (é refatoração).
- [ ] **Passo 3 — commit:** `perf(supabase): policies avaliam tenho_papel
  uma vez por consulta`.

---

### Task 11: Backlog — RPCs transacionais de `salvarGrade` e `salvarDisponibilidades`

**Arquivos:** `supabase/migrations/<ts>_rpcs_cadastros.sql`,
`supabase/tests/0010_rpcs_cadastros.test.sql`,
`turnos/actions.ts`, `professores/[id]/disponibilidade/actions.ts`.

Hoje as duas Actions fazem `delete` e depois `insert` em chamadas
separadas: se o insert falhar, a grade/disponibilidade fica apagada.

```sql
create function salvar_grade_turno(p_turno uuid, p_dias int[], p_horarios jsonb)
  returns void   -- security invoker: RLS de escrita continua valendo
create function salvar_disponibilidades(p_professor uuid, p_marcacoes jsonb)
  returns void   -- idem
```

- [ ] **Passo 1 — testes que falham:** gestor regrava em uma transação;
  marcação inválida faz rollback e mantém as antigas; professor e outra
  unidade bloqueados.
- [ ] **Passo 2 —** migration (staging) + Actions passam a chamar `rpc`.
- [ ] **Passo 3 —** pgTAP + `npm run teste && npm run lint && npm run build`.
- [ ] **Passo 4 — commit:** `fix(supabase): grade de turno e
  disponibilidades gravadas numa transação`.

---

### Task 12: Backlog — `ORDENS` derivado, bounds do `esquemaGrade`, erros de select

- `regras/formulario.tsx`: `ORDENS` deixa de ser `[0..7]` fixo e vem da
  maior `ordem` dos slots da unidade (prop vinda da página).
- `lib/validacao/cadastros.ts` (`esquemaGrade`): limites de dias (0–6, sem
  repetição) e de horários (1–12, `hora_inicio < hora_fim`, sem
  sobreposição) com mensagens em português.
- Telas tocadas nesta subfase (turnos, regras, disponibilidade, grade,
  gerações) exibem erro de select em vez de lista vazia silenciosa.
- [ ] **Passo 1 —** testes que falham em `validacao-cadastros.test.ts` para
  os bounds.
- [ ] **Passo 2 —** implementar; `npm run teste && npm run lint && npm run build`.
- [ ] **Passo 3 — commit:** `fix(app): limites da grade de turno, ORDENS da
  unidade e erros de leitura visíveis`.

---

### Task 13: E2E — Playwright contra o staging

**Arquivos:** `app/playwright.config.ts`, `app/e2e/edicao.spec.ts`,
`app/e2e/semente.ts`, `.github/workflows/ci.yml` (job `e2e`).

- `semente.ts` (via `service_role` do staging): cria unidade descartável,
  usuária gestora com senha, cadastros mínimos (1 turma, 2 slots, 2
  disciplinas, disponibilidade que torna uma troca inválida), uma geração
  `concluida` com snapshot e um cenário com aulas — sem depender do worker.
  Limpa tudo no `afterAll` (delete da unidade em cascata + usuária).
- Cenário do teste: login → abrir cenário → Editar → trocar duas aulas →
  ver violação traduzida → desfazer → trocar válido → Salvar → recarregar e
  ver a troca e `versao` 2 → Duplicar → Marcar como oficial → selo.
- Validador no CI: o job sobe `python -m pytime_worker.validador` local
  (porta 8080, token de teste) e o app com `VALIDADOR_URL=http://localhost:8080`.
- Secrets novos do CI (só staging): `SUPABASE_URL_STAGING`,
  `SUPABASE_ANON_KEY_STAGING`, `SUPABASE_SERVICE_ROLE_KEY_STAGING`. Job
  pulado se faltarem; `concurrency: banco-staging` como o do worker.
- Chromium já instalado no runner via `npx playwright install --with-deps
  chromium` (no CI; localmente `PLAYWRIGHT_BROWSERS_PATH` se existir).
- [ ] **Passo 1 —** escrever o spec (falha sem a UI).
- [ ] **Passo 2 —** rodar local contra o staging até verde; depois no CI.
- [ ] **Passo 3 — commit:** `test(app): E2E da edição manual contra o staging`.

---

### Task 14: Deploy e validação final da 3A

- [ ] Migrations da 3A no **staging** (já) e em **produção**
  (`npx supabase db push`) — antes do deploy do app.
- [ ] Vercel: `vercel env add VALIDADOR_URL production`
  (`https://pytime-worker.fly.dev`) e `vercel env add VALIDADOR_TOKEN
  production` (o token guardado); `vercel deploy --prod`.
- [ ] Fly: `fly deploy --remote-only` (worker com avaliação pós-geração).
- [ ] Smoke em produção com uma escola real: gerar → abrir cenário → custo
  "avaliado" → editar/salvar → duplicar → marcar oficial → exportar para o
  escolajba (o arquivo traz `origem.oficial = true` e a troca feita).
- [ ] Medir o p95 de `avaliarRascunho` em produção (20 trocas seguidas,
  tempo da Action) e registrar na spec master §6 ("Meta de latência").
- [ ] `docs/deploy.md` (envs novas da Vercel), `CLAUDE.md` (Fase 3A
  concluída; envs), spec da Fase 3 (status da 3A).
- [ ] Revisão: `revisor-engine` não se aplica (motor intocado); revisão de
  segurança das Actions/RPCs (papel em todas, `service_role` só onde
  previsto, token nunca no cliente — `grep -r VALIDADOR_TOKEN app/src` só
  em arquivos `server-only`).
- [ ] PR da 3A com CI verde (motor, app, worker com banco, pgTAP, E2E).
