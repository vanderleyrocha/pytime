from collections import defaultdict

from conftest import instancia_minima

from pytime_engine import resolver
from pytime_engine.instancia import RegraConfig

DISPONIBILIDADE = RegraConfig(id="r-disp", tipo="disponibilidade_professor", hard=True)


def blocos_por_dia(grade, atribuicao_id):
    """Nº de blocos de aulas seguidas da atribuição em cada dia."""
    ordens_por_dia = defaultdict(list)
    for a in grade:
        if a.atribuicao_id == atribuicao_id:
            # slot_id formato "manha-d{dia}-h{ordem}" (conftest)
            _, d, h = a.slot_id.split("-")
            ordens_por_dia[d].append(int(h[1:]))
    blocos = {}
    for dia, ordens in ordens_por_dia.items():
        ordens.sort()
        blocos[dia] = 1 + sum(
            1 for o1, o2 in zip(ordens, ordens[1:], strict=False) if o2 != o1 + 1
        )
    return blocos


def test_aulas_juntas_hard_deixa_cada_disciplina_em_um_bloco_por_dia():
    inst = instancia_minima(
        regras=[RegraConfig(id="r-jun", tipo="aulas_juntas", hard=True)]
    )
    r = resolver(inst)
    assert r.status == "otimo"
    for atrib in ("a-mat", "a-por", "a-his"):
        assert all(n == 1 for n in blocos_por_dia(r.grade, atrib).values())


def test_aulas_juntas_hard_impossivel_gera_inviavel():
    # 1 dia, 3 horários: mat (2 aulas) com o professor indisponível no 2º
    # horário só cabe no 1º e no 3º — separadas.
    inst = instancia_minima(
        dias=1,
        por_dia=3,
        cargas={"mat": 2, "por": 1},
        disponibilidade={"prof-mat": {"manha-d0-h1": "indisponivel"}},
        regras=[
            DISPONIBILIDADE,
            RegraConfig(id="r-jun", tipo="aulas_juntas", hard=True),
        ],
    )
    r = resolver(inst)
    assert r.status == "inviavel"
    assert "aulas_juntas:t1" in r.nucleo_conflito


def test_aulas_juntas_soft_conta_os_blocos_extras():
    inst = instancia_minima(
        dias=1,
        por_dia=3,
        cargas={"mat": 2, "por": 1},
        disponibilidade={"prof-mat": {"manha-d0-h1": "indisponivel"}},
        regras=[
            DISPONIBILIDADE,
            RegraConfig(id="r-jun", tipo="aulas_juntas", hard=False, peso=3),
        ],
    )
    r = resolver(inst)
    assert r.status == "otimo"
    assert blocos_por_dia(r.grade, "a-mat") == {"d0": 2}
    custo = next(c for c in r.custos if c.regra_id == "r-jun")
    assert custo.custo == 3  # 1 bloco extra x peso 3


def test_aulas_juntas_considera_a_disciplina_mesmo_com_dois_professores():
    # mat dividida entre dois professores na mesma turma: as aulas de mat do
    # dia continuam tendo de ficar juntas.
    inst = instancia_minima(
        dias=1,
        por_dia=3,
        cargas={"mat": 2, "por": 1},
        regras=[RegraConfig(id="r-jun", tipo="aulas_juntas", hard=True)],
    )
    a_mat = inst.atribuicoes[0]
    outra = a_mat.model_copy(
        update={"id": "a-mat2", "professor_id": "prof-mat2", "carga_semanal": 1}
    )
    inst.atribuicoes[0] = a_mat.model_copy(update={"carga_semanal": 1})
    inst.atribuicoes.append(outra)
    inst.professores.append(
        inst.professores[0].model_copy(update={"id": "prof-mat2", "nome": "p2"})
    )
    r = resolver(inst)
    assert r.status == "otimo"
    ordens_mat = sorted(
        int(a.slot_id.split("-")[2][1:])
        for a in r.grade
        if a.atribuicao_id in ("a-mat", "a-mat2")
    )
    assert ordens_mat[1] == ordens_mat[0] + 1
