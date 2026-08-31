from abc import ABC, abstractmethod
from typing import ClassVar

from ..instancia import RegraConfig
from ..modelo import ContextoModelo

REGISTRO: dict[str, type["Regra"]] = {}


class Regra(ABC):
    tipo: ClassVar[str]

    def __init__(self, config: RegraConfig):
        self.config = config

    @abstractmethod
    def aplicar(self, ctx: ContextoModelo) -> None: ...


def registrar(cls: type[Regra]) -> type[Regra]:
    REGISTRO[cls.tipo] = cls
    return cls
