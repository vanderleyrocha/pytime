import random

from .instancia import (
    Atribuicao, Disciplina, Disponibilidade, Instancia, Professor,
    RegraConfig, Recurso, Slot, Turma, Turno,
)

# (nome, carga semanal, exige geminada, usa laboratório)
CURRICULO = [
    ("portugues", 5, True, False),
    ("matematica", 5, True, False),
    ("ciencias", 3, False, True),
    ("historia", 2, False, False),
    ("geografia", 2, False, False),
    ("ingles", 2, False, False),
    ("artes", 2, False, False),
    ("educacao-fisica", 2, True, False),
    ("ensino-religioso", 1, False, False),
    ("redacao", 1, False, False),
]  # soma 25 = 5 dias × 5 slots

DIAS, SLOTS_DIA = 5, 5


def gerar(n_turmas: int, seed: int = 0) -> Instancia:
    rng = random.Random(seed)
    turnos = [Turno(id="manha", nome="Manhã")]
    if n_turmas > 15:
        turnos.append(Turno(id="tarde", nome="Tarde"))
    slots = [
        Slot(id=f"{t.id}-d{d}-h{h}", dia=d, ordem=h, turno_id=t.id)
        for t in turnos for d in range(DIAS) for h in range(SLOTS_DIA)
    ]
    turmas = [
        Turma(id=f"turma-{i}", nome=f"Turma {i}",
              turno_id=turnos[i % len(turnos)].id)
        for i in range(n_turmas)
    ]
    disciplinas = [Disciplina(id=n, nome=n.title()) for n, *_ in CURRICULO]

    # ~1 professor a cada 1,5 turma por turno por disciplina, mínimo 1
    professores: list[Professor] = []
    prof_da_disciplina: dict[str, list[str]] = {}
    for nome, *_ in CURRICULO:
        qtd = max(1, round(n_turmas / 1.5 / len(turnos)))
        ids = [f"prof-{nome}-{k}" for k in range(qtd)]
        prof_da_disciplina[nome] = ids
        for pid in ids:
            disponibilidade: dict[str, Disponibilidade] = {}
            if rng.random() < 0.10:  # 10%: uma manhã indisponível
                dia = rng.randrange(DIAS)
                disponibilidade = {
                    f"manha-d{dia}-h{h}": Disponibilidade.INDISPONIVEL
                    for h in range(SLOTS_DIA)
                }
            if rng.random() < 0.15:  # 15%: evita o último horário de um dia
                dia = rng.randrange(DIAS)
                disponibilidade.setdefault(
                    f"manha-d{dia}-h4", Disponibilidade.EVITA,
                )
            if rng.random() < 0.15:  # 15%: prefere os 2 primeiros horários
                dia = rng.randrange(DIAS)
                for h in (0, 1):
                    disponibilidade.setdefault(
                        f"manha-d{dia}-h{h}", Disponibilidade.PREFERE,
                    )
            professores.append(Professor(
                id=pid, nome=pid, disponibilidade=disponibilidade,
            ))

    atribuicoes = []
    for turma in turmas:
        for nome, carga, geminada, usa_lab in CURRICULO:
            prof = rng.choice(prof_da_disciplina[nome])
            atribuicoes.append(Atribuicao(
                id=f"{turma.id}-{nome}",
                professor_id=prof, disciplina_id=nome, turma_id=turma.id,
                carga_semanal=carga,
                geminadas=1 if geminada and carga >= 4 else 0,
                recurso_ids=["lab-info"] if usa_lab else [],
            ))

    regras = [
        RegraConfig(id="disp", tipo="disponibilidade_professor", hard=True),
        RegraConfig(id="gem", tipo="geminadas", hard=True),
        RegraConfig(id="rec", tipo="recurso_compartilhado", hard=True),
        RegraConfig(id="jan", tipo="janelas_professor", hard=False, peso=10),
        RegraConfig(id="dist", tipo="distribuicao_disciplina", hard=False,
                    peso=5, parametros={"max_por_dia": 2}),
        RegraConfig(id="pref", tipo="preferencia_professor", hard=False,
                    peso=3),
        RegraConfig(id="comp", tipo="compactacao_dias", hard=False, peso=1),
    ]
    return Instancia(
        turnos=turnos, slots=slots, turmas=turmas, disciplinas=disciplinas,
        professores=professores, atribuicoes=atribuicoes,
        recursos=[Recurso(id="lab-info", nome="Lab. Informática",
                          capacidade=1)],
        regras=regras,
    )
