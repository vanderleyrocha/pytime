from collections import defaultdict

from conftest import instancia_minima
from pytime_engine import resolver
from pytime_engine.instancia import Disponibilidade, RegraConfig


def contar_janelas(grade, prefixo_prof_atribs: list[str]) -> int:
    ordens_por_dia = defaultdict(list)
    for a in grade:
        if a.atribuicao_id in prefixo_prof_atribs:
            _, d, h = a.slot_id.split("-")
            ordens_por_dia[d].append(int(h[1:]))
    total = 0
    for ordens in ordens_por_dia.values():
        ordens.sort()
        total += (ordens[-1] - ordens[0] + 1) - len(ordens)
    return total


def test_solver_elimina_janelas_quando_possivel():
    inst = instancia_minima(regras=[
        RegraConfig(id="r-jan", tipo="janelas_professor",
                    hard=False, peso=10),
    ])
    r = resolver(inst)
    assert r.status == "otimo"
    # com uma única turma cada professor pode sempre ficar compacto
    assert contar_janelas(r.grade, ["a-mat"]) == 0
    assert r.custo_total == 0


def test_janela_forcada_e_reportada():
    # prof-his dá 4 aulas; disponível apenas em manha-d0-h0, manha-d0-h2,
    # manha-d1-h0, manha-d1-h2 (exatamente 4 slots = carga 4), forçando toda
    # a alocação: 2 dias com padrão h0,_,h2 -> exatamente 1 janela por dia.
    disponiveis = {"manha-d0-h0", "manha-d0-h2", "manha-d1-h0", "manha-d1-h2"}
    indisp = {
        f"manha-d{d}-h{h}": Disponibilidade.INDISPONIVEL
        for d in range(5) for h in range(4)
        if f"manha-d{d}-h{h}" not in disponiveis
    }
    inst = instancia_minima(
        disponibilidade={"prof-his": indisp},
        regras=[
            RegraConfig(id="r-disp", tipo="disponibilidade_professor",
                        hard=True),
            RegraConfig(id="r-jan", tipo="janelas_professor",
                        hard=False, peso=1),
        ],
    )
    r = resolver(inst)
    assert r.status == "otimo"
    custo_jan = next(c for c in r.custos if c.regra_id == "r-jan")
    assert custo_jan.custo == 2
    assert custo_jan.custo == contar_janelas(r.grade, ["a-his"])
