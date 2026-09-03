"""Processa uma geração: roda o motor e grava o desfecho na fila."""

import threading
from typing import Any

import psycopg
from pytime_engine import Instancia, resolver

from . import fila

INTERVALO_PROGRESSO = 2.0  # segundos mínimos entre gravações de progresso


def processar(
    conn: psycopg.Connection,
    conexao_heartbeat: psycopg.Connection,
    job: dict[str, Any],
    intervalo_heartbeat: float = 15.0,
) -> None:
    geracao_id = str(job["id"])
    unidade_id = str(job["unidade_id"])

    try:
        instancia = Instancia.model_validate(job["instancia"])
    except Exception as excecao:  # noqa: BLE001 - contrato inválido vira erro do job
        fila.gravar_erro(conn, geracao_id, f"Instância inválida: {excecao}")
        return

    # Heartbeat em thread própria com conexão separada: o CP-SAT bloqueia a
    # thread principal por até budget_segundos, e conexões psycopg não são
    # thread-safe para uso concorrente.
    parar = threading.Event()

    def _bater() -> None:
        while not parar.wait(intervalo_heartbeat):
            try:
                fila.bater_coracao(conexao_heartbeat, geracao_id)
            except Exception:  # noqa: BLE001 - heartbeat é best-effort
                pass

    batedor = threading.Thread(target=_bater, daemon=True)
    batedor.start()

    ultimo_progresso = 0.0

    def ao_progredir(custo: int, tempo: float) -> None:
        nonlocal ultimo_progresso
        if tempo - ultimo_progresso < INTERVALO_PROGRESSO:
            return
        ultimo_progresso = tempo
        try:
            fila.gravar_progresso(conn, geracao_id, custo, tempo)
        except Exception:  # noqa: BLE001 - progresso é best-effort
            pass

    try:
        resultado = resolver(instancia, on_progress=ao_progredir)
    except Exception as excecao:  # noqa: BLE001 - falha do motor vira erro do job
        parar.set()
        batedor.join(timeout=2)
        fila.gravar_erro(conn, geracao_id, f"Falha do motor: {excecao}")
        return
    parar.set()
    batedor.join(timeout=2)

    dados = resultado.model_dump()
    if resultado.status in ("otimo", "viavel"):
        grade = [(a.atribuicao_id, a.slot_id) for a in resultado.grade]
        cenario_id = fila.gravar_resultado_concluido(
            conn, geracao_id, unidade_id, dados, grade
        )
        if cenario_id is None:
            print(
                f"Geração {geracao_id} foi resgatada por outro worker;"
                " resultado descartado."
            )
            return
    elif resultado.status == "inviavel":
        fila.gravar_inviavel(conn, geracao_id, dados, resultado.nucleo_conflito)
    else:  # sem_solucao_no_budget
        fila.gravar_erro(
            conn,
            geracao_id,
            "Sem solução dentro do tempo — tente aumentar o budget (máx. 600 s).",
        )
