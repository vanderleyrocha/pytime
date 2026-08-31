from collections import defaultdict

from conftest import instancia_minima

from pytime_engine import resolver
from pytime_engine.instancia import RegraConfig

REGRA = [RegraConfig(id="r-gem", tipo="geminadas", hard=True)]


def pares_consecutivos(grade, atribuicao_id):
    """Conta pares de aulas consecutivas (mesmo dia) da atribuição."""
    ordens_por_dia = defaultdict(list)
    for a in grade:
        if a.atribuicao_id == atribuicao_id:
            # slot_id formato "manha-d{dia}-h{ordem}" (conftest)
            _, d, h = a.slot_id.split("-")
            ordens_por_dia[d].append(int(h[1:]))
    pares = 0
    for ordens in ordens_por_dia.values():
        ordens.sort()
        pares += sum(
            1 for o1, o2 in zip(ordens, ordens[1:], strict=False) if o2 == o1 + 1
        )
    return pares


def test_geminadas_exigidas_aparecem_na_grade():
    inst = instancia_minima(geminadas={"mat": 3}, regras=REGRA)
    r = resolver(inst)
    assert r.status == "otimo"
    assert pares_consecutivos(r.grade, "a-mat") >= 3


def test_geminadas_impossiveis_geram_inviavel():
    # carga 4 em turno de 4 slots/dia: máximo 3 pares num único dia,
    # mas exigir 4 pares é impossível.
    inst = instancia_minima(
        cargas={"mat": 4, "por": 8, "his": 8},
        geminadas={"mat": 4},
        regras=REGRA,
    )
    r = resolver(inst)
    assert r.status == "inviavel"
    assert "geminadas:a-mat" in r.nucleo_conflito
