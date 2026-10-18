import pytest
from conftest import grade_fixa, instancia_minima
from pydantic import ValidationError

from pytime_engine import avaliar, resolver
from pytime_engine.instancia import RegraConfig
from pytime_engine.ocorrencias import (
    GradeResolvida,
    aulas_em,
    do_dia,
    janelas_em,
    no_dia,
    nome_dia,
)
from pytime_engine.resultado import Celula

# mat 8, por 8, his 4 (instancia_minima): professores prof-mat/prof-por/prof-his
GRADE = [
    "por his por his",
    "his his por por",
    "mat mat por por",
    "mat mat mat mat",
    "mat mat por por",
]


def test_aulas_em_marca_so_os_slots_ocupados_no_eixo_pedido():
    inst = instancia_minima()
    g = GradeResolvida(inst, grade_fixa(GRADE))
    slots_d0 = [f"manha-d0-h{h}" for h in range(4)]

    assert aulas_em(["a-por"], slots_d0, "turma")(g) == [
        Celula(slot_id="manha-d0-h0", turma_id="t1"),
        Celula(slot_id="manha-d0-h2", turma_id="t1"),
    ]
    assert aulas_em(["a-his"], slots_d0, "professor")(g) == [
        Celula(slot_id="manha-d0-h1", professor_id="prof-his"),
        Celula(slot_id="manha-d0-h3", professor_id="prof-his"),
    ]


def test_janelas_em_marca_os_horarios_vagos_entre_a_primeira_e_a_ultima_aula():
    inst = instancia_minima()
    g = GradeResolvida(inst, grade_fixa(GRADE))

    assert janelas_em("prof-por", [f"manha-d0-h{h}" for h in range(4)])(g) == [
        Celula(slot_id="manha-d0-h1", professor_id="prof-por")
    ]
    assert janelas_em("prof-por", [f"manha-d1-h{h}" for h in range(4)])(g) == []


def test_avaliacao_lista_uma_ocorrencia_por_termo_violado_com_custo_e_unidades():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-ult",
                tipo="ultimo_horario",
                hard=False,
                peso=5,
                parametros={"disciplina_id": "his"},
            ),
        ],
    )

    av = avaliar(inst, grade_fixa(GRADE))

    [custo] = av.custos
    # his no último horário só na segunda (d0-h3)
    [ocorrencia] = custo.ocorrencias
    assert ocorrencia.unidades == 1
    assert ocorrencia.custo == 5 == custo.custo
    assert ocorrencia.celulas == [Celula(slot_id="manha-d0-h3", turma_id="t1")]
    assert ocorrencia.descricao in custo.detalhes


def test_resolver_tambem_preenche_ocorrencias_coerentes_com_o_custo():
    inst = instancia_minima(
        cargas={"mat": 12, "por": 8},
        regras=[
            RegraConfig(
                id="r-dist",
                tipo="distribuicao_disciplina",
                hard=False,
                peso=3,
                parametros={"max_por_dia": 2},
            )
        ],
    )

    r = resolver(inst)

    [custo] = r.custos
    assert custo.ocorrencias
    assert sum(o.custo for o in custo.ocorrencias) == custo.custo == 6
    assert all(o.celulas for o in custo.ocorrencias)


def test_nomes_de_dia_com_artigo_e_fora_da_semana():
    assert (no_dia(0), do_dia(4)) == ("na segunda", "da sexta")
    assert (no_dia(5), do_dia(6)) == ("no sábado", "do domingo")
    assert nome_dia(7) == "dia 8"


@pytest.mark.parametrize(
    "eixos", [{}, {"turma_id": "t1", "professor_id": "p1"}], ids=["nenhum", "dois"]
)
def test_celula_exige_exatamente_um_eixo(eixos):
    with pytest.raises(ValidationError, match="turma_id ou professor_id"):
        Celula(slot_id="s1", **eixos)
