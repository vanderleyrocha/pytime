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


def resolver(instancia: Instancia, on_progress=None) -> Resultado:
    inicio = time.monotonic()

    erros = instancia.validar_matriz_cheia()
    if erros:
        return Resultado(status="inviavel", nucleo_conflito=erros,
                         tempo_segundos=time.monotonic() - inicio)

    ctx = ContextoModelo(instancia)
    for config in instancia.regras:
        if not config.ativa:
            continue
        if config.tipo not in REGISTRO:
            raise ValueError(f"Regra desconhecida no catálogo: {config.tipo}")
        REGISTRO[config.tipo](config).aplicar(ctx)

    termos = [
        peso * var
        for itens in ctx.custos.values()
        for (var, peso, _, _) in itens
    ]
    if termos:
        ctx.model.Minimize(sum(termos))
    if ctx.assumptions:
        ctx.model.AddAssumptions(list(ctx.assumptions.values()))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = instancia.budget_segundos
    solver.parameters.num_workers = 8
    callback = None
    if on_progress is not None and termos:
        callback = _CallbackProgresso(on_progress, inicio)
    status = solver.Solve(ctx.model, callback)
    tempo = time.monotonic() - inicio

    if status in (cp_model.INFEASIBLE, cp_model.MODEL_INVALID):
        return Resultado(status="inviavel", tempo_segundos=tempo,
                         nucleo_conflito=_nucleo(ctx, solver))
    if status == cp_model.UNKNOWN:
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
        detalhes = [
            desc for (var, _, desc, _) in itens if solver.Value(var) > 0
        ]
        custos.append(CustoRegra(regra_id=regra_id, tipo=itens[0][3],
                                 custo=custo, detalhes=detalhes))
        total += custo
    return Resultado(status=_STATUS[status], grade=grade, custos=custos,
                     custo_total=total, tempo_segundos=tempo)


def _nucleo(ctx: ContextoModelo, solver: cp_model.CpSolver) -> list[str]:
    """Ganha corpo na Task 12 (núcleo de conflito via assumptions)."""
    indice_para_motivo = {
        var.Index(): motivo for motivo, var in ctx.assumptions.items()
    }
    return [
        indice_para_motivo[i]
        for i in solver.SufficientAssumptionsForInfeasibility()
        if i in indice_para_motivo
    ]
