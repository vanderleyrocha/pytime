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
    # prof-his dá 4 aulas; força indisponibilidade que cria janela na segunda:
    # disponível só em h0 e h2 na segunda -> se der 2 aulas na segunda, 1 janela.
    indisp = {"manha-d0-h1": Disponibilidade.INDISPONIVEL}
    # forçar as 4 aulas de his em 2 dias com furo é difícil de garantir;
    # em vez disso validamos que o custo reportado == janelas reais da grade.
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
    assert custo_jan.custo == contar_janelas(r.grade, ["a-his"]) + \
        contar_janelas(r.grade, ["a-mat"]) + contar_janelas(r.grade, ["a-por"])
