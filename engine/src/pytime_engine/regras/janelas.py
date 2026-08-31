from ..modelo import ContextoModelo
from .base import Regra, registrar


@registrar
class RegraJanelasProfessor(Regra):
    """Penaliza buracos entre a primeira e a última aula do dia.

    janelas = (ultimo - primeiro + 1) - aulas_no_dia, por professor × dia.
    """

    tipo = "janelas_professor"

    def aplicar(self, ctx: ContextoModelo) -> None:
        inst = ctx.instancia
        for prof in inst.professores:
            atribs = [
                a for a in inst.atribuicoes if a.professor_id == prof.id
            ]
            if not atribs:
                continue
            # slots onde o professor pode dar aula, agrupados por dia
            slots_por_dia: dict[int, list] = {}
            vistos = set()
            for a in atribs:
                for s in ctx.slots_da_turma(a.turma_id):
                    if s.id not in vistos:
                        vistos.add(s.id)
                        slots_por_dia.setdefault(s.dia, []).append(s)
            for dia, slots in sorted(slots_por_dia.items()):
                slots.sort(key=lambda s: s.ordem)
                k = len(slots)
                if k < 3:
                    continue  # sem espaço para janela
                occ = [
                    ctx.occ_professor(prof.id, s.id) for s in slots
                ]
                primeiro = ctx.model.NewIntVar(0, k - 1, f"pri_{prof.id}_{dia}")
                ultimo = ctx.model.NewIntVar(0, k - 1, f"ult_{prof.id}_{dia}")
                occ_vars = []
                for idx, expr in enumerate(occ):
                    b = ctx.model.NewBoolVar(f"occ_{prof.id}_{dia}_{idx}")
                    ctx.model.Add(expr == 1).OnlyEnforceIf(b)
                    ctx.model.Add(expr == 0).OnlyEnforceIf(b.Not())
                    ctx.model.Add(primeiro <= idx).OnlyEnforceIf(b)
                    ctx.model.Add(ultimo >= idx).OnlyEnforceIf(b)
                    occ_vars.append(b)
                janelas = ctx.model.NewIntVar(0, k - 2,
                                              f"jan_{prof.id}_{dia}")
                ctx.model.Add(
                    janelas >= ultimo - primeiro + 1 - sum(occ_vars)
                )
                ctx.adicionar_custo(
                    self.config.id, self.tipo, janelas, self.config.peso,
                    f"{prof.nome}: janelas no dia {dia}",
                )
