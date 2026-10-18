"""Onde cada custo soft aparece na grade pronta.

Ao registrar um custo, a regra diz como achar as células da ocorrência
(um `Localizador`). Depois do solve, solver e avaliador chamam o
localizador só dos termos com valor > 0, sobre a `GradeResolvida`. Assim
a semântica de "onde" fica na regra, e o núcleo só consolida.
"""

from collections import defaultdict
from collections.abc import Callable, Iterable
from typing import Literal

from .instancia import Instancia, Slot
from .resultado import AulaAlocada, Celula

#: em qual grade a marca aparece: a da turma ou a do professor
Eixo = Literal["turma", "professor"]

_NOMES_DIAS = ("segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo")


def nome_dia(dia: int) -> str:
    """Nome do dia da semana (0 = segunda)."""
    if 0 <= dia < len(_NOMES_DIAS):
        return _NOMES_DIAS[dia]
    return f"dia {dia + 1}"


def _feminino(dia: int) -> bool:
    return 0 <= dia < 5  # "segunda-feira" ... "sexta-feira"


def no_dia(dia: int) -> str:
    """Ex.: "na segunda", "no sábado"."""
    return f"{'na' if _feminino(dia) else 'no'} {nome_dia(dia)}"


def do_dia(dia: int) -> str:
    """Ex.: "da segunda", "do sábado"."""
    return f"{'da' if _feminino(dia) else 'do'} {nome_dia(dia)}"


def rotulo_slot(slot: Slot) -> str:
    """Ex.: "segunda, 1º horário"."""
    return f"{nome_dia(slot.dia)}, {slot.ordem + 1}º horário"


class GradeResolvida:
    """Ocupação de uma grade pronta, consultada pelos localizadores."""

    def __init__(self, instancia: Instancia, grade: list[AulaAlocada]):
        self._atribuicoes = {a.id: a for a in instancia.atribuicoes}
        self._ocupados = {(a.atribuicao_id, a.slot_id) for a in grade}
        self._slots_professor: dict[str, set[str]] = defaultdict(set)
        for aula in grade:
            atrib = self._atribuicoes.get(aula.atribuicao_id)
            if atrib is not None:
                self._slots_professor[atrib.professor_id].add(aula.slot_id)

    def aulas(
        self, atribuicao_ids: Iterable[str], slot_ids: Iterable[str], eixo: Eixo
    ) -> list[Celula]:
        """Células das aulas das atribuições nos slots dados (ordem dos slots)."""
        atribs = list(atribuicao_ids)
        celulas = []
        for slot_id in slot_ids:
            for atrib_id in atribs:
                if (atrib_id, slot_id) not in self._ocupados:
                    continue
                atrib = self._atribuicoes[atrib_id]
                if eixo == "turma":
                    celulas.append(Celula(slot_id=slot_id, turma_id=atrib.turma_id))
                else:
                    celulas.append(
                        Celula(slot_id=slot_id, professor_id=atrib.professor_id)
                    )
        return celulas

    def janelas(self, professor_id: str, slot_ids: Iterable[str]) -> list[Celula]:
        """Slots vagos do professor entre a primeira e a última aula.

        `slot_ids` deve vir na ordem do dia.
        """
        slots = list(slot_ids)
        ocupados = self._slots_professor[professor_id]
        indices = [k for k, sid in enumerate(slots) if sid in ocupados]
        if len(indices) < 2:
            return []
        return [
            Celula(slot_id=sid, professor_id=professor_id)
            for sid in slots[indices[0] : indices[-1] + 1]
            if sid not in ocupados
        ]


Localizador = Callable[[GradeResolvida], list[Celula]]


def aulas_em(
    atribuicao_ids: Iterable[str], slot_ids: Iterable[str], eixo: Eixo
) -> Localizador:
    """Localizador das aulas das atribuições nos slots dados."""
    atribs, slots = tuple(atribuicao_ids), tuple(slot_ids)
    return lambda grade: grade.aulas(atribs, slots, eixo)


def janelas_em(professor_id: str, slot_ids: Iterable[str]) -> Localizador:
    """Localizador das janelas do professor num dia (slots em ordem)."""
    slots = tuple(slot_ids)
    return lambda grade: grade.janelas(professor_id, slots)
