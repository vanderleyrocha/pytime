from enum import StrEnum

from pydantic import BaseModel, Field, ValidationInfo, field_validator


class Disponibilidade(StrEnum):
    DISPONIVEL = "disponivel"
    INDISPONIVEL = "indisponivel"
    PREFERE = "prefere"
    EVITA = "evita"


class Turno(BaseModel):
    id: str
    nome: str


class Slot(BaseModel):
    id: str
    dia: int  # 0 = segunda ... 4 = sexta
    ordem: int  # posição no dia dentro do turno (0 = primeiro horário)
    turno_id: str


class Turma(BaseModel):
    id: str
    nome: str
    turno_id: str
    # slot_id -> status; slot ausente = disponivel. Slot indisponível não
    # existe para a turma: ela não tem aula nesse horário.
    disponibilidade: dict[str, Disponibilidade] = Field(default_factory=dict)

    @field_validator("disponibilidade")
    @classmethod
    def _so_disponivel_ou_indisponivel(
        cls, valor: dict[str, Disponibilidade], info: ValidationInfo
    ) -> dict[str, Disponibilidade]:
        invalidos = sorted(
            s
            for s, st in valor.items()
            if st not in (Disponibilidade.DISPONIVEL, Disponibilidade.INDISPONIVEL)
        )
        if invalidos:
            raise ValueError(
                f"Turma {info.data.get('nome', '?')} só aceita 'disponivel' ou"
                " 'indisponivel' na disponibilidade"
                f" (slots: {', '.join(invalidos)})."
            )
        return valor


class Disciplina(BaseModel):
    id: str
    nome: str
    # slot_id -> status; slot ausente = disponivel (regras
    # disponibilidade_disciplina e preferencia_disciplina_horario)
    disponibilidade: dict[str, Disponibilidade] = Field(default_factory=dict)


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
    geminadas: int = 0  # nº de pares de aulas consecutivas exigidos
    recurso_ids: list[str] = Field(default_factory=list)


class RegraConfig(BaseModel):
    id: str
    tipo: str  # chave no REGISTRO do catálogo
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
    budget_segundos: float = Field(default=60.0, gt=0, le=600)

    def slots_do_turno(self, turno_id: str) -> list[Slot]:
        return sorted(
            (s for s in self.slots if s.turno_id == turno_id),
            key=lambda s: (s.dia, s.ordem),
        )

    def slots_da_turma(self, turma: Turma) -> list[Slot]:
        """Slots do turno da turma, sem os que ela marcou como indisponíveis."""
        return [
            s
            for s in self.slots_do_turno(turma.turno_id)
            if turma.disponibilidade.get(s.id) != Disponibilidade.INDISPONIVEL
        ]

    def validar_referencias(self) -> list[str]:
        """Detecta ids referenciados que não existem na instância."""
        erros = []
        turnos_ids = {t.id for t in self.turnos}
        turmas_ids = {t.id for t in self.turmas}
        disciplinas_ids = {d.id for d in self.disciplinas}
        professores_ids = {p.id for p in self.professores}
        recursos_ids = {r.id for r in self.recursos}
        turno_do_slot = {s.id: s.turno_id for s in self.slots}

        for turma in self.turmas:
            if turma.turno_id not in turnos_ids:
                erros.append(
                    f"Turma {turma.nome} ({turma.id}): turno_id "
                    f"'{turma.turno_id}' não encontrado."
                )
            for slot_id in sorted(turma.disponibilidade):
                if slot_id not in turno_do_slot:
                    erros.append(
                        f"Turma {turma.nome}: slot '{slot_id}' da disponibilidade"
                        " não encontrado."
                    )
                elif turno_do_slot[slot_id] != turma.turno_id:
                    erros.append(
                        f"Turma {turma.nome}: slot '{slot_id}' da disponibilidade"
                        " não pertence ao turno da turma."
                    )
        for disciplina in self.disciplinas:
            for slot_id in sorted(disciplina.disponibilidade):
                if slot_id not in turno_do_slot:
                    erros.append(
                        f"Disciplina {disciplina.nome}: slot '{slot_id}' da"
                        " disponibilidade não encontrado."
                    )
        for slot in self.slots:
            if slot.turno_id not in turnos_ids:
                erros.append(
                    f"Slot {slot.id}: turno_id '{slot.turno_id}' não encontrado."
                )
        for atrib in self.atribuicoes:
            if atrib.professor_id not in professores_ids:
                erros.append(
                    f"Atribuição {atrib.id}: professor_id "
                    f"'{atrib.professor_id}' não encontrado."
                )
            if atrib.disciplina_id not in disciplinas_ids:
                erros.append(
                    f"Atribuição {atrib.id}: disciplina_id "
                    f"'{atrib.disciplina_id}' não encontrada."
                )
            if atrib.turma_id not in turmas_ids:
                erros.append(
                    f"Atribuição {atrib.id}: turma_id "
                    f"'{atrib.turma_id}' não encontrada."
                )
            for recurso_id in atrib.recurso_ids:
                if recurso_id not in recursos_ids:
                    erros.append(
                        f"Atribuição {atrib.id}: recurso_id "
                        f"'{recurso_id}' não encontrado."
                    )
        return erros

    def validar_matriz_cheia(self) -> list[str]:
        """Turma deve ter carga total igual ao nº de slots disponíveis dela."""
        erros = []
        for turma in self.turmas:
            carga = sum(
                a.carga_semanal for a in self.atribuicoes if a.turma_id == turma.id
            )
            n_turno = len(self.slots_do_turno(turma.turno_id))
            n_slots = len(self.slots_da_turma(turma))
            if carga == n_slots:
                continue
            if n_slots == n_turno:
                erros.append(
                    f"Turma {turma.nome}: carga total {carga} difere do "
                    f"número de slots do turno ({n_slots})."
                )
            else:
                erros.append(
                    f"Turma {turma.nome}: carga total {carga} difere do número"
                    f" de horários disponíveis da turma ({n_slots} de {n_turno}"
                    " do turno)."
                )
        return erros
