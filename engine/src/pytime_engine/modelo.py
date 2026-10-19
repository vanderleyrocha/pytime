from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import TYPE_CHECKING, NamedTuple

from ortools.sat.python import cp_model

from .instancia import Atribuicao, Instancia, Slot

if TYPE_CHECKING:
    from .ocorrencias import Localizador


class TermoCusto(NamedTuple):
    """Termo `peso × var` do objetivo, registrado por uma regra soft."""

    var: cp_model.LinearExprT
    peso: int
    descricao: str
    tipo: str
    localizar: Localizador | None


@dataclass
class Aula:
    atribuicao: Atribuicao
    indice: int  # 0..carga_semanal-1 dentro da atribuição


class ContextoModelo:
    """Variáveis x[aula, slot] + restrições estruturais.

    Estruturais (sempre ativas, não parametrizáveis):
    - cada aula ocupa exatamente 1 slot;
    - turma tem exatamente 1 aula por slot disponível (matriz cheia); slot
      que a turma marcou como indisponível não existe para ela (sem variável);
    - professor dá no máximo 1 aula por slot;
    - quebra de simetria entre aulas da mesma atribuição.
    """

    def __init__(self, instancia: Instancia):
        self.instancia = instancia
        self.model = cp_model.CpModel()
        self.aulas: list[Aula] = [
            Aula(a, i) for a in instancia.atribuicoes for i in range(a.carga_semanal)
        ]
        self._slots_turma: dict[str, list[Slot]] = {
            t.id: instancia.slots_da_turma(t) for t in instancia.turmas
        }
        self.custos: dict[str, list[TermoCusto]] = defaultdict(list)
        self.assumptions: dict[str, cp_model.IntVar] = {}

        # índices para occ_* não varrerem todas as aulas a cada chamada
        self._aulas_da_atribuicao: dict[str, list[int]] = defaultdict(list)
        self._aulas_do_professor: dict[str, list[int]] = defaultdict(list)
        self._aulas_da_turma: dict[str, list[int]] = defaultdict(list)
        for i, aula in enumerate(self.aulas):
            self._aulas_da_atribuicao[aula.atribuicao.id].append(i)
            self._aulas_do_professor[aula.atribuicao.professor_id].append(i)
            self._aulas_da_turma[aula.atribuicao.turma_id].append(i)

        self.x: dict[tuple[int, str], cp_model.IntVar] = {}
        for i, aula in enumerate(self.aulas):
            for slot in self._slots_turma[aula.atribuicao.turma_id]:
                self.x[(i, slot.id)] = self.model.new_bool_var(
                    f"x_{aula.atribuicao.id}_{aula.indice}_{slot.id}"
                )

        self._restricoes_estruturais()

    def slots_da_turma(self, turma_id: str) -> list[Slot]:
        return self._slots_turma[turma_id]

    # LinearExpr.sum monta a expressão de uma vez; o sum() do Python encadeia
    # um objeto por termo e dominava o tempo de montagem em 80 turmas.
    def occ_atribuicao(self, atribuicao_id: str, slot_id: str):
        return cp_model.LinearExpr.sum(
            [
                self.x[(i, slot_id)]
                for i in self._aulas_da_atribuicao[atribuicao_id]
                if (i, slot_id) in self.x
            ]
        )

    def occ_professor(self, professor_id: str, slot_id: str):
        return cp_model.LinearExpr.sum(
            [
                self.x[(i, slot_id)]
                for i in self._aulas_do_professor[professor_id]
                if (i, slot_id) in self.x
            ]
        )

    def adicionar_custo(
        self,
        regra_id: str,
        tipo: str,
        var: cp_model.LinearExprT,
        peso: int,
        descricao: str,
        localizar: Localizador | None = None,
    ) -> None:
        """Registra o termo `peso × var` do objetivo.

        `localizar` diz onde a ocorrência aparece na grade pronta (ver
        `ocorrencias`); sem ele a ocorrência só é listada, sem células.
        """
        self.custos[regra_id].append(TermoCusto(var, peso, descricao, tipo, localizar))

    def assumption(self, motivo: str) -> cp_model.IntVar:
        if motivo not in self.assumptions:
            self.assumptions[motivo] = self.model.new_bool_var(f"as_{motivo}")
        return self.assumptions[motivo]

    def _restricoes_estruturais(self) -> None:
        # 1 slot por aula
        for i, aula in enumerate(self.aulas):
            slots = self._slots_turma[aula.atribuicao.turma_id]
            self.model.add_exactly_one(self.x[(i, s.id)] for s in slots)

        # turma: exatamente 1 aula por slot (matriz cheia)
        for turma in self.instancia.turmas:
            indices = self._aulas_da_turma[turma.id]
            for slot in self._slots_turma[turma.id]:
                self.model.add_exactly_one(self.x[(i, slot.id)] for i in indices)

        # professor: no máximo 1 aula por slot
        for prof in self.instancia.professores:
            indices = self._aulas_do_professor[prof.id]
            slots_ids = {
                s.id
                for i in indices
                for s in self._slots_turma[self.aulas[i].atribuicao.turma_id]
            }
            for slot_id in slots_ids:
                termos = [
                    self.x[(i, slot_id)] for i in indices if (i, slot_id) in self.x
                ]
                if len(termos) > 1:
                    self.model.add_at_most_one(termos)

        # quebra de simetria: aulas da mesma atribuição em ordem de slot
        for atrib in self.instancia.atribuicoes:
            indices = self._aulas_da_atribuicao[atrib.id]
            slots = self._slots_turma[atrib.turma_id]
            pesos = list(range(len(slots)))
            for i1, i2 in zip(indices, indices[1:], strict=False):
                pos1 = cp_model.LinearExpr.weighted_sum(
                    [self.x[(i1, s.id)] for s in slots], pesos
                )
                pos2 = cp_model.LinearExpr.weighted_sum(
                    [self.x[(i2, s.id)] for s in slots], pesos
                )
                self.model.add(pos1 < pos2)
