from pytime_engine import resolver
from pytime_engine.gerador import gerar


def test_gerar_e_deterministico():
    a = gerar(4, seed=42)
    b = gerar(4, seed=42)
    assert a == b
    assert a != gerar(4, seed=43)


def test_instancia_gerada_e_valida():
    inst = gerar(4, seed=1)
    assert len(inst.turmas) == 4
    assert inst.validar_matriz_cheia() == []
    assert inst.regras  # catálogo ativado
    tipos = {r.tipo for r in inst.regras}
    assert "disponibilidade_professor" in tipos
    assert "janelas_professor" in tipos


def test_instancia_pequena_resolve():
    inst = gerar(4, seed=1)
    inst.budget_segundos = 30
    r = resolver(inst)
    assert r.status in ("otimo", "viavel")
    carga_total = sum(a.carga_semanal for a in inst.atribuicoes)
    assert len(r.grade) == carga_total
