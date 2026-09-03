"""Acesso à fila de gerações (tabela geracoes) com SQL direto.

O worker usa credencial privilegiada: RLS não se aplica; toda escrita é
explícita e pontual.
"""

import json
from typing import Any

import psycopg
from psycopg.rows import dict_row


def conectar(db_url: str) -> psycopg.Connection:
    return psycopg.connect(db_url, autocommit=True, row_factory=dict_row)


def reivindicar(conn: psycopg.Connection) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute("select * from reivindicar_geracao()")
        return cur.fetchone()


def resgatar_orfas(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute("select resgatar_geracoes_orfas() as n")
        return cur.fetchone()["n"]


def bater_coracao(conn: psycopg.Connection, geracao_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "update geracoes set heartbeat_em = now(), atualizada_em = now()"
            " where id = %s and status = 'executando'",
            (geracao_id,),
        )


def gravar_progresso(
    conn: psycopg.Connection, geracao_id: str, custo: int, tempo: float
) -> None:
    progresso = json.dumps({"custo": custo, "tempo_segundos": round(tempo, 1)})
    with conn.cursor() as cur:
        cur.execute(
            "update geracoes set progresso = %s::jsonb, heartbeat_em = now(),"
            " atualizada_em = now() where id = %s and status = 'executando'",
            (progresso, geracao_id),
        )


def gravar_resultado_concluido(
    conn: psycopg.Connection,
    geracao_id: str,
    unidade_id: str,
    resultado: dict[str, Any],
    grade: list[tuple[str, str]],
) -> str | None:
    """Grava geração concluída + cenário + aulas numa única transação.

    Devolve ``None`` (sem gravar cenário/aulas) se o job não é mais deste
    worker — por exemplo, foi resgatado por `resgatar_geracoes_orfas()`
    enquanto este worker ainda processava.
    """
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                "update geracoes set status = 'concluida', resultado = %s::jsonb,"
                " atualizada_em = now() where id = %s and status = 'executando'",
                (json.dumps(resultado), geracao_id),
            )
            if cur.rowcount == 0:
                return None
            cur.execute(
                "insert into cenarios (unidade_id, geracao_id)"
                " values (%s, %s) returning id",
                (unidade_id, geracao_id),
            )
            cenario_id = cur.fetchone()["id"]
            cur.executemany(
                "insert into aulas_alocadas"
                " (unidade_id, cenario_id, atribuicao_id, slot_id)"
                " values (%s, %s, %s, %s)",
                [
                    (unidade_id, cenario_id, atribuicao_id, slot_id)
                    for (atribuicao_id, slot_id) in grade
                ],
            )
    return str(cenario_id)


def gravar_inviavel(
    conn: psycopg.Connection,
    geracao_id: str,
    resultado: dict[str, Any],
    nucleo: list[str],
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "update geracoes set status = 'inviavel', resultado = %s::jsonb,"
            " nucleo_conflito = %s, atualizada_em = now()"
            " where id = %s and status = 'executando'",
            (json.dumps(resultado), nucleo, geracao_id),
        )


def gravar_erro(conn: psycopg.Connection, geracao_id: str, detalhe: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "update geracoes set status = 'erro', detalhe_erro = %s,"
            " atualizada_em = now() where id = %s and status = 'executando'",
            (detalhe, geracao_id),
        )
