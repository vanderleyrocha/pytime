from conftest import slots_semana

from pytime_engine import resolver
from pytime_engine.instancia import (
    Atribuicao,
    Disciplina,
    Instancia,
    Professor,
    RegraConfig,
    Turma,
    Turno,
)

DISPONIBILIDADE = RegraConfig(id="r-disp", tipo="disponibilidade_professor", hard=True)
SINCRONIZADA = RegraConfig(
    id="r-sinc",
    tipo="disciplina_sincronizada",
    hard=True,
    parametros={"disciplina_id": "ele"},
)


def duas_turmas(
    regras: list[RegraConfig],
    disponibilidade: dict[str, dict] | None = None,
    turno_t2: str = "manha",
) -> Instancia:
    """Turmas t1 e t2 (2 dias x 2 horários), cada uma com Eletiva (2 aulas,
    professor próprio) e Matemática (2 aulas)."""
    disponibilidade = disponibilidade or {}
    turnos = {"manha", turno_t2}
    profs = ["e1", "e2", "m1", "m2"]
    return Instancia(
        turnos=[Turno(id=t, nome=t) for t in sorted(turnos)],
        slots=[s for t in sorted(turnos) for s in slots_semana(t, 2, 2)],
        turmas=[
            Turma(id="t1", nome="T1", turno_id="manha"),
            Turma(id="t2", nome="T2", turno_id=turno_t2),
        ],
        disciplinas=[
            Disciplina(id="ele", nome="Eletiva"),
            Disciplina(id="mat", nome="Matemática"),
        ],
        professores=[
            Professor(id=p, nome=p, disponibilidade=disponibilidade.get(p, {}))
            for p in profs
        ],
        atribuicoes=[
            Atribuicao(
                id=f"a-{d}-{t}",
                professor_id=f"{d[0] if d == 'ele' else 'm'}{t[1]}",
                disciplina_id=d,
                turma_id=t,
                carga_semanal=2,
            )
            for t in ("t1", "t2")
            for d in ("ele", "mat")
        ],
        recursos=[],
        regras=regras,
        budget_segundos=10,
    )


def horarios(grade, atribuicao_id):
    """(dia, ordem) das aulas da atribuição — slot_id "turno-d{dia}-h{ordem}"."""
    return {
        tuple(a.slot_id.split("-")[1:])
        for a in grade
        if a.atribuicao_id == atribuicao_id
    }


# e1 só pode no dia 0 e e2 só no dia 1: a Eletiva não cabe nos mesmos
# horários das duas turmas.
CONFLITO = {
    "e1": {"manha-d1-h0": "indisponivel", "manha-d1-h1": "indisponivel"},
    "e2": {"manha-d0-h0": "indisponivel", "manha-d0-h1": "indisponivel"},
}


def test_sincronizada_poe_a_disciplina_nos_mesmos_horarios():
    r = resolver(duas_turmas([SINCRONIZADA]))
    assert r.status == "otimo"
    assert horarios(r.grade, "a-ele-t1") == horarios(r.grade, "a-ele-t2")


def test_sincronizada_hard_impossivel_gera_inviavel():
    sem_regra = resolver(duas_turmas([DISPONIBILIDADE], CONFLITO))
    assert sem_regra.status == "otimo"  # o conflito vem só da sincronização

    r = resolver(duas_turmas([DISPONIBILIDADE, SINCRONIZADA], CONFLITO))
    assert r.status == "inviavel"
    assert "disciplina_sincronizada:r-sinc" in r.nucleo_conflito


def test_sincronizada_soft_conta_os_horarios_desencontrados():
    soft = SINCRONIZADA.model_copy(update={"hard": False, "peso": 2})
    r = resolver(duas_turmas([DISPONIBILIDADE, soft], CONFLITO))
    assert r.status == "otimo"
    t1, t2 = horarios(r.grade, "a-ele-t1"), horarios(r.grade, "a-ele-t2")
    desencontrados = len(t1 ^ t2)  # horários com Eletiva em só uma turma
    assert desencontrados == 4
    custo = next(c for c in r.custos if c.regra_id == "r-sinc")
    assert custo.custo == desencontrados * 2


def test_sincronizada_so_alinha_turmas_do_mesmo_turno():
    # t2 em outro turno: horários diferentes, nada a alinhar; com o conflito
    # de disponibilidade (que só existe no turno da manhã) continua viável.
    r = resolver(
        duas_turmas([DISPONIBILIDADE, SINCRONIZADA], CONFLITO, turno_t2="tarde")
    )
    assert r.status == "otimo"
