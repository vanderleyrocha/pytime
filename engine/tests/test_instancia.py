import pytest
from pydantic import ValidationError

from pytime_engine.instancia import (
    Atribuicao,
    Disciplina,
    Disponibilidade,
    Instancia,
    Professor,
    Slot,
    Turma,
    Turno,
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
        atribuicoes=[
            Atribuicao(
                id="a1",
                professor_id="ana",
                disciplina_id="mat",
                turma_id="6a",
                carga_semanal=2,
            )
        ],
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


def test_budget_maximo_600():
    inst = instancia_2slots()
    aceita = Instancia(**{**inst.model_dump(), "budget_segundos": 600})
    assert aceita.budget_segundos == 600
    with pytest.raises(ValidationError):
        Instancia(**{**inst.model_dump(), "budget_segundos": 601})


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


def test_disponibilidade_de_turma_e_disciplina_default_vazio():
    inst = instancia_2slots()
    assert inst.turmas[0].disponibilidade == {}
    assert inst.disciplinas[0].disponibilidade == {}


def test_json_antigo_sem_disponibilidade_de_turma_e_disciplina_carrega():
    dados = instancia_2slots().model_dump()
    for t in dados["turmas"]:
        del t["disponibilidade"]
    for d in dados["disciplinas"]:
        del d["disponibilidade"]
    inst = Instancia.model_validate(dados)
    assert inst.turmas[0].disponibilidade == {}


@pytest.mark.parametrize("status", ["prefere", "evita"])
def test_turma_so_aceita_disponivel_ou_indisponivel(status):
    with pytest.raises(ValidationError, match="Turma só aceita"):
        Turma(id="6a", nome="6º A", turno_id="manha", disponibilidade={"x": status})


def test_disciplina_aceita_os_quatro_status():
    d = Disciplina(
        id="ef",
        nome="Ed. Física",
        disponibilidade={
            "a": "disponivel",
            "b": "indisponivel",
            "c": "prefere",
            "d": "evita",
        },
    )
    assert len(d.disponibilidade) == 4


def test_slots_da_turma_exclui_indisponiveis():
    inst = instancia_2slots()
    inst.turmas[0].disponibilidade = {"seg-2": Disponibilidade.INDISPONIVEL}
    assert [s.id for s in inst.slots_da_turma(inst.turmas[0])] == ["seg-1"]


def test_validar_matriz_cheia_conta_so_slots_disponiveis_da_turma():
    inst = instancia_2slots()
    inst.turmas[0].disponibilidade = {"seg-2": Disponibilidade.INDISPONIVEL}
    inst.atribuicoes[0].carga_semanal = 1
    assert inst.validar_matriz_cheia() == []
    inst.atribuicoes[0].carga_semanal = 2
    erros = inst.validar_matriz_cheia()
    assert erros == [
        "Turma 6º A: carga total 2 difere do número de horários disponíveis"
        " da turma (1 de 2 do turno)."
    ]
