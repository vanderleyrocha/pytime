# PyTime

SaaS de geração automática de horários escolares (educação básica brasileira,
30–80+ turmas, múltiplos turnos). O coração é o **motor de otimização**
`engine/` — pacote Python puro sobre OR-Tools **CP-SAT** que recebe uma
`Instancia` JSON e devolve um `Resultado` JSON.

Specs vinculantes em `docs/superpowers/specs/` (design master + spec por fase).
Fase 1 (motor) concluída; Fase 2 (app Next.js + Supabase + worker Fly.io) é a
próxima.

## Stack

- **Motor** (`engine/`): Python 3.12, `ortools>=9.10` (CP-SAT), `pydantic>=2.7`,
  `pytest`. Instalação: `cd engine && pip install -e ".[dev]"`.
- **Fases futuras**: Next.js App Router + shadcn/ui (app), Supabase
  (Postgres/RLS/Auth/Realtime), worker Python no Fly.io.
- Identificadores, mensagens, docstrings e commits **em português**.

## Regras arquiteturais invioláveis do motor

1. **Pacote puro e desacoplado**: `engine/` não importa NADA de
   infraestrutura (Supabase, Vercel, HTTP, banco). Entrada JSON → saída JSON.
   Qualquer integração vive fora do pacote.
2. **Catálogo de regras extensível sem tocar o núcleo**: regra nova = um
   arquivo em `regras/` com classe decorada `@registrar` + 1 linha de import
   em `regras/__init__.py`. **Proibido** editar `modelo.py`/`solver.py` para
   adicionar regra.
3. **Hard rules via `only_enforce_if(lit)` com literais de `ctx.assumption()`**:
   é isso que permite extrair o núcleo de conflito quando inviável. Soft rules
   registram penalidades via `ctx.adicionar_custo(...)` — nunca chamam
   `minimize` diretamente.
4. **Solve em duas fases** (`solver.py`): fase 1 resolve com os literais
   fixados em 1 (`add(lit == 1)`) — `add_assumptions` degrada a busca; fase 2
   só roda em inviabilidade, remontando o modelo com `add_assumptions` para
   extrair o núcleo. Não "otimizar" isso de volta para uma fase.
5. **Budget**: `Instancia.budget_segundos` default 60 s (teto atual 240 s;
   sobe para 600 s na Fase 2). `num_workers = 8`. O tempo reportado em
   `Resultado.tempo_segundos` é medido no ponto de retorno.
6. **Status do resultado**: exatamente `otimo | viavel | inviavel |
   sem_solucao_no_budget`; inviável sempre carrega `nucleo_conflito` legível.
7. **API do CP-SAT sempre em snake_case** (`new_bool_var`, `add`,
   `only_enforce_if`, `minimize`): os aliases CamelCase são legado sem stubs
   de tipo e quebram o `mypy`.

## SOLID aplicado a este código

- **SRP**: um módulo, uma responsabilidade — `instancia.py` (contrato de
  entrada + validações baratas), `resultado.py` (contrato de saída),
  `modelo.py` (variáveis + restrições estruturais), `solver.py`
  (orquestração), um arquivo por regra em `regras/`.
- **Open/Closed**: o catálogo (`REGISTRO` + `@registrar`) é o ponto de
  extensão. O núcleo fica fechado para modificação, aberto por regras novas.
- **Liskov**: toda subclasse de `Regra` deve ser substituível — `aplicar(ctx)`
  nunca levanta exceção para instância válida, nunca muda o contrato de
  entrada/saída, só adiciona restrições/custos ao contexto.
- **Interface Segregation**: uma regra conhece apenas `ContextoModelo`
  (`x`, `occ_*`, `slots_da_turma`, `adicionar_custo`, `assumption`) — nunca o
  solver, o resultado ou outras regras.
- **Dependency Inversion**: `solver.py` depende da abstração `Regra` via
  `REGISTRO`; jamais importa uma regra concreta.

## Fluxo de trabalho exigido

- **TDD estrito**: teste que falha → implementação mínima → teste passa.
  Nunca escrever implementação antes do teste.
- **Um arquivo de teste por regra** (`tests/test_regras_*.py`); fixtures
  compartilhadas em `tests/conftest.py` (`instancia_minima`, `slots_semana`).
- **Commits pequenos** (uma task/regra por commit), mensagens em português no
  padrão `feat(engine): ...` / `fix(engine): ...` / `docs: ...`.
- Trabalho sempre em **branch dedicada** a partir de `master`; merge só com
  suíte verde.

## Definition of done (qualquer PR/task)

- [ ] Todos os testes passando (`pytest`), incluindo os novos escritos antes
      da implementação.
- [ ] Nenhum import de infraestrutura dentro de `engine/`.
- [ ] Type hints completos em assinaturas públicas; docstrings nas classes de
      regra (incluindo limitações conhecidas) e funções não-triviais.
- [ ] Identificadores/mensagens/erros em português.
- [ ] Lint e formatação limpos (`ruff check` + `ruff format --check`) e
      `mypy` sem erros.
- [ ] Sem regressão de desempenho: mudança que toca `modelo.py`/`solver.py`
      ou regra usada pelo gerador exige rodar o benchmark e comparar com a
      última medição registrada (20/40/80 turmas viáveis; overshoot de
      wall-time ~10% conhecido no caso 80).

## Comandos de validação

```bash
cd engine
pytest                              # suíte completa (47+ testes)
pytest --cov=pytime_engine --cov-report=term-missing   # cobertura
ruff check . && ruff format --check .                  # lint + formatação
mypy src                            # checagem de tipos
python bench/benchmark.py           # benchmark 20/40/80 turmas (demorado)
```

Pre-commit está configurado (`pre-commit install` uma vez): ruff + mypy a
cada commit; a suíte pytest completa roda no `pre-push`.

## Ferramentas do Claude Code neste repo

- Skill `nova-regra` (`.claude/skills/nova-regra/`): passo a passo TDD para
  adicionar uma regra ao catálogo. Use-a sempre que criar regra nova.
- Agente `revisor-engine` (`.claude/agents/revisor-engine.md`): reviewer com a
  rubrica arquitetural deste arquivo. Despache-o para revisar qualquer mudança
  em `engine/` antes do merge.
