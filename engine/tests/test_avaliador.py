from conftest import instancia_minima, slots_semana

from pytime_engine import avaliar, resolver
from pytime_engine.instancia import (
    Atribuicao,
    Disciplina,
    Disponibilidade,
    Instancia,
    Professor,
    RegraConfig,
    Turma,
    Turno,
)
from pytime_engine.resultado import AulaAlocada


def _grade_sem_regras(inst: Instancia) -> list[AulaAlocada]:
    """Grade viável da instância ignorando as regras do catálogo."""
    sem_regras = inst.model_copy(update={"regras": []})
    r = resolver(sem_regras)
    assert r.status == "otimo"
    return r.grade


def _trocar(grade: list[AulaAlocada], atrib_id: str, slot_id: str) -> None:
    """Coloca uma aula de `atrib_id` em `slot_id`, trocando com quem estava lá."""
    alvo = next(a for a in grade if a.slot_id == slot_id)
    origem = next(a for a in grade if a.atribuicao_id == atrib_id)
    if alvo is origem or alvo.atribuicao_id == atrib_id:
        return
    alvo.slot_id, origem.slot_id = origem.slot_id, alvo.slot_id


def test_grade_do_solver_nao_tem_violacoes_e_mesmo_custo():
    inst = instancia_minima(
        regras=[
            RegraConfig(id="r-disp", tipo="disponibilidade_professor", hard=True),
            RegraConfig(
                id="r-ult",
                tipo="ultimo_horario",
                hard=False,
                peso=3,
                parametros={"disciplina_id": "his"},
            ),
        ],
        disponibilidade={"prof-mat": {"manha-d0-h0": Disponibilidade.INDISPONIVEL}},
    )
    r = resolver(inst)
    assert r.status == "otimo"

    av = avaliar(inst, r.grade)

    assert av.violacoes_hard == []
    assert av.custo_total == r.custo_total
    assert av.tempo_segundos > 0


def test_ordem_da_grade_nao_importa():
    inst = instancia_minima()
    grade = _grade_sem_regras(inst)
    av = avaliar(inst, list(reversed(grade)))
    assert av.violacoes_hard == []


def test_aponta_regra_hard_violada():
    inst = instancia_minima(
        regras=[
            RegraConfig(id="r-disp", tipo="disponibilidade_professor", hard=True),
        ],
        disponibilidade={"prof-mat": {"manha-d0-h0": Disponibilidade.INDISPONIVEL}},
    )
    grade = _grade_sem_regras(inst)
    _trocar(grade, "a-mat", "manha-d0-h0")

    av = avaliar(inst, grade)

    assert av.violacoes_hard == ["disponibilidade:prof-mat"]


def test_lista_todas_as_violacoes_nao_so_um_nucleo():
    inst = instancia_minima(
        regras=[
            RegraConfig(id="r-disp", tipo="disponibilidade_professor", hard=True),
            RegraConfig(
                id="r-ult",
                tipo="ultimo_horario",
                hard=True,
                parametros={"disciplina_id": "his"},
            ),
        ],
        disponibilidade={
            "prof-mat": {"manha-d0-h0": Disponibilidade.INDISPONIVEL},
            "prof-por": {"manha-d1-h0": Disponibilidade.INDISPONIVEL},
        },
    )
    grade = _grade_sem_regras(inst)
    _trocar(grade, "a-mat", "manha-d0-h0")
    _trocar(grade, "a-por", "manha-d1-h0")
    _trocar(grade, "a-his", "manha-d2-h3")  # último horário da quarta

    av = avaliar(inst, grade)

    assert sorted(av.violacoes_hard) == [
        "disponibilidade:prof-mat",
        "disponibilidade:prof-por",
        "ultimo_horario:r-ult",
    ]


def test_soft_violada_entra_no_custo_sem_virar_violacao_hard():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-ult",
                tipo="ultimo_horario",
                hard=False,
                peso=5,
                parametros={"disciplina_id": "his"},
            ),
        ],
    )
    grade = _grade_sem_regras(inst)
    # coloca as 4 aulas de história em últimos horários distintos
    for dia, aula in enumerate(a for a in list(grade) if a.atribuicao_id == "a-his"):
        _trocar_aula(grade, aula, f"manha-d{dia}-h3")

    av = avaliar(inst, grade)

    assert av.violacoes_hard == []
    assert av.custo_total == 4 * 5
    [custo] = av.custos
    assert custo.regra_id == "r-ult"
    assert len(custo.detalhes) == 4


def _trocar_aula(grade: list[AulaAlocada], aula: AulaAlocada, slot_id: str) -> None:
    alvo = next(a for a in grade if a.slot_id == slot_id)
    alvo.slot_id, aula.slot_id = aula.slot_id, alvo.slot_id


def test_carga_diferente_e_estrutural():
    inst = instancia_minima()
    grade = _grade_sem_regras(inst)
    removida = next(a for a in grade if a.slot_id == "manha-d0-h0")
    grade = [a for a in grade if a is not removida]

    av = avaliar(inst, grade)

    assert f"estrutural:carga:{removida.atribuicao_id}" in av.violacoes_hard
    assert "estrutural:turma_vazio:t1:manha-d0-h0" in av.violacoes_hard
    assert av.custos == []


def test_turma_com_duas_aulas_no_mesmo_slot_e_estrutural():
    inst = instancia_minima()
    grade = _grade_sem_regras(inst)
    outra = next(a for a in grade if a.slot_id != "manha-d0-h0")
    vago = outra.slot_id
    outra.slot_id = "manha-d0-h0"

    av = avaliar(inst, grade)

    assert "estrutural:turma_duplo:t1:manha-d0-h0" in av.violacoes_hard
    assert f"estrutural:turma_vazio:t1:{vago}" in av.violacoes_hard


def test_aula_fora_do_turno_e_atribuicao_desconhecida_sao_estruturais():
    inst = instancia_minima()
    grade = _grade_sem_regras(inst)
    fora = grade[0]
    fora.slot_id = "slot-inexistente"
    grade.append(AulaAlocada(atribuicao_id="a-fantasma", slot_id="manha-d0-h0"))

    av = avaliar(inst, grade)

    assert (
        f"estrutural:fora_do_turno:{fora.atribuicao_id}:slot-inexistente"
        in av.violacoes_hard
    )
    assert "estrutural:atribuicao_desconhecida:a-fantasma" in av.violacoes_hard


def test_professor_em_duas_turmas_no_mesmo_slot_e_estrutural():
    slots = slots_semana("manha", dias=1, por_dia=2)
    inst = Instancia(
        turnos=[Turno(id="manha", nome="Manhã")],
        slots=slots,
        turmas=[
            Turma(id="t1", nome="Turma 1", turno_id="manha"),
            Turma(id="t2", nome="Turma 2", turno_id="manha"),
        ],
        disciplinas=[
            Disciplina(id="mat", nome="Mat"),
            Disciplina(id="por", nome="Por"),
        ],
        professores=[Professor(id="p1", nome="P1"), Professor(id="p2", nome="P2")],
        atribuicoes=[
            Atribuicao(
                id="a1",
                professor_id="p1",
                disciplina_id="mat",
                turma_id="t1",
                carga_semanal=1,
            ),
            Atribuicao(
                id="a2",
                professor_id="p2",
                disciplina_id="por",
                turma_id="t1",
                carga_semanal=1,
            ),
            Atribuicao(
                id="a3",
                professor_id="p1",
                disciplina_id="mat",
                turma_id="t2",
                carga_semanal=1,
            ),
            Atribuicao(
                id="a4",
                professor_id="p2",
                disciplina_id="por",
                turma_id="t2",
                carga_semanal=1,
            ),
        ],
    )
    s0, s1 = slots[0].id, slots[1].id
    grade = [
        AulaAlocada(atribuicao_id="a1", slot_id=s0),
        AulaAlocada(atribuicao_id="a2", slot_id=s1),
        AulaAlocada(atribuicao_id="a3", slot_id=s0),  # p1 em t1 e t2 ao mesmo tempo
        AulaAlocada(atribuicao_id="a4", slot_id=s1),
    ]

    av = avaliar(inst, grade)

    assert av.violacoes_hard == [
        f"estrutural:professor_duplo:p1:{s0}",
        f"estrutural:professor_duplo:p2:{s1}",
    ]


def _grade_por_dia(dias: list[list[str]]) -> list[AulaAlocada]:
    """Grade da turma única de `instancia_minima` a partir das disciplinas por dia."""
    return [
        AulaAlocada(atribuicao_id=f"a-{disc}", slot_id=f"manha-d{d}-h{h}")
        for d, aulas in enumerate(dias)
        for h, disc in enumerate(aulas)
    ]


#: dia 0 com janela para prof-mat e prof-por; história toda na sexta
GRADE_COM_JANELAS = _grade_por_dia(
    [["mat", "por", "mat", "por"]] + [["mat", "mat", "por", "por"]] * 3 + [["his"] * 4]
)


def test_custo_de_janelas_e_o_minimo_nao_a_folga():
    inst = instancia_minima(
        regras=[RegraConfig(id="r-jan", tipo="janelas_professor", hard=False)]
    )
    av = avaliar(inst, GRADE_COM_JANELAS)
    assert av.violacoes_hard == []
    assert av.custo_total == 2  # uma janela de prof-mat e uma de prof-por


def test_custo_de_distribuicao_e_o_minimo_nao_a_folga():
    inst = instancia_minima(
        regras=[
            RegraConfig(
                id="r-dist",
                tipo="distribuicao_disciplina",
                hard=False,
                parametros={"max_por_dia": 2},
            )
        ]
    )
    av = avaliar(inst, GRADE_COM_JANELAS)
    # história: 4 aulas na sexta (excesso 2) e 1 dia usado de 2 (falta 1)
    assert av.custo_total == 3


def test_geminadas_hard_satisfeita_e_violada():
    regras = [RegraConfig(id="r-gem", tipo="geminadas", hard=True)]
    inst = instancia_minima(regras=regras, geminadas={"mat": 1})

    assert avaliar(inst, GRADE_COM_JANELAS).violacoes_hard == []

    sem_par = _grade_por_dia([["mat", "por", "mat", "por"]] * 4 + [["his"] * 4])
    assert avaliar(inst, sem_par).violacoes_hard == ["geminadas:a-mat"]


def test_erro_da_instancia_vem_prefixado():
    inst = instancia_minima()
    inst.atribuicoes[0].carga_semanal = 7  # matriz furada
    av = avaliar(inst, GRADE_COM_JANELAS)
    assert av.violacoes_hard
    assert all(v.startswith("instancia:") for v in av.violacoes_hard)


def test_avaliador_preparado_reaproveita_o_modelo_sem_vazar_estado():
    from pytime_engine import AvaliadorPreparado

    inst = instancia_minima(
        regras=[
            RegraConfig(id="r-disp", tipo="disponibilidade_professor", hard=True),
            RegraConfig(id="r-jan", tipo="janelas_professor", hard=False),
        ],
        disponibilidade={"prof-mat": {"manha-d0-h0": Disponibilidade.INDISPONIVEL}},
    )
    preparado = AvaliadorPreparado(inst)
    violada = _grade_por_dia(
        [["mat", "por", "mat", "por"]]
        + [["mat", "mat", "por", "por"]] * 3
        + [["his"] * 4]
    )
    valida = _grade_por_dia(
        [["por", "mat", "mat", "por"]]
        + [["mat", "mat", "por", "por"]] * 3
        + [["his"] * 4]
    )

    # alterna as grades: cada veredito tem de bater com o avaliar isolado
    for grade in [violada, valida, violada, valida]:
        av = preparado.avaliar(grade)
        isolada = avaliar(inst, grade)
        assert av.violacoes_hard == isolada.violacoes_hard
        assert av.custo_total == isolada.custo_total

    assert preparado.avaliar(violada).violacoes_hard == ["disponibilidade:prof-mat"]
    assert preparado.avaliar(valida).violacoes_hard == []
    # custo contado à mão: dia 0 tem uma janela de prof-mat e uma de prof-por
    # na grade violada; na válida prof-por (h0 e h3) tem duas e prof-mat nenhuma
    assert preparado.avaliar(violada).custo_total == 2
    assert preparado.avaliar(valida).custo_total == 2


def test_avaliador_preparado_nao_enxerga_mutacao_posterior_da_instancia():
    from pytime_engine import AvaliadorPreparado

    inst = instancia_minima()
    preparado = AvaliadorPreparado(inst)
    inst.atribuicoes[0].carga_semanal = 7  # mutação depois de preparar

    av = preparado.avaliar(GRADE_COM_JANELAS)

    assert av.violacoes_hard == []


def test_avaliador_preparado_com_grade_estrutural_invalida():
    from pytime_engine import AvaliadorPreparado

    inst = instancia_minima()
    preparado = AvaliadorPreparado(inst)
    av = preparado.avaliar(GRADE_COM_JANELAS[1:])
    assert "estrutural:turma_vazio:t1:manha-d0-h0" in av.violacoes_hard
    # e o preparado continua utilizável depois
    assert preparado.avaliar(GRADE_COM_JANELAS).violacoes_hard == []


def test_avaliador_preparado_de_instancia_invalida_so_devolve_os_erros():
    from pytime_engine import AvaliadorPreparado

    inst = instancia_minima()
    inst.atribuicoes[0].carga_semanal = 7
    av = AvaliadorPreparado(inst).avaliar(GRADE_COM_JANELAS)
    assert av.violacoes_hard
    assert all(v.startswith("instancia:") for v in av.violacoes_hard)


def _sem_sexta_tarde(inst: Instancia) -> Instancia:
    inst.turmas[0].disponibilidade = {
        "manha-d4-h2": Disponibilidade.INDISPONIVEL,
        "manha-d4-h3": Disponibilidade.INDISPONIVEL,
    }
    next(a for a in inst.atribuicoes if a.id == "a-his").carga_semanal = 2
    return inst


def test_turma_com_horarios_sem_aula_avalia_normalmente():
    inst = _sem_sexta_tarde(
        instancia_minima(
            regras=[RegraConfig(id="r-jan", tipo="janelas_professor", hard=False)]
        )
    )
    r = resolver(inst)
    assert r.status == "otimo"

    av = avaliar(inst, r.grade)

    assert av.violacoes_hard == []
    assert av.custo_total == r.custo_total


def test_aula_em_horario_sem_aula_da_turma_e_estrutural():
    inst = _sem_sexta_tarde(instancia_minima())
    grade = _grade_sem_regras(inst)
    movida = next(a for a in grade if a.slot_id == "manha-d4-h1")
    movida.slot_id = "manha-d4-h2"

    av = avaliar(inst, grade)

    assert av.violacoes_hard == [
        "estrutural:turma_indisponivel:t1:manha-d4-h2",
        "estrutural:turma_vazio:t1:manha-d4-h1",
    ]
