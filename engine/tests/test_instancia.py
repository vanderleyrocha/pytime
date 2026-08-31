import pytest
from pydantic import ValidationError
from pytime_engine.instancia import (
    Atribuicao, Disciplina, Disponibilidade, Instancia, Professor,
    RegraConfig, Recurso, Slot, Turma, Turno,
)


def instancia_2slots() -> Instancia:
    return Instancia(
        turnos=[Turno(id="manha", nome="Manhã")],
        slots=[
            Slot(id="seg-1", dia=0, ordem=0, turno_id="manha"),
            Slot(id="seg-2", dia=0, ordem=1, turno_id="manha"),
        ],
        turmas=[Turma(id="6a", nome="6º A", turno_id="manha")],
        disciplinas=[Disciplina(id="mat", nome="Matemática")],
        professores=[Professor(id="ana", nome="Ana")],
        atribuicoes=[Atribuicao(
            id="a1", professor_id="ana", disciplina_id="mat",
            turma_id="6a", carga_semanal=2,
        )],
    )


def test_parse_roundtrip_json():
    inst = instancia_2slots()
    de_novo = Instancia.model_validate_json(inst.model_dump_json())
    assert de_novo == inst


def test_defaults():
    inst = instancia_2slots()
    assert inst.budget_segundos == 60.0
    assert inst.recursos == []
    assert inst.regras == []
    assert inst.atribuicoes[0].geminadas == 0
    assert inst.atribuicoes[0].recurso_ids == []
    assert inst.professores[0].disponibilidade == {}


def test_budget_maximo_240():
    inst = instancia_2slots()
    with pytest.raises(ValidationError):
        Instancia(**{**inst.model_dump(), "budget_segundos": 300})


def test_slots_do_turno_ordenados():
    inst = instancia_2slots()
    slots = inst.slots_do_turno("manha")
    assert [s.id for s in slots] == ["seg-1", "seg-2"]


def test_validar_matriz_cheia_ok():
    assert instancia_2slots().validar_matriz_cheia() == []


def test_validar_matriz_cheia_detecta_furo():
    inst = instancia_2slots()
    inst.atribuicoes[0].carga_semanal = 1  # 1 aula para 2 slots
    erros = inst.validar_matriz_cheia()
    assert len(erros) == 1
    assert "6º A" in erros[0]
