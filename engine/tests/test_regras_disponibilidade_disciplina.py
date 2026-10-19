from conftest import instancia_minima

from pytime_engine import resolver
from pytime_engine.instancia import Disponibilidade, RegraConfig

REGRA = RegraConfig(id="r-disp-disc", tipo="disponibilidade_disciplina", hard=True)
SEGUNDA = {f"manha-d0-h{h}": Disponibilidade.INDISPONIVEL for h in range(4)}


def _com_disponibilidade(inst, disciplina_id, disponibilidade):
    disc = next(d for d in inst.disciplinas if d.id == disciplina_id)
    disc.disponibilidade = disponibilidade
    return inst


def test_disciplina_nao_alocada_em_slot_indisponivel():
    inst = _com_disponibilidade(instancia_minima(regras=[REGRA]), "mat", SEGUNDA)
    r = resolver(inst)
    assert r.status == "otimo"
    slots_mat = {a.slot_id for a in r.grade if a.atribuicao_id == "a-mat"}
    assert not slots_mat & set(SEGUNDA)


def test_prefere_e_evita_nao_bloqueiam():
    marcas = {"manha-d0-h0": Disponibilidade.EVITA}
    inst = _com_disponibilidade(
        instancia_minima(cargas={"mat": 20}, regras=[REGRA]), "mat", marcas
    )
    assert resolver(inst).status == "otimo"


def test_regra_inativa_nao_restringe():
    inativa = REGRA.model_copy(update={"ativa": False})
    inst = _com_disponibilidade(
        instancia_minima(cargas={"mat": 20}, regras=[inativa]), "mat", SEGUNDA
    )
    assert resolver(inst).status == "otimo"


def test_carga_maior_que_horarios_livres_gera_inviavel():
    # indisponível de terça a sexta: sobram 4 horários para as 8 aulas
    indisp = {
        f"manha-d{d}-h{h}": Disponibilidade.INDISPONIVEL
        for d in range(1, 5)
        for h in range(4)
    }
    inst = _com_disponibilidade(instancia_minima(regras=[REGRA]), "mat", indisp)
    r = resolver(inst)
    assert r.status == "inviavel"
    assert "disponibilidade_disciplina:mat" in r.nucleo_conflito
