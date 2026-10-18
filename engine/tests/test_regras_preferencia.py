from conftest import grade_fixa, instancia_minima

from pytime_engine import avaliar, resolver
from pytime_engine.instancia import Disponibilidade, RegraConfig
from pytime_engine.resultado import Celula


def ordens_da_atribuicao(grade, atribuicao_id):
    return [
        int(a.slot_id.split("-")[2][1:])
        for a in grade
        if a.atribuicao_id == atribuicao_id
    ]


def test_professor_evita_slot_e_atendido():
    evita = {f"manha-d{d}-h0": Disponibilidade.EVITA for d in range(5)}
    inst = instancia_minima(
        disponibilidade={"prof-his": evita},
        regras=[
            RegraConfig(
                id="r-pref-p", tipo="preferencia_professor", hard=False, peso=10
            )
        ],
    )
    r = resolver(inst)
    assert r.status == "otimo"
    # his tem 4 aulas e 15 slots fora do h0: dá para atender tudo
    assert all(o != 0 for o in ordens_da_atribuicao(r.grade, "a-his"))
    assert r.custo_total == 0


def test_disciplina_pesada_cedo():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-pref-d",
                tipo="preferencia_disciplina",
                hard=False,
                peso=10,
                parametros={
                    "disciplina_id": "mat",
                    "ordens": [0, 1],
                    "modo": "prefere",
                },
            ),
        ]
    )
    r = resolver(inst)
    assert r.status == "otimo"
    # 8 aulas de mat cabem nos 10 slots de ordem 0/1 -> custo 0
    assert all(o in (0, 1) for o in ordens_da_atribuicao(r.grade, "a-mat"))
    assert r.custo_total == 0


GRADE = [
    "mat mat mat mat",
    "mat mat por por",
    "mat mat por por",
    "por por his his",
    "por por his his",
]


def test_preferencia_professor_marca_a_aula_na_grade_do_professor():
    inst = instancia_minima(
        regras=[RegraConfig(id="r-pref-p", tipo="preferencia_professor", hard=False)],
        disponibilidade={"prof-mat": {"manha-d0-h0": Disponibilidade.EVITA}},
    )

    [custo] = avaliar(inst, grade_fixa(GRADE)).custos

    [ocorrencia] = custo.ocorrencias
    assert ocorrencia.celulas == [
        Celula(slot_id="manha-d0-h0", professor_id="prof-mat")
    ]
    assert ocorrencia.descricao == (
        "prof-mat: aula em horário evitado (segunda, 1º horário)"
    )


def test_preferencia_disciplina_marca_a_aula_na_grade_da_turma():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-pref-d",
                tipo="preferencia_disciplina",
                hard=False,
                parametros={"disciplina_id": "mat", "ordens": [3], "modo": "evita"},
            )
        ],
    )

    [custo] = avaliar(inst, grade_fixa(GRADE)).custos

    [ocorrencia] = custo.ocorrencias
    assert ocorrencia.celulas == [Celula(slot_id="manha-d0-h3", turma_id="t1")]
    assert ocorrencia.descricao == (
        "Turma 1 – Mat: aula em horário evitado (segunda, 4º horário)"
    )


def test_preferencia_professor_prefere_marca_aulas_fora_dos_preferidos():
    preferidos = {
        f"manha-d{d}-h{h}": Disponibilidade.PREFERE for d in range(5) for h in range(4)
    }
    del preferidos["manha-d3-h3"]  # his na quinta, 4º horário: fora dos preferidos
    inst = instancia_minima(
        regras=[RegraConfig(id="r-pref-p", tipo="preferencia_professor", hard=False)],
        disponibilidade={"prof-his": preferidos},
    )

    [custo] = avaliar(inst, grade_fixa(GRADE)).custos

    [ocorrencia] = custo.ocorrencias
    assert ocorrencia.celulas == [
        Celula(slot_id="manha-d3-h3", professor_id="prof-his")
    ]
    assert ocorrencia.descricao == (
        "prof-his: aula fora dos horários preferidos (quinta, 4º horário)"
    )


def test_preferencia_disciplina_prefere_marca_aulas_fora_das_ordens():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-pref-d",
                tipo="preferencia_disciplina",
                hard=False,
                parametros={"disciplina_id": "his", "ordens": [2], "modo": "prefere"},
            )
        ],
    )

    [custo] = avaliar(inst, grade_fixa(GRADE)).custos

    assert [o.celulas for o in custo.ocorrencias] == [
        [Celula(slot_id="manha-d3-h3", turma_id="t1")],
        [Celula(slot_id="manha-d4-h3", turma_id="t1")],
    ]
    assert custo.ocorrencias[0].descricao == (
        "Turma 1 – His: aula fora dos horários preferidos (quinta, 4º horário)"
    )
