"""Loop principal do worker: resgata órfãs, reivindica e processa."""

import time

from . import executor, fila
from .configuracao import carregar


def rodar(uma_iteracao: bool = False) -> None:
    """Executa o loop do worker.

    Com ``uma_iteracao=True`` faz um único ciclo (resgate + claim + processa se
    houver job) e retorna — usado pelos testes.
    """
    config = carregar()
    conn = fila.conectar(config.db_url)
    conexao_heartbeat = fila.conectar(config.db_url)
    ultimo_resgate = float("-inf")
    print("Worker PyTime iniciado.", flush=True)

    while True:
        agora = time.monotonic()
        if agora - ultimo_resgate >= config.intervalo_orfas:
            try:
                resgatadas = fila.resgatar_orfas(conn)
                if resgatadas:
                    print(
                        f"{resgatadas} geração(ões) órfã(s) resgatada(s).",
                        flush=True,
                    )
            except Exception as excecao:  # noqa: BLE001 - loop não pode morrer
                print(f"Falha no resgate de órfãs: {excecao}", flush=True)
            ultimo_resgate = agora

        job = None
        try:
            job = fila.reivindicar(conn)
        except Exception as excecao:  # noqa: BLE001 - loop não pode morrer
            print(f"Falha ao reivindicar geração: {excecao}", flush=True)

        if job is not None:
            print(f"Processando geração {job['id']}...", flush=True)
            executor.processar(
                conn,
                conexao_heartbeat,
                job,
                intervalo_heartbeat=config.intervalo_heartbeat,
            )
            print(f"Geração {job['id']} finalizada.", flush=True)
        elif not uma_iteracao:
            time.sleep(config.intervalo_fila)

        if uma_iteracao:
            return


if __name__ == "__main__":
    rodar()
