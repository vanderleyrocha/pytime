from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

from .instancia import Atribuicao, Instancia, Slot


@dataclass
class Aula:
    atribuicao: Atribuicao
    indice: int  # 0..carga_semanal-1 dentro da atribuição


class ContextoModelo:
    """Variáveis x[aula, slot] + restrições estruturais.

    Estruturais (sempre ativas, não parametrizáveis):
    - cada aula ocupa exatamente 1 slot;
    - turma tem exatamente 1 aula por slot (matriz cheia);
    - professor dá no máximo 1 aula por slot;
    - quebra de simetria entre aulas da mesma atribuição.
    """

    def __init__(self, instancia: Instancia):
        self.instancia = instancia
        self.model = cp_model.CpModel()
        self.aulas: list[Aula] = [
            Aula(a, i)
            for a in instancia.atribuicoes
            for i in range(a.carga_semanal)
        ]
        self._slots_turma: dict[str, list[Slot]] = {
            t.id: instancia.slots_do_turno(t.turno_id)
            for t in instancia.turmas
        }
        # regra_id -> [(var, peso, descricao, tipo)]
        self.custos: dict[str, list] = defaultdict(list)
        self.assumptions: dict[str, cp_model.IntVar] = {}

        # índices para occ_* não varrerem todas as aulas a cada chamada
        self._aulas_da_atribuicao: dict[str, list[int]] = defaultdict(list)
        self._aulas_do_professor: dict[str, list[int]] = defaultdict(list)
        for i, aula in enumerate(self.aulas):
            self._aulas_da_atribuicao[aula.atribuicao.id].append(i)
            self._aulas_do_professor[aula.atribuicao.professor_id].append(i)

        self.x: dict[tuple[int, str], cp_model.IntVar] = {}
        for i, aula in enumerate(self.aulas):
            for slot in self._slots_turma[aula.atribuicao.turma_id]:
                self.x[(i, slot.id)] = self.model.NewBoolVar(
                    f"x_{aula.atribuicao.id}_{aula.indice}_{slot.id}"
                )

        self._restricoes_estruturais()

    def slots_da_turma(self, turma_id: str) -> list[Slot]:
        return self._slots_turma[turma_id]

    def occ_atribuicao(self, atribuicao_id: str, slot_id: str):
        return sum(
            self.x[(i, slot_id)]
            for i in self._aulas_da_atribuicao[atribuicao_id]
            if (i, slot_id) in self.x
        )

    def occ_professor(self, professor_id: str, slot_id: str):
        return sum(
            self.x[(i, slot_id)]
            for i in self._aulas_do_professor[professor_id]
            if (i, slot_id) in self.x
        )

    def adicionar_custo(self, regra_id: str, tipo: str, var,
                        peso: int, descricao: str) -> None:
        self.custos[regra_id].append((var, peso, descricao, tipo))

    def assumption(self, motivo: str) -> cp_model.IntVar:
        if motivo not in self.assumptions:
            self.assumptions[motivo] = self.model.NewBoolVar(f"as_{motivo}")
        return self.assumptions[motivo]

    def _restricoes_estruturais(self) -> None:
        # 1 slot por aula
        for i, aula in enumerate(self.aulas):
            slots = self._slots_turma[aula.atribuicao.turma_id]
            self.model.AddExactlyOne(self.x[(i, s.id)] for s in slots)

        # turma: exatamente 1 aula por slot (matriz cheia)
        for turma in self.instancia.turmas:
            indices = [
                i for i, a in enumerate(self.aulas)
                if a.atribuicao.turma_id == turma.id
            ]
            for slot in self._slots_turma[turma.id]:
                self.model.AddExactlyOne(
                    self.x[(i, slot.id)] for i in indices
                )

        # professor: no máximo 1 aula por slot
        for prof in self.instancia.professores:
            indices = [
                i for i, a in enumerate(self.aulas)
                if a.atribuicao.professor_id == prof.id
            ]
            slots_ids = {
                s.id for i in indices
                for s in self._slots_turma[self.aulas[i].atribuicao.turma_id]
            }
            for slot_id in slots_ids:
                termos = [
                    self.x[(i, slot_id)] for i in indices
                    if (i, slot_id) in self.x
                ]
                if len(termos) > 1:
                    self.model.AddAtMostOne(termos)

        # quebra de simetria: aulas da mesma atribuição em ordem de slot
        for atrib in self.instancia.atribuicoes:
            indices = [
                i for i, a in enumerate(self.aulas)
                if a.atribuicao.id == atrib.id
            ]
            slots = self._slots_turma[atrib.turma_id]
            for i1, i2 in zip(indices, indices[1:]):
                pos1 = sum(
                    k * self.x[(i1, s.id)] for k, s in enumerate(slots)
                )
                pos2 = sum(
                    k * self.x[(i2, s.id)] for k, s in enumerate(slots)
                )
                self.model.Add(pos1 < pos2)
