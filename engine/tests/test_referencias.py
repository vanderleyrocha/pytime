from conftest import instancia_minima
from pytime_engine import resolver


def test_professor_id_inexistente_e_inviavel():
    inst = instancia_minima()
    inst.atribuicoes[0].professor_id = "prof-fantasma"
    r = resolver(inst)
    assert r.status == "inviavel"
    assert any("prof-fantasma" in erro for erro in r.nucleo_conflito)


def test_disciplina_id_inexistente_e_inviavel():
    inst = instancia_minima()
    inst.atribuicoes[0].disciplina_id = "disc-fantasma"
    r = resolver(inst)
    assert r.status == "inviavel"
    assert any("disc-fantasma" in erro for erro in r.nucleo_conflito)


def test_turma_id_inexistente_e_inviavel():
    inst = instancia_minima()
    inst.atribuicoes[0].turma_id = "turma-fantasma"
    r = resolver(inst)
    assert r.status == "inviavel"
    assert any("turma-fantasma" in erro for erro in r.nucleo_conflito)


def test_recurso_id_inexistente_e_inviavel():
    inst = instancia_minima()
    inst.atribuicoes[0].recurso_ids = ["recurso-fantasma"]
    r = resolver(inst)
    assert r.status == "inviavel"
    assert any("recurso-fantasma" in erro for erro in r.nucleo_conflito)


def test_turno_id_inexistente_na_turma_e_inviavel():
    inst = instancia_minima()
    inst.turmas[0].turno_id = "turno-fantasma"
    r = resolver(inst)
    assert r.status == "inviavel"
    assert any("turno-fantasma" in erro for erro in r.nucleo_conflito)


def test_turno_id_inexistente_no_slot_e_inviavel():
    inst = instancia_minima()
    inst.slots[0].turno_id = "turno-fantasma"
    r = resolver(inst)
    assert r.status == "inviavel"
    assert any("turno-fantasma" in erro for erro in r.nucleo_conflito)


def test_instancia_valida_sem_erros_referenciais():
    inst = instancia_minima()
    assert inst.validar_referencias() == []
