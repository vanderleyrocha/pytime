import random

from .instancia import (
    Atribuicao,
    Disciplina,
    Disponibilidade,
    Instancia,
    Professor,
    Recurso,
    RegraConfig,
    Slot,
    Turma,
    Turno,
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
        for t in turnos
        for d in range(DIAS)
        for h in range(SLOTS_DIA)
    ]
    turmas = [
        Turma(id=f"turma-{i}", nome=f"Turma {i}", turno_id=turnos[i % len(turnos)].id)
        for i in range(n_turmas)
    ]
    disciplinas = [Disciplina(id=n, nome=n.title()) for n, *_ in CURRICULO]

    turmas_do_turno: dict[str, list[Turma]] = {t.id: [] for t in turnos}
    for turma in turmas:
        turmas_do_turno[turma.turno_id].append(turma)

    # professores são escopados por turno (um professor não dá aula em dois
    # turnos ao mesmo tempo neste gerador) para que a atribuição por
    # rodízio abaixo limite a carga de cada um a no máx. ~1,5 turma por
    # disciplina — o suficiente para caber nos DIAS * SLOTS_DIA slots do
    # turno mesmo somando a carga semanal de todas as disciplinas.
    professores: list[Professor] = []
    # (turno_id, nome_disciplina) -> lista de ids de professor
    prof_por_turno_disciplina: dict[tuple[str, str], list[str]] = {}
    for turno in turnos:
        n_turmas_turno = len(turmas_do_turno[turno.id])
        for nome, *_ in CURRICULO:
            qtd = max(1, round(n_turmas_turno / 1.5))
            ids = [f"prof-{nome}-{turno.id}-{k}" for k in range(qtd)]
            prof_por_turno_disciplina[(turno.id, nome)] = ids
            for pid in ids:
                disponibilidade: dict[str, Disponibilidade] = {}
                if rng.random() < 0.10:  # 10%: um dia indisponível
                    dia = rng.randrange(DIAS)
                    disponibilidade = {
                        f"{turno.id}-d{dia}-h{h}": Disponibilidade.INDISPONIVEL
                        for h in range(SLOTS_DIA)
                    }
                if rng.random() < 0.15:  # 15%: evita o último horário
                    dia = rng.randrange(DIAS)
                    disponibilidade.setdefault(
                        f"{turno.id}-d{dia}-h4",
                        Disponibilidade.EVITA,
                    )
                if rng.random() < 0.15:  # 15%: prefere os 2 primeiros
                    dia = rng.randrange(DIAS)
                    for h in (0, 1):
                        disponibilidade.setdefault(
                            f"{turno.id}-d{dia}-h{h}",
                            Disponibilidade.PREFERE,
                        )
                professores.append(
                    Professor(
                        id=pid,
                        nome=pid,
                        disponibilidade=disponibilidade,
                    )
                )

    # nº de laboratórios escala com a demanda para não sobrecarregar um
    # único recurso compartilhado (cada turma usa 3 aulas de ciências por
    # semana; cada turno tem DIAS * SLOTS_DIA slots disponíveis).
    turmas_por_turno = -(-n_turmas // len(turnos))  # ceil
    n_labs = max(1, -(-(turmas_por_turno * 3) // (DIAS * SLOTS_DIA)))
    labs = [f"lab-info-{k}" for k in range(n_labs)]

    # contagem por turno (não pelo índice global) para distribuir as turmas
    # de cada turno de forma equilibrada entre os laboratórios e entre os
    # professores da disciplina (rodízio, não sorteio, para limitar a carga
    # máxima de qualquer professor e evitar instâncias inviáveis por
    # sobrecarga): turmas de turnos diferentes nunca disputam o mesmo slot,
    # então o que importa é balancear a demanda dentro de cada turno.
    contagem_turno: dict[str, int] = {}
    atribuicoes = []
    for turma in turmas:
        idx_no_turno = contagem_turno.get(turma.turno_id, 0)
        contagem_turno[turma.turno_id] = idx_no_turno + 1
        for nome, carga, geminada, usa_lab in CURRICULO:
            profs = prof_por_turno_disciplina[(turma.turno_id, nome)]
            prof = profs[idx_no_turno % len(profs)]
            atribuicoes.append(
                Atribuicao(
                    id=f"{turma.id}-{nome}",
                    professor_id=prof,
                    disciplina_id=nome,
                    turma_id=turma.id,
                    carga_semanal=carga,
                    geminadas=1 if geminada and carga >= 4 else 0,
                    recurso_ids=[labs[idx_no_turno % n_labs]] if usa_lab else [],
                )
            )

    regras = [
        RegraConfig(id="disp", tipo="disponibilidade_professor", hard=True),
        RegraConfig(id="gem", tipo="geminadas", hard=True),
        RegraConfig(id="rec", tipo="recurso_compartilhado", hard=True),
        RegraConfig(id="jan", tipo="janelas_professor", hard=False, peso=10),
        RegraConfig(
            id="dist",
            tipo="distribuicao_disciplina",
            hard=False,
            peso=5,
            parametros={"max_por_dia": 2},
        ),
        RegraConfig(id="pref", tipo="preferencia_professor", hard=False, peso=3),
        RegraConfig(id="comp", tipo="compactacao_dias", hard=False, peso=1),
    ]
    return Instancia(
        turnos=turnos,
        slots=slots,
        turmas=turmas,
        disciplinas=disciplinas,
        professores=professores,
        atribuicoes=atribuicoes,
        recursos=[
            Recurso(id=lab, nome=f"Lab. Informática {k}", capacidade=1)
            for k, lab in enumerate(labs)
        ],
        regras=regras,
    )
