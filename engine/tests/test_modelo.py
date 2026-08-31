from ortools.sat.python import cp_model

from conftest import instancia_minima
from pytime_engine.modelo import ContextoModelo


def resolver_bruto(ctx: ContextoModelo) -> cp_model.CpSolver:
    solver = cp_model.CpSolver()
    status = solver.Solve(ctx.model)
    assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    return solver


def test_cria_variaveis_por_aula_e_slot():
    inst = instancia_minima()
    ctx = ContextoModelo(inst)
    assert len(ctx.aulas) == 20          # 8 + 8 + 4
    assert len(ctx.x) == 20 * 20         # 20 aulas × 20 slots do turno


def test_estrutural_matriz_cheia_e_sem_conflito():
    inst = instancia_minima()
    ctx = ContextoModelo(inst)
    solver = resolver_bruto(ctx)
    # cada slot da turma tem exatamente 1 aula
    for slot in ctx.slots_da_turma("t1"):
        ocupacao = sum(
            solver.Value(ctx.x[(i, slot.id)]) for i in range(len(ctx.aulas))
        )
        assert ocupacao == 1
    # cada aula está em exatamente 1 slot
    for i in range(len(ctx.aulas)):
        assert sum(
            solver.Value(v) for (ai, _), v in ctx.x.items() if ai == i
        ) == 1


def test_professor_sem_conflito_entre_turmas():
    # mesmo professor em duas disciplinas da mesma turma já é coberto pela
    # restrição de turma; o teste estrutural relevante é occ_professor <= 1,
    # validado aqui via occ_professor somando as atribuições dele.
    inst = instancia_minima(
        cargas={"mat": 10, "por": 10},
        professores_por_disciplina={"mat": "ana", "por": "ana"},
    )
    ctx = ContextoModelo(inst)
    solver = resolver_bruto(ctx)
    for slot in inst.slots:
        assert solver.Value(ctx.occ_professor("ana", slot.id)) <= 1


def test_adicionar_custo_e_assumption():
    ctx = ContextoModelo(instancia_minima())
    v = ctx.model.NewBoolVar("p")
    ctx.adicionar_custo("r1", "janelas_professor", v, 3, "detalhe")
    assert ctx.custos["r1"] == [(v, 3, "detalhe", "janelas_professor")]
    lit = ctx.assumption("disponibilidade:ana")
    assert ctx.assumption("disponibilidade:ana") is lit  # idempotente
