from conftest import instancia_minima

from pytime_engine import resolver
from pytime_engine.instancia import RegraConfig


def test_on_progress_recebe_custos_decrescentes():
    chamadas: list[tuple[int, float]] = []
    inst = instancia_minima(
        regras=[
            RegraConfig(id="r-jan", tipo="janelas_professor", hard=False, peso=1),
            RegraConfig(
                id="r-dist", tipo="distribuicao_disciplina", hard=False, peso=1
            ),
        ]
    )
    r = resolver(inst, on_progress=lambda c, t: chamadas.append((c, t)))
    assert r.status in ("otimo", "viavel")
    assert len(chamadas) >= 1
    custos = [c for c, _ in chamadas]
    assert custos == sorted(custos, reverse=True)  # nunca piora
    assert all(t >= 0 for _, t in chamadas)


def test_erro_no_callback_nao_derruba_solve():
    def bomba(custo, tempo):
        raise RuntimeError("boom")

    inst = instancia_minima(
        regras=[
            RegraConfig(id="r-jan", tipo="janelas_professor", hard=False, peso=1),
        ]
    )
    r = resolver(inst, on_progress=bomba)
    assert r.status in ("otimo", "viavel")
