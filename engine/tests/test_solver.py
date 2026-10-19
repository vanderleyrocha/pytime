from collections import Counter

from conftest import instancia_minima

from pytime_engine import resolver
from pytime_engine.instancia import Professor, Turma


def test_resolve_instancia_minima():
    inst = instancia_minima()
    r = resolver(inst)
    assert r.status == "otimo"  # sem soft rules, custo 0 é ótimo
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
    inst.atribuicoes[0].carga_semanal = 7  # 19 aulas para 20 slots
    r = resolver(inst)
    assert r.status == "inviavel"
    assert any("Turma 1" in m for m in r.nucleo_conflito)


def test_regra_desconhecida_levanta_erro():
    import pytest

    from pytime_engine.instancia import RegraConfig

    inst = instancia_minima(
        regras=[
            RegraConfig(id="r1", tipo="nao_existe", hard=True),
        ]
    )
    with pytest.raises(ValueError, match="nao_existe"):
        resolver(inst)


def test_turma_sem_aula_em_slots_indisponiveis():
    inst = instancia_minima()
    inst.turmas[0].disponibilidade = {
        "manha-d4-h2": "indisponivel",
        "manha-d4-h3": "indisponivel",
    }
    next(a for a in inst.atribuicoes if a.id == "a-his").carga_semanal = 2
    r = resolver(inst)
    assert r.status == "otimo"
    assert len(r.grade) == 18
    assert {a.slot_id for a in r.grade}.isdisjoint({"manha-d4-h2", "manha-d4-h3"})


def test_turmas_com_indisponibilidades_diferentes_e_professor_comum():
    inst = instancia_minima()
    t2 = Turma(
        id="t2",
        nome="Turma 2",
        turno_id="manha",
        disponibilidade={"manha-d0-h0": "indisponivel"},
    )
    inst.turmas[0].disponibilidade = {"manha-d4-h3": "indisponivel"}
    inst.turmas.append(t2)
    # turma 1: mat 8, por 8, his 3; turma 2: mat 8 (mesmo prof), por 8, his 3
    next(a for a in inst.atribuicoes if a.id == "a-his").carga_semanal = 3
    novas = [
        a.model_copy(update={"id": f"{a.id}-t2", "turma_id": "t2"})
        for a in inst.atribuicoes
    ]
    for a in novas:
        if a.disciplina_id != "mat":
            a.professor_id = f"{a.professor_id}-t2"
            inst.professores.append(Professor(id=a.professor_id, nome=a.professor_id))
    inst.atribuicoes.extend(novas)
    r = resolver(inst)
    assert r.status in ("otimo", "viavel")
    slots_t2 = {a.slot_id for a in r.grade if a.atribuicao_id.endswith("-t2")}
    assert "manha-d0-h0" not in slots_t2
    slots_t1 = {a.slot_id for a in r.grade if not a.atribuicao_id.endswith("-t2")}
    assert "manha-d4-h3" not in slots_t1
    mat = [a.slot_id for a in r.grade if a.atribuicao_id.startswith("a-mat")]
    assert len(mat) == len(set(mat)) == 16
