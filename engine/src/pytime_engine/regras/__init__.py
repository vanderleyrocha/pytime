from .base import REGISTRO, Regra, registrar

# Cada nova regra é importada aqui para se registrar (única linha a editar
# ao adicionar regra — o núcleo não muda).
__all__ = ["REGISTRO", "Regra", "registrar"]

from . import compactacao  # noqa: F401,E402
from . import disponibilidade  # noqa: F401,E402
from . import distribuicao  # noqa: F401,E402
from . import geminadas  # noqa: F401,E402
from . import janelas  # noqa: F401,E402
from . import mesmo_dia  # noqa: F401,E402
from . import preferencia_slot  # noqa: F401,E402
from . import recurso  # noqa: F401,E402
from . import ultimo_horario  # noqa: F401,E402
