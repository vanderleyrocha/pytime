from typing import Literal

from pydantic import BaseModel, Field, model_validator


class AulaAlocada(BaseModel):
    atribuicao_id: str
    slot_id: str


class Celula(BaseModel):
    """Célula da grade marcada por uma ocorrência de regra soft.

    Exatamente um de `turma_id`/`professor_id` vem preenchido: diz em qual
    grade (da turma ou do professor) a marca faz sentido.
    """

    slot_id: str
    turma_id: str | None = None
    professor_id: str | None = None

    @model_validator(mode="after")
    def _um_eixo(self) -> "Celula":
        if (self.turma_id is None) == (self.professor_id is None):
            raise ValueError(
                "Célula precisa de exatamente um: turma_id ou professor_id."
            )
        return self


class Ocorrencia(BaseModel):
    """Um termo de custo soft violado: o quê, quanto e onde na grade.

    `unidades` é o valor do termo (ex. aulas acima do máximo no dia) e
    `custo` = peso × unidades. `celulas` vazia = a ocorrência não tem lugar
    próprio na grade (ex. dias de trabalho do professor).
    """

    descricao: str
    unidades: int
    custo: int
    celulas: list[Celula] = Field(default_factory=list)


class CustoRegra(BaseModel):
    regra_id: str
    tipo: str
    custo: int
    #: descrições das ocorrências (mantido por compatibilidade)
    detalhes: list[str] = Field(default_factory=list)
    ocorrencias: list[Ocorrencia] = Field(default_factory=list)


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
    (ex. `disponibilidade:<professor_id>`), mais `estrutural:<tipo>:<id>[:<slot_id>]`
    para as restrições básicas do modelo e `instancia:<frase>` para erros da
    própria instância (não da grade).
    """

    violacoes_hard: list[str] = Field(default_factory=list)
    custos: list[CustoRegra] = Field(default_factory=list)
    custo_total: int = 0
    tempo_segundos: float
