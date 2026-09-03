"""Fila: claim sem duplicação, progresso, heartbeat e gravação de resultado."""

import json
import uuid

from pytime_worker import fila


def _enfileirar(conexao, unidade_id: str) -> str:
    geracao_id = str(uuid.uuid4())
    with conexao.cursor() as cur:
        cur.execute(
            "insert into geracoes (id, unidade_id, instancia) values (%s, %s, %s)",
            (geracao_id, unidade_id, json.dumps({})),
        )
    return geracao_id


def test_reivindicar_marca_executando_e_nao_duplica(conexao, unidade_teste):
    geracao_id = _enfileirar(conexao, unidade_teste)
    job = fila.reivindicar(conexao)
    assert job is not None and str(job["id"]) == geracao_id
    assert job["status"] == "executando"
    assert job["tentativas"] == 1
    assert fila.reivindicar(conexao) is None  # fila vazia agora


def test_progresso_e_heartbeat(conexao, unidade_teste):
    geracao_id = _enfileirar(conexao, unidade_teste)
    job = fila.reivindicar(conexao)
    fila.gravar_progresso(conexao, job["id"], custo=42, tempo=3.14)
    fila.bater_coracao(conexao, job["id"])
    with conexao.cursor() as cur:
        cur.execute(
            "select progresso, heartbeat_em from geracoes where id = %s",
            (geracao_id,),
        )
        linha = cur.fetchone()
    assert linha["progresso"]["custo"] == 42
    assert linha["heartbeat_em"] is not None


def test_gravar_resultado_concluido_cria_cenario_e_aulas(conexao, unidade_teste):
    # esqueleto mínimo que satisfaz as FKs compostas de tenant
    ids = {
        chave: str(uuid.uuid4())
        for chave in ("turno", "slot", "turma", "disciplina", "professor", "atribuicao")
    }
    with conexao.cursor() as cur:
        cur.execute(
            "insert into turnos (id, unidade_id, nome) values (%s, %s, 'T')",
            (ids["turno"], unidade_teste),
        )
        cur.execute(
            "insert into slots (id, unidade_id, turno_id, dia, ordem)"
            " values (%s, %s, %s, 0, 0)",
            (ids["slot"], unidade_teste, ids["turno"]),
        )
        cur.execute(
            "insert into turmas (id, unidade_id, turno_id, nome)"
            " values (%s, %s, %s, '1A')",
            (ids["turma"], unidade_teste, ids["turno"]),
        )
        cur.execute(
            "insert into disciplinas (id, unidade_id, nome) values (%s, %s, 'M')",
            (ids["disciplina"], unidade_teste),
        )
        cur.execute(
            "insert into professores (id, unidade_id, nome) values (%s, %s, 'P')",
            (ids["professor"], unidade_teste),
        )
        cur.execute(
            "insert into atribuicoes (id, unidade_id, professor_id, disciplina_id,"
            " turma_id, carga_semanal) values (%s, %s, %s, %s, %s, 1)",
            (
                ids["atribuicao"],
                unidade_teste,
                ids["professor"],
                ids["disciplina"],
                ids["turma"],
            ),
        )
    geracao_id = _enfileirar(conexao, unidade_teste)
    job = fila.reivindicar(conexao)

    cenario_id = fila.gravar_resultado_concluido(
        conexao,
        job["id"],
        unidade_teste,
        resultado={"status": "otimo", "custo_total": 0},
        grade=[(ids["atribuicao"], ids["slot"])],
    )
    with conexao.cursor() as cur:
        cur.execute(
            "select status, resultado from geracoes where id = %s", (geracao_id,)
        )
        ger = cur.fetchone()
        cur.execute(
            "select count(*)::int as n from aulas_alocadas where cenario_id = %s",
            (cenario_id,),
        )
        aulas = cur.fetchone()
    assert ger["status"] == "concluida"
    assert ger["resultado"]["status"] == "otimo"
    assert aulas["n"] == 1
