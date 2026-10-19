from conftest import instancia_minima
from ortools.sat.python import cp_model

from pytime_engine.modelo import ContextoModelo


def resolver_bruto(ctx: ContextoModelo) -> cp_model.CpSolver:
    solver = cp_model.CpSolver()
    status = solver.Solve(ctx.model)
    assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    return solver


def test_cria_variaveis_por_aula_e_slot():
    inst = instancia_minima()
    ctx = ContextoModelo(inst)
    assert len(ctx.aulas) == 20  # 8 + 8 + 4
    assert len(ctx.x) == 20 * 20  # 20 aulas × 20 slots do turno


def test_estrutural_matriz_cheia_e_sem_conflito():
    inst = instancia_minima()
    ctx = ContextoModelo(inst)
    solver = resolver_bruto(ctx)
    # cada slot da turma tem exatamente 1 aula
    for slot in ctx.slots_da_turma("t1"):
        ocupacao = sum(solver.Value(ctx.x[(i, slot.id)]) for i in range(len(ctx.aulas)))
        assert ocupacao == 1
    # cada aula está em exatamente 1 slot
    for i in range(len(ctx.aulas)):
        assert sum(solver.Value(v) for (ai, _), v in ctx.x.items() if ai == i) == 1


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
    v = ctx.model.new_bool_var("p")
    ctx.adicionar_custo("r1", "janelas_professor", v, 3, "detalhe")
    [termo] = ctx.custos["r1"]
    assert (termo.var, termo.peso, termo.descricao, termo.tipo) == (
        v,
        3,
        "detalhe",
        "janelas_professor",
    )
    assert termo.localizar is None
    lit = ctx.assumption("disponibilidade:ana")
    assert ctx.assumption("disponibilidade:ana") is lit  # idempotente


def _turma_sem_sexta_tarde(inst):
    """Turma única sem os dois últimos horários de sexta; carga ajustada."""
    inst.turmas[0].disponibilidade = {
        "manha-d4-h2": "indisponivel",
        "manha-d4-h3": "indisponivel",
    }
    next(a for a in inst.atribuicoes if a.id == "a-his").carga_semanal = 2
    return inst


def test_slot_indisponivel_da_turma_nao_gera_variavel():
    ctx = ContextoModelo(_turma_sem_sexta_tarde(instancia_minima()))
    assert len(ctx.aulas) == 18
    assert len(ctx.x) == 18 * 18
    assert all(s not in ("manha-d4-h2", "manha-d4-h3") for _, s in ctx.x)
    assert [s.id for s in ctx.slots_da_turma("t1")][-2:] == [
        "manha-d4-h0",
        "manha-d4-h1",
    ]


def test_turma_com_slots_indisponiveis_preenche_so_os_disponiveis():
    ctx = ContextoModelo(_turma_sem_sexta_tarde(instancia_minima()))
    solver = resolver_bruto(ctx)
    for slot in ctx.slots_da_turma("t1"):
        ocupacao = sum(
            solver.Value(ctx.x[(i, slot.id)])
            for i in range(len(ctx.aulas))
            if (i, slot.id) in ctx.x
        )
        assert ocupacao == 1
