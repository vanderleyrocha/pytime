from pytime_engine.resultado import AulaAlocada, CustoRegra, Resultado


def test_resultado_serializa_json():
    r = Resultado(
        status="otimo",
        grade=[AulaAlocada(atribuicao_id="a1", slot_id="seg-1")],
        custos=[CustoRegra(regra_id="r1", tipo="janelas_professor",
                           custo=2, detalhes=["Ana: 2 janelas na segunda"])],
        custo_total=2,
        tempo_segundos=1.5,
    )
    de_novo = Resultado.model_validate_json(r.model_dump_json())
    assert de_novo == r
    assert de_novo.nucleo_conflito == []


def test_resultado_inviavel():
    r = Resultado(status="inviavel", tempo_segundos=0.3,
                  nucleo_conflito=["disponibilidade:ana", "geminadas:a1"])
    assert r.grade == []
    assert r.custo_total == 0
