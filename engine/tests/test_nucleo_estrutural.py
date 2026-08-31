from pytime_engine import resolver
from pytime_engine.instancia import (
    Atribuicao, Disciplina, Instancia, Professor, Slot, Turma, Turno,
)


def _instancia_estruturalmente_inviavel() -> Instancia:
    """2 turmas no mesmo turno de 2 slots; 1 professor dá aula nas duas,
    carga 2 em cada (matriz cheia por turma), mas precisaria de 4 slots
    distintos para o professor e só existem 2 -> inviável sem nenhuma
    regra hard/assumption envolvida."""
    return Instancia(
        turnos=[Turno(id="manha", nome="Manhã")],
        slots=[
            Slot(id="s1", dia=0, ordem=0, turno_id="manha"),
            Slot(id="s2", dia=0, ordem=1, turno_id="manha"),
        ],
        turmas=[
            Turma(id="t1", nome="Turma 1", turno_id="manha"),
            Turma(id="t2", nome="Turma 2", turno_id="manha"),
        ],
        disciplinas=[Disciplina(id="mat", nome="Matemática")],
        professores=[Professor(id="p1", nome="Prof 1")],
        atribuicoes=[
            Atribuicao(id="a1", professor_id="p1", disciplina_id="mat",
                       turma_id="t1", carga_semanal=2),
            Atribuicao(id="a2", professor_id="p1", disciplina_id="mat",
                       turma_id="t2", carga_semanal=2),
        ],
        budget_segundos=10,
    )


def test_nucleo_estrutural_nao_fica_vazio():
    inst = _instancia_estruturalmente_inviavel()
    r = resolver(inst)
    assert r.status == "inviavel"
    assert r.nucleo_conflito != []
    assert any("estrutural" in m for m in r.nucleo_conflito)
