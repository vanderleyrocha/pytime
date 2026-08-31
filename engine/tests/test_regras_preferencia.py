from conftest import instancia_minima

from pytime_engine import resolver
from pytime_engine.instancia import Disponibilidade, RegraConfig


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
