from conftest import grade_fixa, instancia_minima

from pytime_engine import avaliar, resolver
from pytime_engine.instancia import Disponibilidade, RegraConfig
from pytime_engine.resultado import Celula

REGRA = RegraConfig(
    id="r-pref-dh", tipo="preferencia_disciplina_horario", hard=False, peso=5
)

GRADE = [
    "mat mat mat mat",
    "mat mat por por",
    "mat mat por por",
    "por por his his",
    "por por his his",
]


def _marcar(inst, disciplina_id, marcas):
    next(d for d in inst.disciplinas if d.id == disciplina_id).disponibilidade = marcas
    return inst


def test_solver_atende_o_evita_da_disciplina():
    evita = {f"manha-d{d}-h0": Disponibilidade.EVITA for d in range(5)}
    inst = _marcar(instancia_minima(regras=[REGRA]), "his", evita)
    r = resolver(inst)
    assert r.status == "otimo"
    slots_his = {a.slot_id for a in r.grade if a.atribuicao_id == "a-his"}
    assert not slots_his & set(evita)
    assert r.custo_total == 0


def test_evita_forcado_custa_por_aula_e_marca_a_turma():
    inst = _marcar(
        instancia_minima(regras=[REGRA]),
        "mat",
        {
            "manha-d0-h0": Disponibilidade.EVITA,
            "manha-d0-h1": Disponibilidade.EVITA,
            "manha-d4-h0": Disponibilidade.EVITA,  # sem mat na grade
        },
    )

    [custo] = avaliar(inst, grade_fixa(GRADE)).custos

    assert custo.custo == 2 * 5
    assert [(o.descricao, o.celulas) for o in custo.ocorrencias] == [
        (
            "Turma 1 – Mat: aula em horário evitado (segunda, 1º horário)",
            [Celula(slot_id="manha-d0-h0", turma_id="t1")],
        ),
        (
            "Turma 1 – Mat: aula em horário evitado (segunda, 2º horário)",
            [Celula(slot_id="manha-d0-h1", turma_id="t1")],
        ),
    ]


def test_prefere_cobra_aulas_fora_dos_preferidos():
    # his só prefere quinta; na grade ela está na quinta e na sexta (4 aulas)
    prefere = {f"manha-d3-h{h}": Disponibilidade.PREFERE for h in range(4)}
    inst = _marcar(instancia_minima(regras=[REGRA]), "his", prefere)

    [custo] = avaliar(inst, grade_fixa(GRADE)).custos

    assert custo.custo == 2 * 5
    assert [o.descricao for o in custo.ocorrencias] == [
        "Turma 1 – His: aula fora dos horários preferidos (sexta, 3º horário)",
        "Turma 1 – His: aula fora dos horários preferidos (sexta, 4º horário)",
    ]


def test_indisponivel_nao_e_tratado_aqui():
    indisp = {"manha-d0-h0": Disponibilidade.INDISPONIVEL}
    inst = _marcar(instancia_minima(regras=[REGRA]), "mat", indisp)
    assert avaliar(inst, grade_fixa(GRADE)).custo_total == 0
