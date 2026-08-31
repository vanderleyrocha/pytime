from collections import Counter

from conftest import instancia_minima
from pytime_engine import Instancia, Resultado, resolver


def test_resolve_instancia_minima():
    inst = instancia_minima()
    r = resolver(inst)
    assert r.status == "otimo"          # sem soft rules, custo 0 é ótimo
    assert len(r.grade) == 20
    # slots todos distintos e cargas respeitadas
    slots = [a.slot_id for a in r.grade]
    assert len(set(slots)) == 20
    cargas = Counter(a.atribuicao_id for a in r.grade)
    assert cargas == {"a-mat": 8, "a-por": 8, "a-his": 4}
    assert r.tempo_segundos > 0
    assert r.custo_total == 0


def test_matriz_furada_e_inviavel_com_motivo():
    inst = instancia_minima()
    inst.atribuicoes[0].carga_semanal = 7   # 19 aulas para 20 slots
    r = resolver(inst)
    assert r.status == "inviavel"
    assert any("Turma 1" in m for m in r.nucleo_conflito)


def test_regra_desconhecida_levanta_erro():
    import pytest
    from pytime_engine.instancia import RegraConfig
    inst = instancia_minima(regras=[
        RegraConfig(id="r1", tipo="nao_existe", hard=True),
    ])
    with pytest.raises(ValueError, match="nao_existe"):
        resolver(inst)
