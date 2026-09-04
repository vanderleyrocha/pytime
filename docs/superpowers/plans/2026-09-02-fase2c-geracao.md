# Fase 2C — Geração, Worker e Deploy — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Geração de horários ponta a ponta: o coordenador clica "Gerar", o app monta a `Instancia` e enfileira, o worker Python (Fly.io) reivindica o job com `FOR UPDATE SKIP LOCKED`, roda o motor CP-SAT com progresso ao vivo via Realtime, grava cenário + grade, e o app exibe a grade por turma/professor/turno — com deploy completo (Vercel + Fly.io) encerrando a Fase 2.

**Architecture:** A fila é a própria tabela `geracoes` (RPCs SQL de claim e resgate de órfãs, testadas com pgTAP). O app monta o JSON da `Instancia` em TypeScript (função pura testável) e pré-valida com `calcularPendencias` antes de enfileirar. O worker (`worker/`, pacote Python separado) conecta direto ao Postgres com credencial privilegiada (bypassa RLS), roda `pytime_engine.resolver()` com callback de progresso e heartbeat em thread própria, e grava `resultado`/`cenarios`/`aulas_alocadas` numa transação. Única mudança no motor: teto do budget 240 s → 600 s.

**Tech Stack:** Python 3.12 (`psycopg[binary]`, `pytime-engine`), Next.js 16 + Supabase Realtime, pgTAP, Docker + Fly.io, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-31-fase2-app-design.md` (§1 execução/fila, §2 fluxo e garantias do job, §5 rotas /geracoes e /grade + ajuste do motor, §6 testes, §7 deploy). Contexto: `docs/superpowers/specs/2026-08-30-pytime-design.md`.

**Backlog herdado incluído:** correção do spec "9 tipos" → 10 (Task 1). **Fora de escopo (backlog Fase 3):** RPCs transacionais para `salvarGrade`/`salvarDisponibilidades`; `(select tenho_papel(...))` nas policies; exibir erros de selects hoje descartados; `ORDENS` derivado da grade; agrupar matriz por id de turno; bounds no `esquemaGrade`; parâmetros de regra órfãos após excluir disciplina; confirmação no excluir; **núcleo de conflito legível** (a página de gerações mostra `disponibilidade:<uuid>`; traduzir identificador para nome do professor/turma/disciplina).

## Global Constraints

- Identificadores, mensagens, rotas, docstrings e commits **em português**.
- `engine/` muda em EXATAMENTE 1 linha de produção: `budget_segundos` `le=240` → `le=600` (+ teste). Nada mais — regras arquiteturais do CLAUDE.md valem integralmente (sem import de infra no engine; **`worker/` é pacote separado** e pode importar `pytime_engine` + `psycopg`).
- Status de `geracoes`: `pendente → executando → concluida | inviavel | erro`. Mapeamento do motor: `otimo|viavel → concluida` (cria cenário + aulas), `inviavel → inviavel` (grava `nucleo_conflito`), `sem_solucao_no_budget → erro` com `detalhe_erro` sugerindo aumentar o budget.
- Garantias do job (spec §2): claim via RPC com `FOR UPDATE SKIP LOCKED` (nunca duplica); heartbeat ~15 s em thread própria; `executando` com heartbeat parado > 2 min volta a `pendente`; na tentativa ≥ 3 vira `erro`.
- Worker conecta via `SUPABASE_DB_URL` (env; local = pooler session `aws-0-sa-east-1.pooler...`; no Fly.io o host direto `db.<ref>.supabase.co` funciona por IPv6). Nunca comitar credenciais.
- Budget: UI default 60 s, máximo 600 s (o CHECK do banco já é ≤ 600).
- App: mutações revalidam papel gestor; leituras escopadas por `unidade_id`; embeds com hint de FK quando a tabela tiver FK composta de tenant (`!<constraint>_fkey`, padrão do hotfix `32e79aa`).
- pgTAP via `python supabase/tests/rodar_testes.py` (env `SUPABASE_DB_URL`); pytest do worker exige `SUPABASE_DB_URL` (mesmo banco remoto de dev) e limpa o que criar. **Atenção:** os testes do worker reivindicam a geração `pendente` mais antiga do banco — rodá-los pressupõe o banco de dev sem gerações reais na fila (aceito para o projeto dedicado de dev; verificar antes de rodar).
- Validação padrão: app `npm run teste && npm run lint && npm run build`; engine `pytest && ruff check . && ruff format --check . && mypy src`; worker `pytest && ruff check . && ruff format --check .`.
- **Execução sequencial** (tasks compartilham sidebar/painel e a cadeia worker é dependente).
- Trabalho em branch dedicada a partir de `master`; commits pequenos `feat(engine|supabase|worker|app): ...`.

## Estrutura de arquivos

```
engine/src/pytime_engine/instancia.py     # 1 linha (budget le=600)
supabase/migrations/<ts>_fila_worker.sql  # RPCs reivindicar/resgatar + grants
supabase/tests/0007_fila.test.sql
worker/
  pyproject.toml                          # deps: pytime-engine (path), psycopg
  src/pytime_worker/__init__.py
  src/pytime_worker/configuracao.py       # envs (SUPABASE_DB_URL, intervalos)
  src/pytime_worker/fila.py               # claim, heartbeat, progresso, gravação
  src/pytime_worker/executor.py           # processar 1 geração (resolver + transação)
  src/pytime_worker/principal.py          # loop: resgatar órfãs → claim → processar
  tests/conftest.py, test_fila.py, test_executor.py
  Dockerfile                              # contexto = raiz do repo (inclui engine/)
  fly.toml
app/src/lib/instancia.ts                  # montarInstancia (pura) + buscarDadosUnidade
app/src/app/(interno)/geracoes/page.tsx + actions.ts + progresso.tsx
app/src/app/(interno)/grade/[cenarioId]/page.tsx
app/tests/instancia.test.ts
docs/deploy.md
```

---

### Task 1: Motor — teto do budget 600 s (+ correções de docs)

**Files:**
- Modify: `engine/src/pytime_engine/instancia.py` (1 linha), `engine/tests/test_instancia.py`, `CLAUDE.md` (linha do budget), `docs/superpowers/specs/2026-08-31-fase2-app-design.md` (nota "9 regras" → 10)
- Test: `engine/tests/test_instancia.py`

**Interfaces:**
- Consumes: contrato existente `Instancia.budget_segundos` (default 60, `le=240`).
- Produces: `budget_segundos` aceita até 600.0 (default inalterado). Worker e app dependem disso.

- [ ] **Step 1: Ajustar o teste e ver falhar**

Em `engine/tests/test_instancia.py`, substituir o teste `test_budget_maximo_240` por:

```python
def test_budget_maximo_600():
    inst = instancia_2slots()
    aceita = Instancia(**{**inst.model_dump(), "budget_segundos": 600})
    assert aceita.budget_segundos == 600
    with pytest.raises(ValidationError):
        Instancia(**{**inst.model_dump(), "budget_segundos": 601})
```

Run: `cd engine && pytest tests/test_instancia.py -v`
Expected: FAIL — 600 é rejeitado pelo `le=240` atual.

- [ ] **Step 2: Mudar a única linha e ver passar**

Em `engine/src/pytime_engine/instancia.py`, no campo `budget_segundos`:
`le=240` → `le=600`. Atualizar o comentário/docstring se citar 240.

Run: `pytest && ruff check . && ruff format --check . && mypy src` → tudo verde (47 testes).

- [ ] **Step 3: Docs**

- `CLAUDE.md`: na regra 5, trocar "teto atual 240 s; sobe para 600 s na Fase 2" por "teto 600 s (Fase 2)".
- `docs/superpowers/specs/2026-08-31-fase2-app-design.md`: onde diz "9 tipos do catálogo" / "9 regras", corrigir para 10 (o número vinculante é o do `REGISTRO` do motor).

- [ ] **Step 4: Commit**

```bash
git add engine/src/pytime_engine/instancia.py engine/tests/test_instancia.py CLAUDE.md docs/superpowers/specs/2026-08-31-fase2-app-design.md
git commit -m "feat(engine): teto do budget sobe para 600s (worker dedicado)"
```

---

### Task 2: Migration — RPCs da fila (claim + resgate de órfãs)

**Files:**
- Create: `supabase/migrations/<timestamp>_fila_worker.sql`
- Test: `supabase/tests/0007_fila.test.sql`

**Interfaces:**
- Consumes: tabela `geracoes` (2A) com enum `geracao_status`, `tentativas`, `heartbeat_em`, `atualizada_em`.
- Produces (worker consome — NÃO renomear):
  - `reivindicar_geracao() -> setof geracoes` — pega a `pendente` mais antiga com `FOR UPDATE SKIP LOCKED`, marca `executando`, `tentativas+1`, `heartbeat_em = now()`; 0 linhas se fila vazia.
  - `resgatar_geracoes_orfas(p_limite interval default '2 minutes') -> integer` — `executando` com heartbeat velho: `tentativas >= 3` vira `erro` (com `detalhe_erro`), senão volta a `pendente`; retorna total afetado.
  - Execute revogado de `authenticated`/`anon` (só o worker, com credencial privilegiada, chama).

- [ ] **Step 1: Escrever o teste pgTAP que falha**

`supabase/tests/0007_fila.test.sql`:

```sql
begin;
select plan(7);

insert into unidades (id, nome) values
  ('00000000-0000-0000-0000-00000000001a', 'Escola A');
insert into geracoes (id, unidade_id, instancia, status, criada_em) values
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-00000000001a',
   '{}'::jsonb, 'pendente', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-00000000001a',
   '{}'::jsonb, 'pendente', now() - interval '1 minute');

select results_eq(
  $$select id from reivindicar_geracao()$$,
  array['00000000-0000-0000-0000-000000000901'::uuid],
  'claim pega a pendente mais antiga');
select results_eq(
  $$select status::text, tentativas from geracoes
    where id = '00000000-0000-0000-0000-000000000901'$$,
  $$values ('executando'::text, 1)$$,
  'claim marca executando e incrementa tentativas');
select results_eq(
  $$select id from reivindicar_geracao()$$,
  array['00000000-0000-0000-0000-000000000902'::uuid],
  'segundo claim pega a proxima (nao duplica)');
select is_empty(
  $$select id from reivindicar_geracao()$$,
  'fila vazia devolve 0 linhas');

-- Órfã com heartbeat velho volta para pendente
update geracoes set heartbeat_em = now() - interval '10 minutes'
 where id = '00000000-0000-0000-0000-000000000901';
select results_eq(
  $$select resgatar_geracoes_orfas()$$,
  array[2],
  'resgate afeta as duas executando com heartbeat velho');
select results_eq(
  $$select status::text from geracoes
    where id = '00000000-0000-0000-0000-000000000901'$$,
  array['pendente'::text],
  'orfa com tentativas < 3 volta a pendente');

-- Na 3ª tentativa vira erro
update geracoes
   set status = 'executando', tentativas = 3,
       heartbeat_em = now() - interval '10 minutes'
 where id = '00000000-0000-0000-0000-000000000902';
select resgatar_geracoes_orfas();
select results_eq(
  $$select status::text, detalhe_erro is not null from geracoes
    where id = '00000000-0000-0000-0000-000000000902'$$,
  $$values ('erro'::text, true)$$,
  'orfa na 3a tentativa vira erro com detalhe');

select * from finish();
rollback;
```

Nota: o segundo `resgatar_geracoes_orfas()` (antes do último `results_eq`) roda fora de assert — o resultado verificado é o estado da linha. O `plan(7)` conta só os 7 asserts.

- [ ] **Step 2: Rodar e ver falhar**

Runner: `python supabase/tests/rodar_testes.py supabase/tests/0007_fila.test.sql`
Expected: FAIL — `function reivindicar_geracao() does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/<timestamp>_fila_worker.sql` (timestamp real, após a de pgtap):

```sql
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
```

- [ ] **Step 4: Aplicar e ver passar**

```bash
npx supabase db push
python supabase/tests/rodar_testes.py
```

Expected: 0001–0006 intactos + 0007 7/7 (total 44).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_fila_worker.sql supabase/tests/0007_fila.test.sql
git commit -m "feat(supabase): RPCs da fila de geracoes com claim atomico e resgate de orfas"
```

---

### Task 3: Worker — scaffold, configuração e acesso à fila

**Files:**
- Create: `worker/pyproject.toml`, `worker/src/pytime_worker/__init__.py`, `worker/src/pytime_worker/configuracao.py`, `worker/src/pytime_worker/fila.py`, `worker/tests/conftest.py`
- Test: `worker/tests/test_fila.py`

**Interfaces:**
- Consumes: RPCs da Task 2; schema `geracoes`/`cenarios`/`aulas_alocadas` (2A).
- Produces (Tasks 4–5 consomem — assinaturas exatas):
  - `configuracao.carregar() -> Configuracao` (`db_url`, `intervalo_fila=5.0`, `intervalo_heartbeat=15.0`, `intervalo_orfas=60.0`).
  - `fila.conectar(db_url) -> psycopg.Connection` (autocommit, `dict_row`).
  - `fila.reivindicar(conn) -> dict | None`; `fila.resgatar_orfas(conn) -> int`; `fila.bater_coracao(conn, geracao_id)`; `fila.gravar_progresso(conn, geracao_id, custo: int, tempo: float)`; `fila.gravar_resultado_concluido(conn, geracao_id, unidade_id, resultado: dict, grade: list[tuple[str, str]]) -> str` (cria cenário + aulas numa transação, devolve `cenario_id`); `fila.gravar_inviavel(conn, geracao_id, resultado: dict, nucleo: list[str])`; `fila.gravar_erro(conn, geracao_id, detalhe: str)`.

- [ ] **Step 1: Scaffold**

`worker/pyproject.toml`:

```toml
[project]
name = "pytime-worker"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["pytime-engine", "psycopg[binary]>=3.1"]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff>=0.6"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 88
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "UP", "B"]
```

Instalar: `cd worker && pip install -e ../engine -e ".[dev]"`
`worker/src/pytime_worker/__init__.py` vazio.

- [ ] **Step 2: Configuração**

`worker/src/pytime_worker/configuracao.py`:

```python
"""Configuração do worker via variáveis de ambiente."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Configuracao:
    db_url: str
    intervalo_fila: float = 5.0
    intervalo_heartbeat: float = 15.0
    intervalo_orfas: float = 60.0


def carregar() -> Configuracao:
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise RuntimeError("Defina SUPABASE_DB_URL para o worker.")
    return Configuracao(db_url=url)
```

- [ ] **Step 3: Fixtures de teste (banco remoto de dev)**

`worker/tests/conftest.py`:

```python
"""Fixtures do worker: conexão e unidade descartável no banco remoto."""

import os
import uuid

import psycopg
import pytest
from psycopg.rows import dict_row


@pytest.fixture(scope="session")
def db_url() -> str:
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        pytest.skip("SUPABASE_DB_URL não definida (testes usam o banco de dev)")
    return url


@pytest.fixture()
def conexao(db_url):
    with psycopg.connect(db_url, autocommit=True, row_factory=dict_row) as conn:
        yield conn


@pytest.fixture()
def unidade_teste(conexao):
    """Unidade descartável; o delete em cascata limpa tudo que os testes criarem."""
    unidade_id = str(uuid.uuid4())
    with conexao.cursor() as cur:
        cur.execute(
            "insert into unidades (id, nome) values (%s, %s)",
            (unidade_id, f"Teste Worker {unidade_id[:8]}"),
        )
    yield unidade_id
    with conexao.cursor() as cur:
        cur.execute("delete from unidades where id = %s", (unidade_id,))
```

- [ ] **Step 4: Escrever o teste que falha**

`worker/tests/test_fila.py`:

```python
"""Fila: claim sem duplicação, progresso, heartbeat e gravação de resultado."""

import json
import uuid

from pytime_worker import fila


def _enfileirar(conexao, unidade_id: str) -> str:
    geracao_id = str(uuid.uuid4())
    with conexao.cursor() as cur:
        cur.execute(
            "insert into geracoes (id, unidade_id, instancia) values (%s, %s, %s)",
            (geracao_id, unidade_id, json.dumps({})),
        )
    return geracao_id


def test_reivindicar_marca_executando_e_nao_duplica(conexao, unidade_teste):
    geracao_id = _enfileirar(conexao, unidade_teste)
    job = fila.reivindicar(conexao)
    assert job is not None and str(job["id"]) == geracao_id
    assert job["status"] == "executando"
    assert job["tentativas"] == 1
    assert fila.reivindicar(conexao) is None  # fila vazia agora


def test_progresso_e_heartbeat(conexao, unidade_teste):
    geracao_id = _enfileirar(conexao, unidade_teste)
    job = fila.reivindicar(conexao)
    fila.gravar_progresso(conexao, job["id"], custo=42, tempo=3.14)
    fila.bater_coracao(conexao, job["id"])
    with conexao.cursor() as cur:
        cur.execute(
            "select progresso, heartbeat_em from geracoes where id = %s",
            (geracao_id,),
        )
        linha = cur.fetchone()
    assert linha["progresso"]["custo"] == 42
    assert linha["heartbeat_em"] is not None


def test_gravar_resultado_concluido_cria_cenario_e_aulas(conexao, unidade_teste):
    # esqueleto mínimo que satisfaz as FKs compostas de tenant
    ids = {chave: str(uuid.uuid4()) for chave in
           ("turno", "slot", "turma", "disciplina", "professor", "atribuicao")}
    with conexao.cursor() as cur:
        cur.execute("insert into turnos (id, unidade_id, nome) values (%s, %s, 'T')",
                    (ids["turno"], unidade_teste))
        cur.execute(
            "insert into slots (id, unidade_id, turno_id, dia, ordem)"
            " values (%s, %s, %s, 0, 0)",
            (ids["slot"], unidade_teste, ids["turno"]))
        cur.execute(
            "insert into turmas (id, unidade_id, turno_id, nome)"
            " values (%s, %s, %s, '1A')",
            (ids["turma"], unidade_teste, ids["turno"]))
        cur.execute("insert into disciplinas (id, unidade_id, nome) values (%s, %s, 'M')",
                    (ids["disciplina"], unidade_teste))
        cur.execute("insert into professores (id, unidade_id, nome) values (%s, %s, 'P')",
                    (ids["professor"], unidade_teste))
        cur.execute(
            "insert into atribuicoes (id, unidade_id, professor_id, disciplina_id,"
            " turma_id, carga_semanal) values (%s, %s, %s, %s, %s, 1)",
            (ids["atribuicao"], unidade_teste, ids["professor"],
             ids["disciplina"], ids["turma"]))
    geracao_id = _enfileirar(conexao, unidade_teste)
    job = fila.reivindicar(conexao)

    cenario_id = fila.gravar_resultado_concluido(
        conexao, job["id"], unidade_teste,
        resultado={"status": "otimo", "custo_total": 0},
        grade=[(ids["atribuicao"], ids["slot"])],
    )
    with conexao.cursor() as cur:
        cur.execute("select status, resultado from geracoes where id = %s",
                    (geracao_id,))
        ger = cur.fetchone()
        cur.execute("select count(*)::int as n from aulas_alocadas where cenario_id = %s",
                    (cenario_id,))
        aulas = cur.fetchone()
    assert ger["status"] == "concluida"
    assert ger["resultado"]["status"] == "otimo"
    assert aulas["n"] == 1
```

Run: `cd worker && pytest -v` (PowerShell: defina `$env:SUPABASE_DB_URL` antes)
Expected: FAIL — `ModuleNotFoundError: No module named 'pytime_worker.fila'` (ou import error).

- [ ] **Step 5: Implementar `fila.py` e ver passar**

`worker/src/pytime_worker/fila.py`:

```python
"""Acesso à fila de gerações (tabela geracoes) com SQL direto.

O worker usa credencial privilegiada: RLS não se aplica; toda escrita é
explícita e pontual.
"""

import json
from typing import Any

import psycopg
from psycopg.rows import dict_row


def conectar(db_url: str) -> psycopg.Connection:
    return psycopg.connect(db_url, autocommit=True, row_factory=dict_row)


def reivindicar(conn: psycopg.Connection) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute("select * from reivindicar_geracao()")
        return cur.fetchone()


def resgatar_orfas(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute("select resgatar_geracoes_orfas() as n")
        return cur.fetchone()["n"]


def bater_coracao(conn: psycopg.Connection, geracao_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "update geracoes set heartbeat_em = now(), atualizada_em = now()"
            " where id = %s and status = 'executando'",
            (geracao_id,),
        )


def gravar_progresso(
    conn: psycopg.Connection, geracao_id: str, custo: int, tempo: float
) -> None:
    progresso = json.dumps({"custo": custo, "tempo_segundos": round(tempo, 1)})
    with conn.cursor() as cur:
        cur.execute(
            "update geracoes set progresso = %s::jsonb, heartbeat_em = now(),"
            " atualizada_em = now() where id = %s and status = 'executando'",
            (progresso, geracao_id),
        )


def gravar_resultado_concluido(
    conn: psycopg.Connection,
    geracao_id: str,
    unidade_id: str,
    resultado: dict[str, Any],
    grade: list[tuple[str, str]],
) -> str:
    """Grava geração concluída + cenário + aulas numa única transação."""
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                "update geracoes set status = 'concluida', resultado = %s::jsonb,"
                " atualizada_em = now() where id = %s",
                (json.dumps(resultado), geracao_id),
            )
            cur.execute(
                "insert into cenarios (unidade_id, geracao_id)"
                " values (%s, %s) returning id",
                (unidade_id, geracao_id),
            )
            cenario_id = cur.fetchone()["id"]
            cur.executemany(
                "insert into aulas_alocadas"
                " (unidade_id, cenario_id, atribuicao_id, slot_id)"
                " values (%s, %s, %s, %s)",
                [
                    (unidade_id, cenario_id, atribuicao_id, slot_id)
                    for (atribuicao_id, slot_id) in grade
                ],
            )
    return str(cenario_id)


def gravar_inviavel(
    conn: psycopg.Connection,
    geracao_id: str,
    resultado: dict[str, Any],
    nucleo: list[str],
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "update geracoes set status = 'inviavel', resultado = %s::jsonb,"
            " nucleo_conflito = %s, atualizada_em = now() where id = %s",
            (json.dumps(resultado), nucleo, geracao_id),
        )


def gravar_erro(conn: psycopg.Connection, geracao_id: str, detalhe: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "update geracoes set status = 'erro', detalhe_erro = %s,"
            " atualizada_em = now() where id = %s",
            (detalhe, geracao_id),
        )
```

Run: `pytest -v` → 3 PASS. `ruff check . && ruff format --check .` limpos.

- [ ] **Step 6: Commit**

```bash
git add worker/pyproject.toml worker/src worker/tests
git commit -m "feat(worker): scaffold, configuracao e acesso a fila de geracoes"
```

---

### Task 4: Worker — executor (resolver + heartbeat + gravação do desfecho)

**Files:**
- Create: `worker/src/pytime_worker/executor.py`
- Test: `worker/tests/test_executor.py`

**Interfaces:**
- Consumes: `fila.*` (T3), `pytime_engine.Instancia/resolver`.
- Produces (T5 consome): `executor.processar(conn, conexao_heartbeat, job: dict, intervalo_heartbeat: float = 15.0) -> None` — heartbeat em thread própria (conexão separada: psycopg não é thread-safe para uso concorrente), progresso throttled (≥ 2 s entre gravações), mapeamento de status: `otimo|viavel → concluida` (+cenário/aulas), `inviavel → inviavel` (+núcleo), `sem_solucao_no_budget → erro` (sugere aumentar budget), exceção do motor → `erro`.

- [ ] **Step 1: Escrever o teste que falha**

`worker/tests/test_executor.py`:

```python
"""Executor: fluxo completo com o motor real numa instância mínima."""

import json
import uuid

from pytime_worker import executor, fila


def _instancia_minima(ids: dict[str, str]) -> dict:
    """2 slots, 1 atribuição de carga 2 — resolve em < 1 s."""
    return {
        "turnos": [{"id": ids["turno"], "nome": "Manhã"}],
        "slots": [
            {"id": ids["slot0"], "dia": 0, "ordem": 0, "turno_id": ids["turno"]},
            {"id": ids["slot1"], "dia": 0, "ordem": 1, "turno_id": ids["turno"]},
        ],
        "turmas": [{"id": ids["turma"], "nome": "1A", "turno_id": ids["turno"]}],
        "disciplinas": [{"id": ids["disciplina"], "nome": "Mat"}],
        "professores": [{"id": ids["professor"], "nome": "P"}],
        "atribuicoes": [{
            "id": ids["atribuicao"],
            "professor_id": ids["professor"],
            "disciplina_id": ids["disciplina"],
            "turma_id": ids["turma"],
            "carga_semanal": 2,
        }],
        "budget_segundos": 30,
    }


def _montar_esqueleto(conexao, unidade_id: str) -> dict[str, str]:
    ids = {chave: str(uuid.uuid4()) for chave in
           ("turno", "slot0", "slot1", "turma", "disciplina",
            "professor", "atribuicao")}
    with conexao.cursor() as cur:
        cur.execute("insert into turnos (id, unidade_id, nome) values (%s, %s, 'T')",
                    (ids["turno"], unidade_id))
        for chave, ordem in (("slot0", 0), ("slot1", 1)):
            cur.execute(
                "insert into slots (id, unidade_id, turno_id, dia, ordem)"
                " values (%s, %s, %s, 0, %s)",
                (ids[chave], unidade_id, ids["turno"], ordem))
        cur.execute(
            "insert into turmas (id, unidade_id, turno_id, nome)"
            " values (%s, %s, %s, '1A')",
            (ids["turma"], unidade_id, ids["turno"]))
        cur.execute("insert into disciplinas (id, unidade_id, nome) values (%s, %s, 'M')",
                    (ids["disciplina"], unidade_id))
        cur.execute("insert into professores (id, unidade_id, nome) values (%s, %s, 'P')",
                    (ids["professor"], unidade_id))
        cur.execute(
            "insert into atribuicoes (id, unidade_id, professor_id, disciplina_id,"
            " turma_id, carga_semanal) values (%s, %s, %s, %s, %s, 2)",
            (ids["atribuicao"], unidade_id, ids["professor"],
             ids["disciplina"], ids["turma"]))
    return ids


def _enfileirar(conexao, unidade_id: str, instancia: dict) -> str:
    geracao_id = str(uuid.uuid4())
    with conexao.cursor() as cur:
        cur.execute(
            "insert into geracoes (id, unidade_id, instancia) values (%s, %s, %s)",
            (geracao_id, unidade_id, json.dumps(instancia)),
        )
    return geracao_id


def test_processar_conclui_e_cria_grade(conexao, db_url, unidade_teste):
    ids = _montar_esqueleto(conexao, unidade_teste)
    geracao_id = _enfileirar(conexao, unidade_teste, _instancia_minima(ids))
    job = fila.reivindicar(conexao)
    with fila.conectar(db_url) as conexao_hb:
        executor.processar(conexao, conexao_hb, job, intervalo_heartbeat=1.0)
    with conexao.cursor() as cur:
        cur.execute("select status, resultado from geracoes where id = %s",
                    (geracao_id,))
        ger = cur.fetchone()
        cur.execute(
            "select count(*)::int as n from aulas_alocadas a"
            " join cenarios c on c.id = a.cenario_id where c.geracao_id = %s",
            (geracao_id,))
        aulas = cur.fetchone()
    assert ger["status"] == "concluida"
    assert ger["resultado"]["status"] in ("otimo", "viavel")
    assert aulas["n"] == 2


def test_processar_inviavel_grava_nucleo(conexao, db_url, unidade_teste):
    ids = _montar_esqueleto(conexao, unidade_teste)
    instancia = _instancia_minima(ids)
    instancia["atribuicoes"][0]["carga_semanal"] = 1  # matriz furada: 1 aula, 2 slots
    geracao_id = _enfileirar(conexao, unidade_teste, instancia)
    job = fila.reivindicar(conexao)
    with fila.conectar(db_url) as conexao_hb:
        executor.processar(conexao, conexao_hb, job, intervalo_heartbeat=1.0)
    with conexao.cursor() as cur:
        cur.execute(
            "select status, nucleo_conflito from geracoes where id = %s",
            (geracao_id,))
        ger = cur.fetchone()
    assert ger["status"] == "inviavel"
    assert len(ger["nucleo_conflito"]) >= 1


def test_processar_instancia_invalida_vira_erro(conexao, db_url, unidade_teste):
    geracao_id = _enfileirar(conexao, unidade_teste, {"nada": True})
    job = fila.reivindicar(conexao)
    with fila.conectar(db_url) as conexao_hb:
        executor.processar(conexao, conexao_hb, job, intervalo_heartbeat=1.0)
    with conexao.cursor() as cur:
        cur.execute("select status, detalhe_erro from geracoes where id = %s",
                    (geracao_id,))
        ger = cur.fetchone()
    assert ger["status"] == "erro"
    assert "Instância inválida" in ger["detalhe_erro"]
```

Run: `pytest tests/test_executor.py -v` → Expected: FAIL (`No module named 'pytime_worker.executor'`).

- [ ] **Step 2: Implementar `executor.py` e ver passar**

`worker/src/pytime_worker/executor.py`:

```python
"""Processa uma geração: roda o motor e grava o desfecho na fila."""

import threading
from typing import Any

import psycopg
from pytime_engine import Instancia, resolver

from . import fila

INTERVALO_PROGRESSO = 2.0  # segundos mínimos entre gravações de progresso


def processar(
    conn: psycopg.Connection,
    conexao_heartbeat: psycopg.Connection,
    job: dict[str, Any],
    intervalo_heartbeat: float = 15.0,
) -> None:
    geracao_id = str(job["id"])
    unidade_id = str(job["unidade_id"])

    try:
        instancia = Instancia.model_validate(job["instancia"])
    except Exception as excecao:  # noqa: BLE001 - contrato inválido vira erro do job
        fila.gravar_erro(conn, geracao_id, f"Instância inválida: {excecao}")
        return

    # Heartbeat em thread própria com conexão separada: o CP-SAT bloqueia a
    # thread principal por até budget_segundos, e conexões psycopg não são
    # thread-safe para uso concorrente.
    parar = threading.Event()

    def _bater() -> None:
        while not parar.wait(intervalo_heartbeat):
            try:
                fila.bater_coracao(conexao_heartbeat, geracao_id)
            except Exception:  # noqa: BLE001 - heartbeat é best-effort
                pass

    batedor = threading.Thread(target=_bater, daemon=True)
    batedor.start()

    ultimo_progresso = 0.0

    def ao_progredir(custo: int, tempo: float) -> None:
        nonlocal ultimo_progresso
        if tempo - ultimo_progresso < INTERVALO_PROGRESSO:
            return
        ultimo_progresso = tempo
        try:
            fila.gravar_progresso(conn, geracao_id, custo, tempo)
        except Exception:  # noqa: BLE001 - progresso é best-effort
            pass

    try:
        resultado = resolver(instancia, on_progress=ao_progredir)
    except Exception as excecao:  # noqa: BLE001 - falha do motor vira erro do job
        parar.set()
        batedor.join(timeout=2)
        fila.gravar_erro(conn, geracao_id, f"Falha do motor: {excecao}")
        return
    parar.set()
    batedor.join(timeout=2)

    dados = resultado.model_dump()
    if resultado.status in ("otimo", "viavel"):
        grade = [(a.atribuicao_id, a.slot_id) for a in resultado.grade]
        fila.gravar_resultado_concluido(conn, geracao_id, unidade_id, dados, grade)
    elif resultado.status == "inviavel":
        fila.gravar_inviavel(conn, geracao_id, dados, resultado.nucleo_conflito)
    else:  # sem_solucao_no_budget
        fila.gravar_erro(
            conn,
            geracao_id,
            "Sem solução dentro do tempo — tente aumentar o budget (máx. 600 s).",
        )
```

Run: `pytest -v` (6 testes) e `ruff check . && ruff format --check .` → verdes.

- [ ] **Step 3: Commit**

```bash
git add worker/src/pytime_worker/executor.py worker/tests/test_executor.py
git commit -m "feat(worker): executor com motor, heartbeat e gravacao do desfecho"
```

---

### Task 5: Worker — loop principal

**Files:**
- Create: `worker/src/pytime_worker/principal.py`
- Test: `worker/tests/test_principal.py`

**Interfaces:**
- Consumes: `configuracao.carregar`, `fila.*`, `executor.processar`.
- Produces: `principal.rodar(uma_iteracao: bool = False)` e entrypoint `python -m pytime_worker.principal` (Dockerfile da T10 usa).

- [ ] **Step 1: Escrever o teste que falha**

`worker/tests/test_principal.py`:

```python
"""Loop principal: uma iteração processa um job real de ponta a ponta."""

import json
import uuid

from pytime_worker import principal


def test_uma_iteracao_processa_job(conexao, unidade_teste, monkeypatch, db_url):
    monkeypatch.setenv("SUPABASE_DB_URL", db_url)
    geracao_id = str(uuid.uuid4())
    with conexao.cursor() as cur:
        cur.execute(
            "insert into geracoes (id, unidade_id, instancia) values (%s, %s, %s)",
            (geracao_id, unidade_teste, json.dumps({"nada": True})),
        )
    principal.rodar(uma_iteracao=True)
    with conexao.cursor() as cur:
        cur.execute("select status from geracoes where id = %s", (geracao_id,))
        assert cur.fetchone()["status"] == "erro"  # instância inválida


def test_uma_iteracao_com_fila_vazia_nao_quebra(monkeypatch, db_url, conexao):
    principal_ok = True
    monkeypatch.setenv("SUPABASE_DB_URL", db_url)
    principal.rodar(uma_iteracao=True)
    assert principal_ok
```

Run: `pytest tests/test_principal.py -v` → FAIL (`No module named 'pytime_worker.principal'`).

- [ ] **Step 2: Implementar e ver passar**

`worker/src/pytime_worker/principal.py`:

```python
"""Loop principal do worker: resgata órfãs, reivindica e processa."""

import time

from . import executor, fila
from .configuracao import carregar


def rodar(uma_iteracao: bool = False) -> None:
    config = carregar()
    conn = fila.conectar(config.db_url)
    conexao_heartbeat = fila.conectar(config.db_url)
    ultimo_resgate = 0.0
    print("Worker PyTime iniciado.", flush=True)

    while True:
        agora = time.monotonic()
        if agora - ultimo_resgate >= config.intervalo_orfas or uma_iteracao:
            try:
                resgatadas = fila.resgatar_orfas(conn)
                if resgatadas:
                    print(f"{resgatadas} geração(ões) órfã(s) resgatada(s).",
                          flush=True)
            except Exception as excecao:  # noqa: BLE001
                print(f"Falha no resgate de órfãs: {excecao}", flush=True)
            ultimo_resgate = agora

        job = None
        try:
            job = fila.reivindicar(conn)
        except Exception as excecao:  # noqa: BLE001
            print(f"Falha ao reivindicar geração: {excecao}", flush=True)

        if job is not None:
            print(f"Processando geração {job['id']}...", flush=True)
            executor.processar(
                conn, conexao_heartbeat, job,
                intervalo_heartbeat=config.intervalo_heartbeat,
            )
            print(f"Geração {job['id']} finalizada.", flush=True)
        elif not uma_iteracao:
            time.sleep(config.intervalo_fila)

        if uma_iteracao:
            return


if __name__ == "__main__":
    rodar()
```

Run: `pytest -v` (8 testes) + `ruff check . && ruff format --check .` → verdes.

- [ ] **Step 3: Commit**

```bash
git add worker/src/pytime_worker/principal.py worker/tests/test_principal.py
git commit -m "feat(worker): loop principal com resgate de orfas e poll da fila"
```

---

### Task 6: App — montagem da Instancia a partir do banco

**Files:**
- Create: `app/src/lib/instancia.ts`
- Test: `app/tests/instancia.test.ts`

**Interfaces:**
- Consumes: schema do banco; contrato JSON do motor (`Instancia` do `pytime_engine`).
- Produces (T7 consome):
  - `type DadosUnidade` (linhas cruas das 10 consultas) e `type InstanciaMotor` (espelho TS do contrato do motor).
  - `montarInstancia(dados: DadosUnidade, budgetSegundos: number): InstanciaMotor` — **pura** (TDD).
  - `buscarDadosUnidade(supabase: SupabaseClient, unidadeId: string): Promise<DadosUnidade>`.

- [ ] **Step 1: Escrever o teste que falha**

`app/tests/instancia.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { montarInstancia, type DadosUnidade } from "@/lib/instancia";

const dados: DadosUnidade = {
  turnos: [{ id: "tn1", nome: "Manhã" }],
  slots: [
    { id: "s1", dia: 0, ordem: 0, turno_id: "tn1" },
    { id: "s2", dia: 0, ordem: 1, turno_id: "tn1" },
  ],
  turmas: [{ id: "tu1", nome: "6º A", turno_id: "tn1" }],
  disciplinas: [{ id: "d1", nome: "Matemática" }],
  professores: [{ id: "p1", nome: "Amanda" }],
  disponibilidades: [
    { professor_id: "p1", slot_id: "s1", status: "prefere" },
    { professor_id: "p1", slot_id: "s2", status: "indisponivel" },
  ],
  recursos: [{ id: "r1", nome: "Lab", capacidade: 1 }],
  atribuicoes: [
    {
      id: "a1", professor_id: "p1", disciplina_id: "d1",
      turma_id: "tu1", carga_semanal: 2, geminadas: 1,
    },
  ],
  atribuicaoRecursos: [{ atribuicao_id: "a1", recurso_id: "r1" }],
  regras: [
    { id: "rg1", tipo: "geminadas", hard: true, peso: 1, ativa: true, parametros: {} },
  ],
};

describe("montarInstancia", () => {
  it("espelha o contrato do motor", () => {
    const inst = montarInstancia(dados, 90);
    expect(inst.budget_segundos).toBe(90);
    expect(inst.slots).toHaveLength(2);
    expect(inst.professores[0].disponibilidade).toEqual({
      s1: "prefere",
      s2: "indisponivel",
    });
    expect(inst.atribuicoes[0].recurso_ids).toEqual(["r1"]);
    expect(inst.atribuicoes[0].geminadas).toBe(1);
    expect(inst.regras[0].tipo).toBe("geminadas");
  });
  it("professor sem marcações tem disponibilidade vazia", () => {
    const semMarcacoes = { ...dados, disponibilidades: [] };
    const inst = montarInstancia(semMarcacoes, 60);
    expect(inst.professores[0].disponibilidade).toEqual({});
    expect(inst.atribuicoes[0].recurso_ids).toEqual(["r1"]);
  });
});
```

Run: `cd app && npm run teste` → Expected: FAIL (`Cannot find module '@/lib/instancia'`).

- [ ] **Step 2: Implementar e ver passar**

`app/src/lib/instancia.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type DadosUnidade = {
  turnos: { id: string; nome: string }[];
  slots: { id: string; dia: number; ordem: number; turno_id: string }[];
  turmas: { id: string; nome: string; turno_id: string }[];
  disciplinas: { id: string; nome: string }[];
  professores: { id: string; nome: string }[];
  disponibilidades: { professor_id: string; slot_id: string; status: string }[];
  recursos: { id: string; nome: string; capacidade: number }[];
  atribuicoes: {
    id: string;
    professor_id: string;
    disciplina_id: string;
    turma_id: string;
    carga_semanal: number;
    geminadas: number;
  }[];
  atribuicaoRecursos: { atribuicao_id: string; recurso_id: string }[];
  regras: {
    id: string;
    tipo: string;
    hard: boolean;
    peso: number;
    ativa: boolean;
    parametros: Record<string, unknown>;
  }[];
};

/** Espelho TS do contrato JSON de pytime_engine.Instancia. */
export type InstanciaMotor = {
  turnos: { id: string; nome: string }[];
  slots: { id: string; dia: number; ordem: number; turno_id: string }[];
  turmas: { id: string; nome: string; turno_id: string }[];
  disciplinas: { id: string; nome: string }[];
  professores: {
    id: string;
    nome: string;
    disponibilidade: Record<string, string>;
  }[];
  atribuicoes: {
    id: string;
    professor_id: string;
    disciplina_id: string;
    turma_id: string;
    carga_semanal: number;
    geminadas: number;
    recurso_ids: string[];
  }[];
  recursos: { id: string; nome: string; capacidade: number }[];
  regras: {
    id: string;
    tipo: string;
    hard: boolean;
    peso: number;
    ativa: boolean;
    parametros: Record<string, unknown>;
  }[];
  budget_segundos: number;
};

export function montarInstancia(
  dados: DadosUnidade,
  budgetSegundos: number,
): InstanciaMotor {
  const disponibilidadePorProfessor = new Map<string, Record<string, string>>();
  for (const d of dados.disponibilidades) {
    const mapa = disponibilidadePorProfessor.get(d.professor_id) ?? {};
    mapa[d.slot_id] = d.status;
    disponibilidadePorProfessor.set(d.professor_id, mapa);
  }
  const recursosPorAtribuicao = new Map<string, string[]>();
  for (const ar of dados.atribuicaoRecursos) {
    const lista = recursosPorAtribuicao.get(ar.atribuicao_id) ?? [];
    lista.push(ar.recurso_id);
    recursosPorAtribuicao.set(ar.atribuicao_id, lista);
  }
  return {
    turnos: dados.turnos,
    slots: dados.slots,
    turmas: dados.turmas,
    disciplinas: dados.disciplinas,
    professores: dados.professores.map((p) => ({
      ...p,
      disponibilidade: disponibilidadePorProfessor.get(p.id) ?? {},
    })),
    atribuicoes: dados.atribuicoes.map((a) => ({
      ...a,
      recurso_ids: recursosPorAtribuicao.get(a.id) ?? [],
    })),
    recursos: dados.recursos,
    regras: dados.regras,
    budget_segundos: budgetSegundos,
  };
}

export async function buscarDadosUnidade(
  supabase: SupabaseClient,
  unidadeId: string,
): Promise<DadosUnidade> {
  const [
    turnos, slots, turmas, disciplinas, professores,
    disponibilidades, recursos, atribuicoes, atribuicaoRecursos, regras,
  ] = await Promise.all([
    supabase.from("turnos").select("id, nome").eq("unidade_id", unidadeId),
    supabase.from("slots").select("id, dia, ordem, turno_id")
      .eq("unidade_id", unidadeId),
    supabase.from("turmas").select("id, nome, turno_id")
      .eq("unidade_id", unidadeId),
    supabase.from("disciplinas").select("id, nome").eq("unidade_id", unidadeId),
    supabase.from("professores").select("id, nome").eq("unidade_id", unidadeId),
    supabase.from("disponibilidades").select("professor_id, slot_id, status")
      .eq("unidade_id", unidadeId),
    supabase.from("recursos").select("id, nome, capacidade")
      .eq("unidade_id", unidadeId),
    supabase.from("atribuicoes")
      .select("id, professor_id, disciplina_id, turma_id, carga_semanal, geminadas")
      .eq("unidade_id", unidadeId),
    supabase.from("atribuicao_recursos").select("atribuicao_id, recurso_id"),
    supabase.from("regras").select("id, tipo, hard, peso, ativa, parametros")
      .eq("unidade_id", unidadeId),
  ]);
  const erro = [
    turnos, slots, turmas, disciplinas, professores, disponibilidades,
    recursos, atribuicoes, atribuicaoRecursos, regras,
  ].find((r) => r.error);
  if (erro?.error) {
    throw new Error(`Falha ao ler os dados da unidade: ${erro.error.message}`);
  }
  const idsAtribuicoes = new Set((atribuicoes.data ?? []).map((a) => a.id));
  return {
    turnos: turnos.data ?? [],
    slots: slots.data ?? [],
    turmas: turmas.data ?? [],
    disciplinas: disciplinas.data ?? [],
    professores: professores.data ?? [],
    disponibilidades: disponibilidades.data ?? [],
    recursos: recursos.data ?? [],
    atribuicoes: atribuicoes.data ?? [],
    // RLS já limita à(s) unidade(s) do usuário; o filtro garante a ativa
    atribuicaoRecursos: (atribuicaoRecursos.data ?? []).filter((ar) =>
      idsAtribuicoes.has(ar.atribuicao_id),
    ),
    regras: (regras.data ?? []) as DadosUnidade["regras"],
  };
}
```

Run: `npm run teste` → PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/instancia.ts app/tests/instancia.test.ts
git commit -m "feat(app): montagem da instancia do motor a partir do banco"
```

---

### Task 7: App — /geracoes (enfileirar, listar, progresso ao vivo)

**Files:**
- Create: `app/src/app/(interno)/geracoes/page.tsx`, `app/src/app/(interno)/geracoes/actions.ts`, `app/src/app/(interno)/geracoes/gerar.tsx`, `app/src/app/(interno)/geracoes/ao-vivo.tsx`
- Modify: `app/src/components/barra-lateral.tsx` (link "Gerações" após Regras)

**Interfaces:**
- Consumes: `buscarDadosUnidade`/`montarInstancia` (T6), `calcularPendencias` (2B), `criarClienteNavegador` (2A, para Realtime), RPCs não (insert direto sob RLS).
- Produces: action `gerarHorario(_ant, formData) -> { erro?: string; pendencias?: PendenciaMatriz[] }`; componente `<AoVivo unidadeId />` que assina `postgres_changes` (UPDATE em `geracoes`) e chama `router.refresh()`.

- [ ] **Step 1: Action de gerar**

`app/src/app/(interno)/geracoes/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { buscarDadosUnidade, montarInstancia } from "@/lib/instancia";
import { calcularPendencias, type PendenciaMatriz } from "@/lib/matriz";

const esquemaBudget = z.coerce
  .number()
  .int()
  .min(1, "Budget mínimo é 1 s")
  .max(600, "Budget máximo é 600 s");

export type EstadoGerar = { erro?: string; pendencias?: PendenciaMatriz[] };

export async function gerarHorario(
  _anterior: EstadoGerar,
  formData: FormData,
): Promise<EstadoGerar> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores geram horários." };
  }
  const budget = esquemaBudget.safeParse(formData.get("budget"));
  if (!budget.success) return { erro: budget.error.issues[0].message };

  const supabase = await criarClienteServidor();
  let dados;
  try {
    dados = await buscarDadosUnidade(supabase, perfil.unidade_id);
  } catch {
    return { erro: "Não foi possível ler os dados da unidade." };
  }

  // Pré-validação barata (a pesada é do motor): matriz cheia por turma
  const slotsPorTurno: Record<string, number> = {};
  for (const s of dados.slots) {
    slotsPorTurno[s.turno_id] = (slotsPorTurno[s.turno_id] ?? 0) + 1;
  }
  const cargaPorTurma: Record<string, number> = {};
  for (const a of dados.atribuicoes) {
    cargaPorTurma[a.turma_id] = (cargaPorTurma[a.turma_id] ?? 0) + a.carga_semanal;
  }
  const pendencias = calcularPendencias(dados.turmas, slotsPorTurno, cargaPorTurma);
  if (pendencias.length > 0) {
    return { erro: "Matriz incompleta — ajuste as atribuições.", pendencias };
  }
  if (dados.turmas.length === 0) {
    return { erro: "Cadastre turmas e atribuições antes de gerar." };
  }

  const instancia = montarInstancia(dados, budget.data);
  const { error } = await supabase.from("geracoes").insert({
    unidade_id: perfil.unidade_id,
    instancia,
    budget_segundos: budget.data,
  });
  if (error) return { erro: "Não foi possível enfileirar a geração." };
  revalidatePath("/geracoes");
  return {};
}

export async function tentarNovamente(formData: FormData): Promise<void> {
  const geracaoId = formData.get("geracao_id");
  if (typeof geracaoId !== "string") return;
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") return;
  const supabase = await criarClienteServidor();
  // Reaproveita a mesma instância/budget numa geração nova (spec §6)
  const { data: original } = await supabase
    .from("geracoes")
    .select("instancia, budget_segundos")
    .eq("id", geracaoId)
    .eq("unidade_id", perfil.unidade_id)
    .in("status", ["erro", "inviavel"])
    .maybeSingle();
  if (!original) return;
  await supabase.from("geracoes").insert({
    unidade_id: perfil.unidade_id,
    instancia: original.instancia,
    budget_segundos: original.budget_segundos,
  });
  revalidatePath("/geracoes");
}
```

- [ ] **Step 2: Formulário de gerar (client)**

`app/src/app/(interno)/geracoes/gerar.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { gerarHorario, type EstadoGerar } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioGerar() {
  const [estado, acao, pendente] = useActionState<EstadoGerar, FormData>(
    gerarHorario,
    {},
  );
  return (
    <form action={acao} className="flex items-end gap-3">
      <div>
        <Label htmlFor="budget">Tempo máximo (s)</Label>
        <Input id="budget" name="budget" type="number" min={1} max={600}
          defaultValue={60} className="w-28" />
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? "Enfileirando..." : "Gerar horário"}
      </Button>
      <div className="text-sm">
        {estado.erro && <p className="text-red-600">{estado.erro}</p>}
        {(estado.pendencias ?? []).map((p) => (
          <p key={p.turma_id} className="text-amber-600">
            {p.turma_nome}: {p.atual} de {p.esperado} aulas atribuídas
          </p>
        ))}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Progresso ao vivo (client)**

`app/src/app/(interno)/geracoes/ao-vivo.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/cliente-navegador";

/** Assina UPDATEs de geracoes da unidade e revalida a página. */
export function AoVivo({ unidadeId }: { unidadeId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = criarClienteNavegador();
    const canal = supabase
      .channel(`geracoes-${unidadeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "geracoes",
          filter: `unidade_id=eq.${unidadeId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [unidadeId, router]);
  return null;
}
```

- [ ] **Step 4: Página**

`app/src/app/(interno)/geracoes/page.tsx`:

```tsx
import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { FormularioGerar } from "./gerar";
import { AoVivo } from "./ao-vivo";
import { tentarNovamente } from "./actions";

const ROTULO_STATUS: Record<string, string> = {
  pendente: "Na fila",
  executando: "Executando",
  concluida: "Concluída",
  inviavel: "Inviável",
  erro: "Erro",
};

export default async function PaginaGeracoes() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  // hint da FK simples: a FK composta de tenant torna o embed ambíguo
  const { data: geracoes, error } = await supabase
    .from("geracoes")
    .select(
      "id, status, criada_em, budget_segundos, progresso, resultado," +
        " nucleo_conflito, detalhe_erro, tentativas," +
        " cenarios!cenarios_geracao_id_fkey(id)",
    )
    .eq("unidade_id", perfil.unidade_id)
    .order("criada_em", { ascending: false })
    .limit(20);

  return (
    <div className="flex flex-col gap-6">
      <AoVivo unidadeId={perfil.unidade_id} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gerações</h1>
        <FormularioGerar />
      </div>
      {error && (
        <p className="text-sm text-red-600">
          Não foi possível carregar as gerações. Recarregue a página.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Criada em</th>
            <th>Situação</th>
            <th>Progresso</th>
            <th>Custo</th>
            <th>Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {(geracoes ?? []).map((g) => {
            const progresso = g.progresso as
              | { custo: number; tempo_segundos: number }
              | null;
            const resultado = g.resultado as { custo_total?: number } | null;
            const cenario = (g.cenarios as { id: string }[] | null)?.[0];
            return (
              <tr key={g.id} className="border-b align-top">
                <td className="py-2">
                  {new Date(g.criada_em).toLocaleString("pt-BR")}
                </td>
                <td>{ROTULO_STATUS[g.status] ?? g.status}</td>
                <td>
                  {g.status === "executando" && progresso
                    ? `custo ${progresso.custo} aos ${progresso.tempo_segundos}s`
                    : g.status === "executando"
                      ? "iniciando..."
                      : "—"}
                </td>
                <td>{resultado?.custo_total ?? "—"}</td>
                <td className="max-w-md">
                  {g.status === "concluida" && cenario && (
                    <Link className="underline" href={`/grade/${cenario.id}`}>
                      Ver grade
                    </Link>
                  )}
                  {g.status === "inviavel" && (
                    <ul className="list-inside list-disc text-red-700">
                      {(g.nucleo_conflito ?? []).map((m: string) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  )}
                  {g.status === "erro" && (
                    <span className="text-red-700">{g.detalhe_erro}</span>
                  )}
                  {(g.status === "erro" || g.status === "inviavel") && (
                    <form action={tentarNovamente} className="mt-1">
                      <input type="hidden" name="geracao_id" value={g.id} />
                      <button type="submit" className="text-xs underline">
                        Tentar novamente
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(geracoes ?? []).length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          Nenhuma geração ainda. Complete os cadastros e clique em Gerar horário.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Link na sidebar**

Em `barra-lateral.tsx`, após Regras:

```tsx
        <Link href="/geracoes">Gerações</Link>
```

- [ ] **Step 6: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS.

```bash
git add "app/src/app/(interno)/geracoes" app/src/components/barra-lateral.tsx
git commit -m "feat(app): fila de geracoes com progresso ao vivo via Realtime"
```

---

### Task 8: App — /grade/[cenarioId] (por turma, por professor, geral por turno)

**Files:**
- Create: `app/src/app/(interno)/grade/[cenarioId]/page.tsx`

**Interfaces:**
- Consumes: `cenarios`, `aulas_alocadas`, `geracoes.resultado` (custos), cadastros para nomes.
- Produces: página somente leitura; visões via query string `?visao=turma|professor|turno&alvo=<id>`.

- [ ] **Step 1: Página**

`app/src/app/(interno)/grade/[cenarioId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type Celula = { disciplina: string; extra: string };

export default async function PaginaGrade({
  params,
  searchParams,
}: {
  params: Promise<{ cenarioId: string }>;
  searchParams: Promise<{ visao?: string; alvo?: string }>;
}) {
  const { cenarioId } = await params;
  const { visao = "turma", alvo } = await searchParams;
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();

  const { data: cenario } = await supabase
    .from("cenarios")
    .select("id, geracao_id")
    .eq("id", cenarioId)
    .eq("unidade_id", perfil.unidade_id)
    .maybeSingle();
  if (!cenario) notFound();

  const [aulasR, atribR, slotsR, turmasR, profsR, discR, turnosR, gerR] =
    await Promise.all([
      supabase.from("aulas_alocadas").select("atribuicao_id, slot_id")
        .eq("cenario_id", cenarioId),
      supabase.from("atribuicoes")
        .select("id, professor_id, disciplina_id, turma_id")
        .eq("unidade_id", perfil.unidade_id),
      supabase.from("slots").select("id, dia, ordem, turno_id")
        .eq("unidade_id", perfil.unidade_id),
      supabase.from("turmas").select("id, nome, turno_id")
        .eq("unidade_id", perfil.unidade_id).order("nome"),
      supabase.from("professores").select("id, nome")
        .eq("unidade_id", perfil.unidade_id).order("nome"),
      supabase.from("disciplinas").select("id, nome")
        .eq("unidade_id", perfil.unidade_id),
      supabase.from("turnos").select("id, nome")
        .eq("unidade_id", perfil.unidade_id).order("nome"),
      supabase.from("geracoes").select("resultado").eq("id", cenario.geracao_id)
        .maybeSingle(),
    ]);

  const nome = (l: { id: string; nome: string }[] | null) =>
    Object.fromEntries((l ?? []).map((x) => [x.id, x.nome]));
  const nomeTurma = nome(turmasR.data);
  const nomeProf = nome(profsR.data);
  const nomeDisc = nome(discR.data);
  const slotPorId = Object.fromEntries(
    (slotsR.data ?? []).map((s) => [s.id, s]),
  );
  const atribPorId = Object.fromEntries(
    (atribR.data ?? []).map((a) => [a.id, a]),
  );

  // célula[slot_id] por agrupador (turma/professor)
  const porTurma = new Map<string, Map<string, Celula>>();
  const porProfessor = new Map<string, Map<string, Celula>>();
  for (const aula of aulasR.data ?? []) {
    const atrib = atribPorId[aula.atribuicao_id];
    if (!atrib) continue;
    const celTurma: Celula = {
      disciplina: nomeDisc[atrib.disciplina_id] ?? "?",
      extra: nomeProf[atrib.professor_id] ?? "?",
    };
    const celProf: Celula = {
      disciplina: nomeDisc[atrib.disciplina_id] ?? "?",
      extra: nomeTurma[atrib.turma_id] ?? "?",
    };
    if (!porTurma.has(atrib.turma_id)) porTurma.set(atrib.turma_id, new Map());
    porTurma.get(atrib.turma_id)!.set(aula.slot_id, celTurma);
    if (!porProfessor.has(atrib.professor_id)) {
      porProfessor.set(atrib.professor_id, new Map());
    }
    porProfessor.get(atrib.professor_id)!.set(aula.slot_id, celProf);
  }

  const resultado = gerR.data?.resultado as {
    custo_total?: number;
    custos?: { regra_id: string; tipo: string; custo: number }[];
  } | null;

  function TabelaGrade({
    turnoId,
    celulas,
  }: {
    turnoId: string;
    celulas: Map<string, Celula>;
  }) {
    const slotsTurno = (slotsR.data ?? []).filter((s) => s.turno_id === turnoId);
    const dias = [...new Set(slotsTurno.map((s) => s.dia))].sort((a, b) => a - b);
    const ordens = [...new Set(slotsTurno.map((s) => s.ordem))].sort(
      (a, b) => a - b,
    );
    return (
      <table className="border text-sm">
        <thead>
          <tr>
            <th className="border px-2 py-1"></th>
            {dias.map((d) => (
              <th key={d} className="border px-2 py-1">{DIAS[d]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordens.map((o) => (
            <tr key={o}>
              <td className="border px-2 py-1 font-medium">{o + 1}º</td>
              {dias.map((d) => {
                const slot = slotsTurno.find(
                  (s) => s.dia === d && s.ordem === o,
                );
                const cel = slot ? celulas.get(slot.id) : undefined;
                return (
                  <td key={d} className="border px-3 py-2 text-center">
                    {cel ? (
                      <>
                        <div className="font-medium">{cel.disciplina}</div>
                        <div className="text-xs text-muted-foreground">
                          {cel.extra}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const abas = [
    { chave: "turma", rotulo: "Por turma" },
    { chave: "professor", rotulo: "Por professor" },
    { chave: "turno", rotulo: "Geral por turno" },
  ];
  const alvos =
    visao === "turma"
      ? (turmasR.data ?? [])
      : visao === "professor"
        ? (profsR.data ?? [])
        : (turnosR.data ?? []);
  const alvoAtivo = alvo ?? alvos[0]?.id;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Grade gerada</h1>
      <nav className="flex gap-4 text-sm">
        {abas.map((a) => (
          <Link key={a.chave} href={`/grade/${cenarioId}?visao=${a.chave}`}
            className={a.chave === visao ? "font-bold underline" : "underline"}>
            {a.rotulo}
          </Link>
        ))}
      </nav>
      <nav className="flex flex-wrap gap-3 text-sm">
        {alvos.map((x) => (
          <Link key={x.id}
            href={`/grade/${cenarioId}?visao=${visao}&alvo=${x.id}`}
            className={x.id === alvoAtivo ? "font-bold underline" : "underline"}>
            {x.nome}
          </Link>
        ))}
      </nav>

      {visao === "turma" && alvoAtivo && (
        <TabelaGrade
          turnoId={(turmasR.data ?? []).find((t) => t.id === alvoAtivo)!.turno_id}
          celulas={porTurma.get(alvoAtivo) ?? new Map()}
        />
      )}
      {visao === "professor" && alvoAtivo && (
        <div className="flex flex-col gap-4">
          {(turnosR.data ?? []).map((tn) => (
            <div key={tn.id}>
              <h2 className="mb-1 font-semibold">{tn.nome}</h2>
              <TabelaGrade turnoId={tn.id}
                celulas={porProfessor.get(alvoAtivo) ?? new Map()} />
            </div>
          ))}
        </div>
      )}
      {visao === "turno" && alvoAtivo && (
        <div className="flex flex-col gap-4">
          {(turmasR.data ?? [])
            .filter((t) => t.turno_id === alvoAtivo)
            .map((t) => (
              <div key={t.id}>
                <h2 className="mb-1 font-semibold">{t.nome}</h2>
                <TabelaGrade turnoId={alvoAtivo}
                  celulas={porTurma.get(t.id) ?? new Map()} />
              </div>
            ))}
        </div>
      )}

      {resultado && (
        <section className="text-sm">
          <h2 className="font-semibold">
            Custos das regras preferenciais (total {resultado.custo_total ?? 0})
          </h2>
          <ul className="list-inside list-disc">
            {(resultado.custos ?? [])
              .filter((c) => c.custo > 0)
              .map((c) => (
                <li key={c.regra_id}>
                  {c.tipo}: {c.custo}
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS.

```bash
git add "app/src/app/(interno)/grade"
git commit -m "feat(app): grade gerada por turma, professor e turno com custos"
```

---

### Task 9: App — integração do painel

**Files:**
- Modify: `app/src/app/(interno)/painel/page.tsx`

**Interfaces:**
- Consumes: página do painel existente (última geração + cartões).
- Produces: atalho "Gerar horário" e link para a última grade.

- [ ] **Step 1: Editar o painel**

Em `painel/page.tsx`:
1. Ampliar o select da última geração para incluir o cenário (com hint de FK):

```tsx
  const { data: ultima } = await supabase
    .from("geracoes")
    .select("id, status, criada_em, cenarios!cenarios_geracao_id_fkey(id)")
    .eq("unidade_id", perfil.unidade_id)
    .order("criada_em", { ascending: false })
    .limit(1)
    .maybeSingle();
```

2. No Card "Última geração", trocar o texto estático por:

```tsx
        <CardContent className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            {ultima
              ? `${ultima.status} em ${new Date(ultima.criada_em).toLocaleString("pt-BR")}`
              : "Nenhuma geração ainda."}
          </span>
          {ultima?.status === "concluida" &&
            (ultima.cenarios as { id: string }[] | null)?.[0] && (
              <Link className="underline"
                href={`/grade/${(ultima.cenarios as { id: string }[])[0].id}`}>
                Ver grade
              </Link>
            )}
          <Link className="underline" href="/geracoes">
            Gerar horário
          </Link>
        </CardContent>
```

(adicionar `import Link from "next/link";` no topo).

- [ ] **Step 2: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS.

```bash
git add "app/src/app/(interno)/painel/page.tsx"
git commit -m "feat(app): painel com atalho de geracao e ultima grade"
```

---

### Task 10: Deploy do worker no Fly.io

**⚠️ CHECKPOINT COM O USUÁRIO:** requer conta no Fly.io, `flyctl` instalado e login (`fly auth login`). A máquina local NÃO tem Docker — o build usa `--remote-only` (builder do Fly).

**Files:**
- Create: `worker/Dockerfile`, `fly.toml`

**Interfaces:**
- Consumes: worker completo (T3–T5); migrations aplicadas (T2).
- Produces: worker rodando 24/7 no Fly.io com `SUPABASE_DB_URL` como secret.

- [ ] **Step 1: Dockerfile (contexto = raiz do repo, para incluir `engine/`)**

`worker/Dockerfile`:

```dockerfile
FROM python:3.12-slim

WORKDIR /srv
COPY engine/ ./engine/
COPY worker/ ./worker/
RUN pip install --no-cache-dir ./engine ./worker

ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "pytime_worker.principal"]
```

- [ ] **Step 2: fly.toml**

`fly.toml`:

```toml
# Worker de geração do PyTime — processo sempre ligado, sem serviço HTTP.
app = "pytime-worker"
primary_region = "gru"

[build]
  dockerfile = "worker/Dockerfile"

[processes]
  worker = "python -m pytime_worker.principal"

[[vm]]
  size = "shared-cpu-2x"
  memory = "2gb"
  processes = ["worker"]
```

- [ ] **Step 3: CHECKPOINT — criar app, secret e deploy (com o usuário)**

Da RAIZ do repo (o contexto do build precisa enxergar `engine/`):

```bash
fly auth login                        # usuário
fly apps create pytime-worker
fly secrets set --app pytime-worker SUPABASE_DB_URL="postgresql://postgres:<SENHA>@db.jrdnelyzvpvniukqamdm.supabase.co:5432/postgres"
fly deploy --remote-only
```

(No Fly o host direto funciona por IPv6; se falhar, usar o pooler session `postgres.jrdnelyzvpvniukqamdm@aws-0-sa-east-1.pooler.supabase.com:5432`.)

- [ ] **Step 4: Verificar**

```bash
fly logs --app pytime-worker
```

Expected: `Worker PyTime iniciado.` e, sem jobs, silêncio (poll de 5 s).

- [ ] **Step 5: Commit**

```bash
git add worker/Dockerfile fly.toml
git commit -m "feat(worker): Dockerfile e configuracao do Fly.io"
```

---

### Task 11: Deploy do app na Vercel + docs de deploy

**⚠️ CHECKPOINT COM O USUÁRIO:** requer conta Vercel e login do CLI (`vercel login`), e ajustes de Auth no dashboard do Supabase para o domínio de produção.

**Files:**
- Create: `docs/deploy.md`

**Interfaces:**
- Consumes: app completo.
- Produces: app em produção na Vercel; `docs/deploy.md` com os três passos reproduzíveis (spec §7).

- [ ] **Step 1: CHECKPOINT — deploy (com o usuário)**

```bash
cd app
vercel login                          # usuário
vercel link                           # criar projeto "pytime", root = app/
vercel env add NEXT_PUBLIC_SUPABASE_URL production      # https://jrdnelyzvpvniukqamdm.supabase.co
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add NEXT_PUBLIC_SITE_URL production          # https://<dominio>.vercel.app
vercel deploy --prod
```

Depois, no Supabase (Authentication → URL Configuration): Site URL = domínio de produção; adicionar `https://<dominio>.vercel.app/**` às Redirect URLs (mantendo o localhost para dev).

- [ ] **Step 2: Smoke em produção**

Login no domínio de produção → painel carrega → /geracoes abre. (A geração completa é o smoke da T12.)

- [ ] **Step 3: Escrever `docs/deploy.md`**

```markdown
# Deploy do PyTime (Fase 2)

Três peças: Supabase (banco/auth), Vercel (app Next.js), Fly.io (worker).

## 1. Supabase

- Projeto: `pytime` (`jrdnelyzvpvniukqamdm`, sa-east-1).
- Migrations: `npx supabase link --project-ref <ref>` e `npx supabase db push`.
- Testes de RLS: `SUPABASE_DB_URL=... python supabase/tests/rodar_testes.py` (44 testes).
- Auth → URL Configuration: Site URL do ambiente + Redirect URLs (`<site>/**`).
- Auth → Email Templates → Invite user: link
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}`

## 2. App (Vercel)

- Root directory: `app/`.
- Envs (production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
- Deploy: `cd app && vercel deploy --prod`.

## 3. Worker (Fly.io)

- App: `pytime-worker` (região `gru`), 1 máquina sempre ligada, sem HTTP.
- Secret: `fly secrets set --app pytime-worker SUPABASE_DB_URL=...`
  (host direto `db.<ref>.supabase.co:5432` — IPv6 — ou o pooler session).
- Deploy (da raiz do repo): `fly deploy --remote-only`.
- Logs: `fly logs --app pytime-worker` (deve mostrar "Worker PyTime iniciado.").

## Rotina de atualização

1. `git push` (main).
2. Banco mudou? `npx supabase db push` + rodar os testes de RLS.
3. App: `cd app && vercel deploy --prod`.
4. Worker mudou (ou o engine)? `fly deploy --remote-only`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/deploy.md
git commit -m "docs: passos reproduziveis de deploy (Supabase, Vercel, Fly.io)"
```

---

### Task 12: Validação final da Fase 2C

**Files:**
- Modify: `CLAUDE.md` (comandos do worker no bloco de validação; marcar Fase 2 concluída no cabeçalho)

**Interfaces:**
- Consumes: tudo.
- Produces: fase pronta para merge; Fase 2 completa.

- [ ] **Step 1: Rodar todas as suítes**

```bash
cd engine && pytest -q && ruff check . && ruff format --check . && mypy src   # 47
cd worker && pytest -q && ruff check . && ruff format --check .              # 8 (SUPABASE_DB_URL no ambiente)
cd app && npm run teste && npm run lint && npm run build                     # 25+
python supabase/tests/rodar_testes.py                                        # 44
```

- [ ] **Step 2: Smoke de geração ponta a ponta (com o usuário)**

Local (worker local) ou produção (worker no Fly):
1. Worker rodando (`python -m pytime_worker.principal` com `SUPABASE_DB_URL`, ou `fly logs` acompanhando).
2. No app: /geracoes → Gerar horário (60 s) → linha `Na fila` → `Executando` com progresso ao vivo → `Concluída`.
3. "Ver grade": conferir por turma (matriz cheia), por professor (sem choques; Amanda respeitando preferências na medida do custo), geral por turno; custos soft listados.
4. Teste de inviabilidade: marcar um professor como indisponível a semana inteira (com a regra de disponibilidade ativa) → gerar → `Inviável` com núcleo legível (ex.: `disponibilidade:<professor>`); desfazer a marcação.
5. Painel: última geração com link da grade.

- [ ] **Step 3: Atualizar CLAUDE.md**

- Cabeçalho: "Fase 2 (app + worker) concluída; Fase 3 (pós-geração) é a próxima."
- Bloco de comandos, acrescentar:

```bash
cd worker && pytest -q && ruff check .   # worker (exige SUPABASE_DB_URL)
```

- [ ] **Step 4: Commit final**

```bash
git add CLAUDE.md
git commit -m "docs: fase 2 concluida e comandos do worker no CLAUDE.md"
```

Depois: `superpowers:finishing-a-development-branch` para integrar ao `master`.