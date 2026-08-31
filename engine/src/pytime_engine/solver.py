import time

from ortools.sat.python import cp_model

from .instancia import Instancia
from .modelo import ContextoModelo
from .regras import REGISTRO
from .resultado import AulaAlocada, CustoRegra, Resultado

_STATUS = {
    cp_model.OPTIMAL: "otimo",
    cp_model.FEASIBLE: "viavel",
    cp_model.INFEASIBLE: "inviavel",
    cp_model.UNKNOWN: "sem_solucao_no_budget",
}


class _CallbackProgresso(cp_model.CpSolverSolutionCallback):
    def __init__(self, on_progress, inicio: float):
        super().__init__()
        self._on_progress = on_progress
        self._inicio = inicio

    def on_solution_callback(self) -> None:
        try:
            self._on_progress(
                int(self.ObjectiveValue()),
                time.monotonic() - self._inicio,
            )
        except Exception:
            pass  # progresso é best-effort; nunca derruba o solve


#: budget mínimo (s) da fase 2, que só extrai o núcleo de conflito.
_BUDGET_NUCLEO_MIN = 5.0


def _montar(instancia: Instancia) -> tuple[ContextoModelo, list]:
    """Constrói o modelo com as regras do catálogo aplicadas.

    Devolve o contexto e os termos da função objetivo (regras soft).
    """
    ctx = ContextoModelo(instancia)
    for config in instancia.regras:
        if not config.ativa:
            continue
        if config.tipo not in REGISTRO:
            raise ValueError(f"Regra desconhecida no catálogo: {config.tipo}")
        REGISTRO[config.tipo](config).aplicar(ctx)
    termos = [
        peso * var for itens in ctx.custos.values() for (var, peso, _, _) in itens
    ]
    return ctx, termos


def resolver(instancia: Instancia, on_progress=None) -> Resultado:
    inicio = time.monotonic()

    erros = instancia.validar_referencias()
    if erros:
        tempo = time.monotonic() - inicio
        return Resultado(status="inviavel", nucleo_conflito=erros, tempo_segundos=tempo)

    erros = instancia.validar_matriz_cheia()
    if erros:
        tempo = time.monotonic() - inicio
        return Resultado(status="inviavel", nucleo_conflito=erros, tempo_segundos=tempo)

    # Fase 1: resolve SEM AddAssumptions. Assumptions degradam a busca do
    # CP-SAT (desabilitam parte do presolve e restringem a busca paralela),
    # a ponto de instâncias fáceis voltarem UNKNOWN. As regras hard seguem
    # usando OnlyEnforceIf(lit); aqui apenas fixamos cada lit em 1, o que é
    # semanticamente idêntico e não paga o custo das assumptions.
    ctx, termos = _montar(instancia)
    if termos:
        ctx.model.minimize(sum(termos))
    for lit in ctx.assumptions.values():
        ctx.model.add(lit == 1)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = instancia.budget_segundos
    solver.parameters.num_workers = 8
    callback = None
    if on_progress is not None and termos:
        callback = _CallbackProgresso(on_progress, inicio)
    status = solver.Solve(ctx.model, callback)
    # `tempo_fase1` só serve para dimensionar o budget da fase 2; o tempo
    # reportado é sempre medido no próprio ponto de retorno, para nunca
    # subnotificar trabalho feito depois desta linha.
    tempo_fase1 = time.monotonic() - inicio

    if status == cp_model.MODEL_INVALID:
        raise RuntimeError("Modelo CP-SAT inválido: " + ctx.model.validate())
    if status == cp_model.INFEASIBLE:
        nucleo = _extrair_nucleo(instancia, instancia.budget_segundos - tempo_fase1)
        if not nucleo:
            nucleo = [
                "estrutural: conflito nas restrições básicas (professor/turma/carga)"
            ]
        tempo = time.monotonic() - inicio
        return Resultado(
            status="inviavel", tempo_segundos=tempo, nucleo_conflito=nucleo
        )
    if status == cp_model.UNKNOWN:
        tempo = time.monotonic() - inicio
        return Resultado(status="sem_solucao_no_budget", tempo_segundos=tempo)

    grade = [
        AulaAlocada(atribuicao_id=ctx.aulas[i].atribuicao.id, slot_id=slot_id)
        for (i, slot_id), var in ctx.x.items()
        if solver.Value(var) == 1
    ]
    custos = []
    total = 0
    for regra_id, itens in ctx.custos.items():
        custo = sum(peso * solver.Value(var) for (var, peso, _, _) in itens)
        detalhes = [desc for (var, _, desc, _) in itens if solver.Value(var) > 0]
        custos.append(
            CustoRegra(
                regra_id=regra_id, tipo=itens[0][3], custo=custo, detalhes=detalhes
            )
        )
        total += custo
    tempo = time.monotonic() - inicio
    return Resultado(
        status=_STATUS[status],
        grade=grade,
        custos=custos,
        custo_total=total,
        tempo_segundos=tempo,
    )


def _extrair_nucleo(instancia: Instancia, budget_restante: float) -> list[str]:
    """Fase 2: remonta o modelo com AddAssumptions só para achar o núcleo.

    Só roda quando a fase 1 provou inviabilidade, então o custo das
    assumptions não pesa no caminho feliz. A função objetivo é omitida:
    ela não influencia a inviabilidade e só atrapalharia a extração.
    """
    ctx, _ = _montar(instancia)
    if not ctx.assumptions:
        return []
    ctx.model.add_assumptions(list(ctx.assumptions.values()))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(_BUDGET_NUCLEO_MIN, budget_restante)
    solver.parameters.num_workers = 8
    status = solver.Solve(ctx.model)
    if status != cp_model.INFEASIBLE:
        return []

    indice_para_motivo = {
        var.Index(): motivo for motivo, var in ctx.assumptions.items()
    }
    return [
        indice_para_motivo[i]
        for i in solver.SufficientAssumptionsForInfeasibility()
        if i in indice_para_motivo
    ]
