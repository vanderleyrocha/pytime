from enum import Enum

from pydantic import BaseModel, Field


class Disponibilidade(str, Enum):
    DISPONIVEL = "disponivel"
    INDISPONIVEL = "indisponivel"
    PREFERE = "prefere"
    EVITA = "evita"


class Turno(BaseModel):
    id: str
    nome: str


class Slot(BaseModel):
    id: str
    dia: int          # 0 = segunda ... 4 = sexta
    ordem: int        # posição no dia dentro do turno (0 = primeiro horário)
    turno_id: str


class Turma(BaseModel):
    id: str
    nome: str
    turno_id: str


class Disciplina(BaseModel):
    id: str
    nome: str


class Professor(BaseModel):
    id: str
    nome: str
    # slot_id -> status; slot ausente = disponivel
    disponibilidade: dict[str, Disponibilidade] = Field(default_factory=dict)


class Recurso(BaseModel):
    id: str
    nome: str
    capacidade: int = 1


class Atribuicao(BaseModel):
    id: str
    professor_id: str
    disciplina_id: str
    turma_id: str
    carga_semanal: int = Field(ge=1)
    geminadas: int = 0            # nº de pares de aulas consecutivas exigidos
    recurso_ids: list[str] = Field(default_factory=list)


class RegraConfig(BaseModel):
    id: str
    tipo: str                     # chave no REGISTRO do catálogo
    hard: bool
    peso: int = 1
    ativa: bool = True
    parametros: dict = Field(default_factory=dict)


class Instancia(BaseModel):
    turnos: list[Turno]
    slots: list[Slot]
    turmas: list[Turma]
    disciplinas: list[Disciplina]
    professores: list[Professor]
    atribuicoes: list[Atribuicao]
    recursos: list[Recurso] = Field(default_factory=list)
    regras: list[RegraConfig] = Field(default_factory=list)
    budget_segundos: float = Field(default=60.0, gt=0, le=240)

    def slots_do_turno(self, turno_id: str) -> list[Slot]:
        return sorted(
            (s for s in self.slots if s.turno_id == turno_id),
            key=lambda s: (s.dia, s.ordem),
        )

    def validar_matriz_cheia(self) -> list[str]:
        """Turma deve ter carga total igual ao nº de slots do seu turno."""
        erros = []
        for turma in self.turmas:
            carga = sum(
                a.carga_semanal for a in self.atribuicoes
                if a.turma_id == turma.id
            )
            n_slots = len(self.slots_do_turno(turma.turno_id))
            if carga != n_slots:
                erros.append(
                    f"Turma {turma.nome}: carga total {carga} difere do "
                    f"número de slots do turno ({n_slots})."
                )
        return erros
