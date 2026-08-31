from ..modelo import ContextoModelo
from .base import Regra, registrar


@registrar
class RegraCompactacaoDias(Regra):
    """Custa 1×peso por dia em que o professor trabalha."""

    tipo = "compactacao_dias"

    def aplicar(self, ctx: ContextoModelo) -> None:
        for prof in ctx.instancia.professores:
            atribs = [
                a for a in ctx.instancia.atribuicoes
                if a.professor_id == prof.id
            ]
            if not atribs:
                continue
            slots_por_dia: dict[int, set[str]] = {}
            for a in atribs:
                for s in ctx.slots_da_turma(a.turma_id):
                    slots_por_dia.setdefault(s.dia, set()).add(s.id)
            for dia, slot_ids in sorted(slots_por_dia.items()):
                total = sum(
                    ctx.occ_professor(prof.id, sid) for sid in sorted(slot_ids)
                )
                trabalha = ctx.model.NewBoolVar(f"trab_{prof.id}_{dia}")
                ctx.model.Add(total >= 1).OnlyEnforceIf(trabalha)
                ctx.model.Add(total == 0).OnlyEnforceIf(trabalha.Not())
                ctx.adicionar_custo(
                    self.config.id, self.tipo, trabalha, self.config.peso,
                    f"{prof.nome}: trabalha no dia {dia}",
                )
