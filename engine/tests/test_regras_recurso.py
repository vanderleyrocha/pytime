from collections import Counter

from pytime_engine import resolver
from pytime_engine.instancia import (
    Atribuicao,
    Disciplina,
    Instancia,
    Professor,
    Recurso,
    RegraConfig,
    Slot,
    Turma,
    Turno,
)

REGRA = [RegraConfig(id="r-rec", tipo="recurso_compartilhado", hard=True)]


def duas_turmas_com_lab(carga_lab: int) -> Instancia:
    """Duas turmas no mesmo turno de 2 slots; 'lab' usa o laboratório."""
    slots = [Slot(id=f"m-d0-h{h}", dia=0, ordem=h, turno_id="m") for h in range(2)]
    return (
        Instancia(
            turnos=[Turno(id="m", nome="Manhã")],
            slots=slots,
            turmas=[
                Turma(id="t1", nome="T1", turno_id="m"),
                Turma(id="t2", nome="T2", turno_id="m"),
            ],
            disciplinas=[
                Disciplina(id="lab", nome="Lab"),
                Disciplina(id="por", nome="Português"),
            ],
            professores=[Professor(id=f"p{i}", nome=f"P{i}") for i in range(4)],
            recursos=[Recurso(id="laboratorio", nome="Laboratório", capacidade=1)],
            atribuicoes=[
                Atribuicao(
                    id="t1-lab",
                    professor_id="p0",
                    disciplina_id="lab",
                    turma_id="t1",
                    carga_semanal=carga_lab,
                    recurso_ids=["laboratorio"],
                ),
                Atribuicao(
                    id="t1-por",
                    professor_id="p1",
                    disciplina_id="por",
                    turma_id="t1",
                    carga_semanal=2 - carga_lab,
                ),
                Atribuicao(
                    id="t2-lab",
                    professor_id="p2",
                    disciplina_id="lab",
                    turma_id="t2",
                    carga_semanal=carga_lab,
                    recurso_ids=["laboratorio"],
                ),
                Atribuicao(
                    id="t2-por",
                    professor_id="p3",
                    disciplina_id="por",
                    turma_id="t2",
                    carga_semanal=2 - carga_lab,
                ),
            ],
            regras=REGRA,
            budget_segundos=10,
        )
        if carga_lab < 2
        else _instancia_saturada(slots)
    )


def _instancia_saturada(slots):
    # ambas as turmas precisam do lab nos 2 slots -> capacidade 1 estoura
    return Instancia(
        turnos=[Turno(id="m", nome="Manhã")],
        slots=slots,
        turmas=[
            Turma(id="t1", nome="T1", turno_id="m"),
            Turma(id="t2", nome="T2", turno_id="m"),
        ],
        disciplinas=[Disciplina(id="lab", nome="Lab")],
        professores=[Professor(id="p0", nome="P0"), Professor(id="p2", nome="P2")],
        recursos=[Recurso(id="laboratorio", nome="Laboratório", capacidade=1)],
        atribuicoes=[
            Atribuicao(
                id="t1-lab",
                professor_id="p0",
                disciplina_id="lab",
                turma_id="t1",
                carga_semanal=2,
                recurso_ids=["laboratorio"],
            ),
            Atribuicao(
                id="t2-lab",
                professor_id="p2",
                disciplina_id="lab",
                turma_id="t2",
                carga_semanal=2,
                recurso_ids=["laboratorio"],
            ),
        ],
        regras=REGRA,
        budget_segundos=10,
    )


def test_recurso_capacidade_1_sem_choque():
    r = resolver(duas_turmas_com_lab(1))
    assert r.status == "otimo"
    uso_por_slot = Counter(
        a.slot_id for a in r.grade if a.atribuicao_id.endswith("-lab")
    )
    assert all(v <= 1 for v in uso_por_slot.values())


def test_recurso_saturado_gera_inviavel():
    r = resolver(duas_turmas_com_lab(2))
    assert r.status == "inviavel"
    assert "recurso:laboratorio" in r.nucleo_conflito
