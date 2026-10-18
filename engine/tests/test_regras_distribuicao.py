from collections import defaultdict

import pytest
from conftest import grade_fixa, instancia_minima

from pytime_engine import avaliar, resolver
from pytime_engine.instancia import RegraConfig


def aulas_por_dia(grade, atribuicao_id):
    contagem = defaultdict(int)
    for a in grade:
        if a.atribuicao_id == atribuicao_id:
            _, d, _ = a.slot_id.split("-")
            contagem[d] += 1
    return contagem


def test_respeita_max_por_dia_quando_folga():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-dist",
                tipo="distribuicao_disciplina",
                hard=False,
                peso=5,
                parametros={"max_por_dia": 2},
            ),
        ]
    )
    r = resolver(inst)
    assert r.status == "otimo"
    # 8 aulas de mat em 5 dias com max 2/dia é viável -> custo 0
    assert r.custo_total == 0
    assert max(aulas_por_dia(r.grade, "a-mat").values()) <= 2
    # espalhamento: mat (8 aulas, max 2) precisa de >= 4 dias
    assert len(aulas_por_dia(r.grade, "a-mat")) >= 4


def test_excesso_reportado_quando_inevitavel():
    # 12 aulas de mat, max 2/dia em 5 dias -> excesso mínimo 2
    inst = instancia_minima(
        cargas={"mat": 12, "por": 8},
        regras=[
            RegraConfig(
                id="r-dist",
                tipo="distribuicao_disciplina",
                hard=False,
                peso=1,
                parametros={"max_por_dia": 2},
            )
        ],
    )
    r = resolver(inst)
    assert r.status == "otimo"
    custo = next(c for c in r.custos if c.regra_id == "r-dist")
    assert custo.custo == 2
    assert custo.detalhes  # aponta onde


def test_max_por_dia_zero_levanta_erro():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-dist",
                tipo="distribuicao_disciplina",
                hard=False,
                peso=1,
                parametros={"max_por_dia": 0},
            ),
        ]
    )
    with pytest.raises(ValueError, match="max_por_dia"):
        resolver(inst)


def test_ocorrencias_apontam_as_aulas_do_excesso_e_da_concentracao():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-dist",
                tipo="distribuicao_disciplina",
                hard=False,
                peso=4,
                parametros={"max_por_dia": 2},
            )
        ]
    )
    grade = grade_fixa(
        [
            "mat mat mat mat",
            "mat mat por por",
            "mat mat por por",
            "por por his his",
            "por por his his",
        ]
    )

    [custo] = avaliar(inst, grade).custos

    # 4 de mat na segunda (2 acima do máximo) e mat em 3 dias (mínimo 4)
    excesso, concentrada = custo.ocorrencias
    assert (excesso.unidades, excesso.custo) == (2, 8)
    assert "segunda" in excesso.descricao and "Mat" in excesso.descricao
    assert [c.slot_id for c in excesso.celulas] == [f"manha-d0-h{h}" for h in range(4)]
    assert {c.turma_id for c in excesso.celulas} == {"t1"}
    assert (concentrada.unidades, concentrada.custo) == (1, 4)
    assert len(concentrada.celulas) == 8
    assert custo.custo == 12
