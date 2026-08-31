from conftest import instancia_minima
from pytime_engine import resolver
from pytime_engine.instancia import Disponibilidade, RegraConfig


def test_nucleo_aponta_so_o_professor_em_choque():
    # prof-mat indisponível a semana toda; prof-por livre.
    indisp = {
        f"manha-d{d}-h{h}": Disponibilidade.INDISPONIVEL
        for d in range(5) for h in range(4)
    }
    inst = instancia_minima(
        disponibilidade={"prof-mat": indisp},
        regras=[
            RegraConfig(id="r-disp", tipo="disponibilidade_professor",
                        hard=True),
            RegraConfig(id="r-gem", tipo="geminadas", hard=True),
        ],
    )
    r = resolver(inst)
    assert r.status == "inviavel"
    assert "disponibilidade:prof-mat" in r.nucleo_conflito
    # o núcleo não deve arrastar professores sem conflito
    assert "disponibilidade:prof-por" not in r.nucleo_conflito
    assert "disponibilidade:prof-his" not in r.nucleo_conflito


def test_instancia_viavel_tem_nucleo_vazio():
    inst = instancia_minima(regras=[
        RegraConfig(id="r-disp", tipo="disponibilidade_professor", hard=True),
    ])
    r = resolver(inst)
    assert r.status == "otimo"
    assert r.nucleo_conflito == []
