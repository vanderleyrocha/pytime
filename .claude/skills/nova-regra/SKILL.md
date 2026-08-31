---
name: nova-regra
description: Use when adicionando uma nova regra (hard ou soft) ao catálogo do motor pytime_engine, ou quando o usuário pedir uma restrição/preferência nova no horário (ex. "professor não pode X", "evitar Y", "exigir Z").
---

# Nova regra no catálogo do motor

## Princípio

Regra nova **não toca o núcleo**: um arquivo novo em `engine/src/pytime_engine/regras/`,
uma linha de import em `regras/__init__.py`, um arquivo de teste. Se você está
editando `modelo.py` ou `solver.py`, pare — o design está errado.

**REQUIRED SUB-SKILL:** superpowers:test-driven-development (teste primeiro, sempre).

## Passos

1. **Definir o contrato**: nome do `tipo` (snake_case, português), parâmetros
   (`config.parametros`), hard ou soft (ou ambos, via `config.hard`).
2. **Escrever o teste que falha** em `engine/tests/test_regras_<nome>.py`:
   - use `instancia_minima(...)` de `conftest.py` (cargas devem somar
     `dias × por_dia` — matriz cheia);
   - regra hard: um teste que satisfaz + um que força `inviavel` e verifica o
     motivo em `r.nucleo_conflito`;
   - regra soft: um teste onde o solver zera o custo + um que força custo > 0
     e confere `r.custos` contra a contagem real na grade devolvida.
   - Rodar e VER falhar: `ValueError: Regra desconhecida no catálogo: <tipo>`.
3. **Implementar** `engine/src/pytime_engine/regras/<nome>.py`:

```python
from ..modelo import ContextoModelo
from .base import Regra, registrar


@registrar
class RegraMinhaCoisa(Regra):
    """O que a regra garante/penaliza. Documente limitações conhecidas."""

    tipo = "minha_coisa"

    def aplicar(self, ctx: ContextoModelo) -> None:
        if self.config.hard:
            lit = ctx.assumption(f"minha_coisa:{...}")   # núcleo de conflito
            ctx.model.add(...).only_enforce_if(lit)
        else:
            var = ctx.model.new_bool_var(f"{self.config.id}_...")
            ctx.model.add(...)  # amarra var à violação
            ctx.adicionar_custo(self.config.id, self.tipo, var,
                                self.config.peso, "descrição em português")
```

4. **Registrar**: adicionar em `regras/__init__.py`:
   `from . import <nome>  # noqa: F401`
5. **Validar**: `cd engine && pytest tests/test_regras_<nome>.py -v` (passa),
   depois `pytest` (suíte inteira), `ruff check . && mypy src`.
6. **Commit**: `feat(engine): regra <hard|soft> de <descrição>`.

## Armadilhas conhecidas

- `occ_atribuicao`/`occ_professor` sobre coleção vazia devolvem `int 0` —
  `ctx.model.add(0 <= k)` vira `Add(True)`; guarde contra listas vazias.
- Hard rules SEMPRE via `only_enforce_if(ctx.assumption(...))` — restrição sem
  literal não aparece no núcleo de conflito. Um literal por causa legível
  (por professor, por recurso...), não um global.
- Soft rules NUNCA chamam `minimize` — só `ctx.adicionar_custo`; o solver monta
  o objetivo.
- Nomes de variáveis CP-SAT devem incluir `self.config.id` (duas instâncias da
  mesma regra ativas não podem colidir).
- Teste soft que só verifica custo 0 não protege a fórmula — force uma
  violação determinística e compare o custo reportado com a contagem na grade.
- Slot id do conftest tem formato `manha-d{dia}-h{ordem}` — útil para asserts.
- Agrupamentos "por dia" devem usar chave `(turno_id, dia)` — professores
  circulam entre turnos.
