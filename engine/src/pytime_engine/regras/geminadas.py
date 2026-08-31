from ..modelo import ContextoModelo
from .base import Regra, registrar


@registrar
class RegraGeminadas(Regra):
    """Exige nº mínimo de pares de aulas consecutivas por atribuição.

    Limitação v1: 3 aulas seguidas contam como 2 pares.
    """

    tipo = "geminadas"

    def aplicar(self, ctx: ContextoModelo) -> None:
        for atrib in ctx.instancia.atribuicoes:
            if atrib.geminadas < 1:
                continue
            slots = ctx.slots_da_turma(atrib.turma_id)
            pares = []
            for s1, s2 in zip(slots, slots[1:]):
                if s1.dia != s2.dia or s2.ordem != s1.ordem + 1:
                    continue
                par = ctx.model.NewBoolVar(f"par_{atrib.id}_{s1.id}")
                ctx.model.Add(par <= ctx.occ_atribuicao(atrib.id, s1.id))
                ctx.model.Add(par <= ctx.occ_atribuicao(atrib.id, s2.id))
                pares.append(par)
            lit = ctx.assumption(f"geminadas:{atrib.id}")
            ctx.model.Add(sum(pares) >= atrib.geminadas).OnlyEnforceIf(lit)
