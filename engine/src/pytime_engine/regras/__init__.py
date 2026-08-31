from .base import REGISTRO, Regra, registrar

# Cada nova regra é importada aqui para se registrar (única linha a editar
# ao adicionar regra — o núcleo não muda).
__all__ = ["REGISTRO", "Regra", "registrar"]
