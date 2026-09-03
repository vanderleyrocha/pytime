"""Executor: fluxo completo com o motor real numa instância mínima."""

import json
import uuid

from pytime_worker import executor, fila


def _instancia_minima(ids: dict[str, str]) -> dict:
    """2 slots, 1 atribuição de carga 2 — resolve em < 1 s."""
    return {
        "turnos": [{"id": ids["turno"], "nome": "Manhã"}],
        "slots": [
            {"id": ids["slot0"], "dia": 0, "ordem": 0, "turno_id": ids["turno"]},
            {"id": ids["slot1"], "dia": 0, "ordem": 1, "turno_id": ids["turno"]},
        ],
        "turmas": [{"id": ids["turma"], "nome": "1A", "turno_id": ids["turno"]}],
        "disciplinas": [{"id": ids["disciplina"], "nome": "Mat"}],
        "professores": [{"id": ids["professor"], "nome": "P"}],
        "atribuicoes": [
            {
                "id": ids["atribuicao"],
                "professor_id": ids["professor"],
                "disciplina_id": ids["disciplina"],
                "turma_id": ids["turma"],
                "carga_semanal": 2,
            }
        ],
        "budget_segundos": 30,
    }


def _montar_esqueleto(conexao, unidade_id: str) -> dict[str, str]:
    ids = {
        chave: str(uuid.uuid4())
        for chave in (
            "turno",
            "slot0",
            "slot1",
            "turma",
            "disciplina",
            "professor",
            "atribuicao",
        )
    }
    with conexao.cursor() as cur:
        cur.execute(
            "insert into turnos (id, unidade_id, nome) values (%s, %s, 'T')",
            (ids["turno"], unidade_id),
        )
        for chave, ordem in (("slot0", 0), ("slot1", 1)):
            cur.execute(
                "insert into slots (id, unidade_id, turno_id, dia, ordem)"
                " values (%s, %s, %s, 0, %s)",
                (ids[chave], unidade_id, ids["turno"], ordem),
            )
        cur.execute(
            "insert into turmas (id, unidade_id, turno_id, nome)"
            " values (%s, %s, %s, '1A')",
            (ids["turma"], unidade_id, ids["turno"]),
        )
        cur.execute(
            "insert into disciplinas (id, unidade_id, nome) values (%s, %s, 'M')",
            (ids["disciplina"], unidade_id),
        )
        cur.execute(
            "insert into professores (id, unidade_id, nome) values (%s, %s, 'P')",
            (ids["professor"], unidade_id),
        )
        cur.execute(
            "insert into atribuicoes (id, unidade_id, professor_id, disciplina_id,"
            " turma_id, carga_semanal) values (%s, %s, %s, %s, %s, 2)",
            (
                ids["atribuicao"],
                unidade_id,
                ids["professor"],
                ids["disciplina"],
                ids["turma"],
            ),
        )
    return ids


def _enfileirar(conexao, unidade_id: str, instancia: dict) -> str:
    geracao_id = str(uuid.uuid4())
    with conexao.cursor() as cur:
        cur.execute(
            "insert into geracoes (id, unidade_id, instancia) values (%s, %s, %s)",
            (geracao_id, unidade_id, json.dumps(instancia)),
        )
    return geracao_id


def test_processar_conclui_e_cria_grade(conexao, db_url, unidade_teste):
    ids = _montar_esqueleto(conexao, unidade_teste)
    geracao_id = _enfileirar(conexao, unidade_teste, _instancia_minima(ids))
    job = fila.reivindicar(conexao)
    with fila.conectar(db_url) as conexao_hb:
        executor.processar(conexao, conexao_hb, job, intervalo_heartbeat=1.0)
    with conexao.cursor() as cur:
        cur.execute(
            "select status, resultado from geracoes where id = %s", (geracao_id,)
        )
        ger = cur.fetchone()
        cur.execute(
            "select count(*)::int as n from aulas_alocadas a"
            " join cenarios c on c.id = a.cenario_id where c.geracao_id = %s",
            (geracao_id,),
        )
        aulas = cur.fetchone()
    assert ger["status"] == "concluida"
    assert ger["resultado"]["status"] in ("otimo", "viavel")
    assert aulas["n"] == 2


def test_processar_inviavel_grava_nucleo(conexao, db_url, unidade_teste):
    ids = _montar_esqueleto(conexao, unidade_teste)
    instancia = _instancia_minima(ids)
    instancia["atribuicoes"][0]["carga_semanal"] = 1  # matriz furada: 1 aula, 2 slots
    geracao_id = _enfileirar(conexao, unidade_teste, instancia)
    job = fila.reivindicar(conexao)
    with fila.conectar(db_url) as conexao_hb:
        executor.processar(conexao, conexao_hb, job, intervalo_heartbeat=1.0)
    with conexao.cursor() as cur:
        cur.execute(
            "select status, nucleo_conflito from geracoes where id = %s", (geracao_id,)
        )
        ger = cur.fetchone()
    assert ger["status"] == "inviavel"
    assert len(ger["nucleo_conflito"]) >= 1


def test_processar_instancia_invalida_vira_erro(conexao, db_url, unidade_teste):
    geracao_id = _enfileirar(conexao, unidade_teste, {"nada": True})
    job = fila.reivindicar(conexao)
    with fila.conectar(db_url) as conexao_hb:
        executor.processar(conexao, conexao_hb, job, intervalo_heartbeat=1.0)
    with conexao.cursor() as cur:
        cur.execute(
            "select status, detalhe_erro from geracoes where id = %s", (geracao_id,)
        )
        ger = cur.fetchone()
    assert ger["status"] == "erro"
    assert "Instância inválida" in ger["detalhe_erro"]
