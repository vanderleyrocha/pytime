from conftest import instancia_minima

from pytime_engine import resolver
from pytime_engine.instancia import Disponibilidade, RegraConfig

REGRA = [RegraConfig(id="r-disp", tipo="disponibilidade_professor", hard=True)]


def test_professor_nao_alocado_em_slot_indisponivel():
    indisp = {f"manha-d0-h{h}": Disponibilidade.INDISPONIVEL for h in range(4)}
    inst = instancia_minima(
        disponibilidade={"prof-mat": indisp},
        regras=REGRA,
    )
    r = resolver(inst)
    assert r.status == "otimo"
    slots_mat = {a.slot_id for a in r.grade if a.atribuicao_id == "a-mat"}
    assert not slots_mat & set(indisp)  # nada na segunda-feira


def test_indisponibilidade_total_gera_inviavel():
    indisp = {
        f"manha-d{d}-h{h}": Disponibilidade.INDISPONIVEL
        for d in range(5)
        for h in range(4)
    }
    inst = instancia_minima(
        disponibilidade={"prof-mat": indisp},
        regras=REGRA,
    )
    r = resolver(inst)
    assert r.status == "inviavel"
    assert "disponibilidade:prof-mat" in r.nucleo_conflito
