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


def slots_semana(turno_id: str, dias: int = 5, por_dia: int = 4) -> list[Slot]:
    return [
        Slot(id=f"{turno_id}-d{d}-h{h}", dia=d, ordem=h, turno_id=turno_id)
        for d in range(dias)
        for h in range(por_dia)
    ]


def instancia_minima(
    dias: int = 5,
    por_dia: int = 4,
    cargas: dict[str, int] | None = None,  # disciplina -> carga da turma única
    professores_por_disciplina: dict[str, str] | None = None,
    regras: list[RegraConfig] | None = None,
    recursos: list[Recurso] | None = None,
    geminadas: dict[str, int] | None = None,  # disciplina -> nº pares
    recurso_ids: dict[str, list[str]] | None = None,  # disciplina -> recursos
    disponibilidade: dict[str, dict] | None = None,  # professor -> {slot: status}
) -> Instancia:
    """Uma turma, um turno; cargas devem somar dias*por_dia (matriz cheia)."""
    cargas = cargas or {"mat": 8, "por": 8, "his": 4}
    assert sum(cargas.values()) == dias * por_dia
    profs = professores_por_disciplina or {d: f"prof-{d}" for d in cargas}
    geminadas = geminadas or {}
    recurso_ids = recurso_ids or {}
    disponibilidade = disponibilidade or {}
    return Instancia(
        turnos=[Turno(id="manha", nome="Manhã")],
        slots=slots_semana("manha", dias, por_dia),
        turmas=[Turma(id="t1", nome="Turma 1", turno_id="manha")],
        disciplinas=[Disciplina(id=d, nome=d.capitalize()) for d in cargas],
        professores=[
            Professor(id=p, nome=p, disponibilidade=disponibilidade.get(p, {}))
            for p in sorted(set(profs.values()))
        ],
        atribuicoes=[
            Atribuicao(
                id=f"a-{d}",
                professor_id=profs[d],
                disciplina_id=d,
                turma_id="t1",
                carga_semanal=c,
                geminadas=geminadas.get(d, 0),
                recurso_ids=recurso_ids.get(d, []),
            )
            for d, c in cargas.items()
        ],
        recursos=recursos or [],
        regras=regras or [],
        budget_segundos=10,
    )
