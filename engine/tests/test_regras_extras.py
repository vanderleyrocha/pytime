from conftest import grade_fixa, instancia_minima

from pytime_engine import avaliar, resolver
from pytime_engine.instancia import RegraConfig
from pytime_engine.resultado import Celula


def dias_da_atribuicao(grade, atribuicao_id):
    return {a.slot_id.split("-")[1] for a in grade if a.atribuicao_id == atribuicao_id}


def test_compactacao_reduz_dias_do_professor():
    # his: 4 aulas; sem compactação pode espalhar em 4 dias,
    # com compactação (max 4 slots/dia) cabe em 1 dia.
    inst = instancia_minima(
        regras=[
            RegraConfig(id="r-comp", tipo="compactacao_dias", hard=False, peso=1),
        ]
    )
    r = resolver(inst)
    assert r.status == "otimo"
    assert len(dias_da_atribuicao(r.grade, "a-his")) == 1


def test_ultimo_horario_hard():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-ult",
                tipo="ultimo_horario",
                hard=True,
                parametros={"disciplina_id": "mat"},
            ),
        ]
    )
    r = resolver(inst)
    assert r.status == "otimo"
    ordens = [
        int(a.slot_id.split("-")[2][1:]) for a in r.grade if a.atribuicao_id == "a-mat"
    ]
    assert all(o != 3 for o in ordens)  # ordem 3 = último horário


def test_nao_mesmo_dia_hard():
    inst = instancia_minima(
        cargas={"mat": 4, "por": 4, "his": 12},
        regras=[
            RegraConfig(
                id="r-nmd",
                tipo="nao_mesmo_dia",
                hard=True,
                parametros={"disciplina_a": "mat", "disciplina_b": "por"},
            )
        ],
    )
    r = resolver(inst)
    assert r.status == "otimo"
    assert not (
        dias_da_atribuicao(r.grade, "a-mat") & dias_da_atribuicao(r.grade, "a-por")
    )


def test_nao_mesmo_dia_soft_reporta_custo():
    # mat precisa de >=3 dias (11 aulas, 4 slots/dia) e por também (9 aulas):
    # 3 + 3 > 5 dias -> pelo menos 1 dia compartilhado, custo >= 1.
    inst = instancia_minima(
        cargas={"mat": 11, "por": 9},
        regras=[
            RegraConfig(
                id="r-nmd",
                tipo="nao_mesmo_dia",
                hard=False,
                peso=1,
                parametros={"disciplina_a": "mat", "disciplina_b": "por"},
            )
        ],
    )
    r = resolver(inst)
    assert r.status == "otimo"
    custo = next(c for c in r.custos if c.regra_id == "r-nmd")
    assert custo.custo >= 1


# mat e his juntas na segunda e na terça; his no último horário nesses dias
GRADE_MAT_HIS = [
    "mat mat his his",
    "mat mat his his",
    "mat mat por por",
    "mat mat por por",
    "por por por por",
]


def test_compactacao_lista_os_dias_sem_marcar_celulas():
    inst = instancia_minima(
        regras=[RegraConfig(id="r-comp", tipo="compactacao_dias", hard=False)]
    )

    [custo] = avaliar(inst, grade_fixa(GRADE_MAT_HIS)).custos

    # prof-mat 4 dias, prof-his 2, prof-por 3
    assert len(custo.ocorrencias) == 9
    assert all(o.celulas == [] for o in custo.ocorrencias)
    assert any(
        o.descricao == "prof-his: trabalha na segunda" for o in custo.ocorrencias
    )


def test_ultimo_horario_soft_marca_a_aula_no_ultimo_horario():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-ult",
                tipo="ultimo_horario",
                hard=False,
                parametros={"disciplina_id": "his"},
            )
        ]
    )

    [custo] = avaliar(inst, grade_fixa(GRADE_MAT_HIS)).custos

    assert [o.celulas for o in custo.ocorrencias] == [
        [Celula(slot_id="manha-d0-h3", turma_id="t1")],
        [Celula(slot_id="manha-d1-h3", turma_id="t1")],
    ]
    assert custo.ocorrencias[0].descricao == (
        "Turma 1 – His: aula no último horário da segunda"
    )


def test_nao_mesmo_dia_soft_marca_as_aulas_das_duas_disciplinas():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-nmd",
                tipo="nao_mesmo_dia",
                hard=False,
                parametros={"disciplina_a": "mat", "disciplina_b": "his"},
            )
        ]
    )

    [custo] = avaliar(inst, grade_fixa(GRADE_MAT_HIS)).custos

    segunda, terca = custo.ocorrencias
    assert segunda.descricao == "Turma 1: Mat e His na segunda"
    assert [c.slot_id for c in segunda.celulas] == [f"manha-d0-h{h}" for h in range(4)]
    assert [c.slot_id for c in terca.celulas] == [f"manha-d1-h{h}" for h in range(4)]
