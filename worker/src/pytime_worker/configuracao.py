"""Configuração do worker via variáveis de ambiente."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Configuracao:
    db_url: str
    intervalo_fila: float = 5.0
    intervalo_heartbeat: float = 15.0
    intervalo_orfas: float = 60.0


def carregar() -> Configuracao:
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise RuntimeError("Defina SUPABASE_DB_URL para o worker.")
    return Configuracao(db_url=url)
