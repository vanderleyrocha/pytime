from conftest import instancia_minima
from pytime_engine import resolver
from pytime_engine.instancia import Disponibilidade, RegraConfig


def test_nucleo_aponta_so_o_professor_em_choque():
    # prof-mat indisponível a semana toda (causa real da inviabilidade);
    # prof-por tem uma restrição real mas satisfazível (1 slot só), o que
    # cria a assumption "disponibilidade:prof-por" no modelo sem tornar
    # nada inviável sozinha; geminadas=1 para "por" cria a assumption
    # "geminadas:a-por", também satisfazível. Isso garante que existam
    # assumptions concorrentes e satisfazíveis no modelo, tornando as
    # asserções de minimalidade abaixo capazes de falhar caso o núcleo
    # devolvido não seja mínimo.
    indisp = {
        f"manha-d{d}-h{h}": Disponibilidade.INDISPONIVEL
        for d in range(5) for h in range(4)
    }
    inst = instancia_minima(
        disponibilidade={
            "prof-mat": indisp,
            "prof-por": {"manha-d0-h0": Disponibilidade.INDISPONIVEL},
        },
        geminadas={"por": 1},
        regras=[
            RegraConfig(id="r-disp", tipo="disponibilidade_professor",
                        hard=True),
            RegraConfig(id="r-gem", tipo="geminadas", hard=True),
        ],
    )
    r = resolver(inst)
    assert r.status == "inviavel"
    assert "disponibilidade:prof-mat" in r.nucleo_conflito
    # o núcleo não deve arrastar professores/regras sem conflito real
    assert "disponibilidade:prof-por" not in r.nucleo_conflito
    assert "disponibilidade:prof-his" not in r.nucleo_conflito
    assert "geminadas:a-por" not in r.nucleo_conflito


def test_instancia_viavel_tem_nucleo_vazio():
    inst = instancia_minima(regras=[
        RegraConfig(id="r-disp", tipo="disponibilidade_professor", hard=True),
    ])
    r = resolver(inst)
    assert r.status == "otimo"
    assert r.nucleo_conflito == []
