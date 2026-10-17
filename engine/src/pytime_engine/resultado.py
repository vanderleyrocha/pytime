from typing import Literal

from pydantic import BaseModel, Field


class AulaAlocada(BaseModel):
    atribuicao_id: str
    slot_id: str


class CustoRegra(BaseModel):
    regra_id: str
    tipo: str
    custo: int
    detalhes: list[str] = Field(default_factory=list)


class Resultado(BaseModel):
    status: Literal["otimo", "viavel", "inviavel", "sem_solucao_no_budget"]
    grade: list[AulaAlocada] = Field(default_factory=list)
    custos: list[CustoRegra] = Field(default_factory=list)
    custo_total: int = 0
    tempo_segundos: float
    nucleo_conflito: list[str] = Field(default_factory=list)


class Avaliacao(BaseModel):
    """Veredito de uma grade pronta (ex. editada à mão) contra o catálogo.

    `violacoes_hard` usa o mesmo formato de `Resultado.nucleo_conflito`
    (ex. `disponibilidade:<professor_id>`), mais `estrutural:<tipo>:<id>`
    para as restrições básicas do modelo.
    """

    violacoes_hard: list[str] = Field(default_factory=list)
    custos: list[CustoRegra] = Field(default_factory=list)
    custo_total: int = 0
    tempo_segundos: float
