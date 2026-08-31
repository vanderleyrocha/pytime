from ..modelo import ContextoModelo
from .base import Regra, registrar


@registrar
class RegraRecursoCompartilhado(Regra):
    tipo = "recurso_compartilhado"

    def aplicar(self, ctx: ContextoModelo) -> None:
        for recurso in ctx.instancia.recursos:
            usuarias = [
                a for a in ctx.instancia.atribuicoes
                if recurso.id in a.recurso_ids
            ]
            if not usuarias:
                continue
            lit = ctx.assumption(f"recurso:{recurso.id}")
            for slot in ctx.instancia.slots:
                uso = sum(
                    ctx.occ_atribuicao(a.id, slot.id) for a in usuarias
                )
                ctx.model.Add(uso <= recurso.capacidade).OnlyEnforceIf(lit)
