from .base import REGISTRO, Regra, registrar

# Cada nova regra é importada aqui para se registrar (única linha a editar
# ao adicionar regra — o núcleo não muda).
__all__ = ["REGISTRO", "Regra", "registrar"]

from . import (
    compactacao,  # noqa: F401,E402
    disponibilidade,  # noqa: F401,E402
    distribuicao,  # noqa: F401,E402
    geminadas,  # noqa: F401,E402
    janelas,  # noqa: F401,E402
    mesmo_dia,  # noqa: F401,E402
    preferencia_slot,  # noqa: F401,E402
    recurso,  # noqa: F401,E402
    ultimo_horario,  # noqa: F401,E402
)
