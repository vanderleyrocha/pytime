from ..modelo import ContextoModelo
from .base import Regra, registrar


@registrar
class RegraMesmoDia(Regra):
    """Aulas das disciplinas A e B não no mesmo dia (por turma)."""

    tipo = "nao_mesmo_dia"

    def aplicar(self, ctx: ContextoModelo) -> None:
        disc_a = self.config.parametros["disciplina_a"]
        disc_b = self.config.parametros["disciplina_b"]
        for turma in ctx.instancia.turmas:
            atribs_a = [
                a for a in ctx.instancia.atribuicoes
                if a.turma_id == turma.id and a.disciplina_id == disc_a
            ]
            atribs_b = [
                a for a in ctx.instancia.atribuicoes
                if a.turma_id == turma.id and a.disciplina_id == disc_b
            ]
            if not atribs_a or not atribs_b:
                continue
            slots = ctx.slots_da_turma(turma.id)
            for dia in sorted({s.dia for s in slots}):
                slots_dia = [s for s in slots if s.dia == dia]
                soma_a = sum(
                    ctx.occ_atribuicao(a.id, s.id)
                    for a in atribs_a for s in slots_dia
                )
                soma_b = sum(
                    ctx.occ_atribuicao(a.id, s.id)
                    for a in atribs_b for s in slots_dia
                )
                tem_a = ctx.model.NewBoolVar(f"nmd_a_{turma.id}_{dia}")
                tem_b = ctx.model.NewBoolVar(f"nmd_b_{turma.id}_{dia}")
                ctx.model.Add(soma_a >= 1).OnlyEnforceIf(tem_a)
                ctx.model.Add(soma_a == 0).OnlyEnforceIf(tem_a.Not())
                ctx.model.Add(soma_b >= 1).OnlyEnforceIf(tem_b)
                ctx.model.Add(soma_b == 0).OnlyEnforceIf(tem_b.Not())
                if self.config.hard:
                    lit = ctx.assumption(f"nao_mesmo_dia:{self.config.id}")
                    ctx.model.AddBoolOr(
                        [tem_a.Not(), tem_b.Not()]
                    ).OnlyEnforceIf(lit)
                else:
                    ambas = ctx.model.NewBoolVar(
                        f"nmd_ambas_{turma.id}_{dia}"
                    )
                    ctx.model.AddBoolAnd(
                        [tem_a, tem_b]
                    ).OnlyEnforceIf(ambas)
                    ctx.model.AddBoolOr(
                        [tem_a.Not(), tem_b.Not()]
                    ).OnlyEnforceIf(ambas.Not())
                    ctx.adicionar_custo(
                        self.config.id, self.tipo, ambas, self.config.peso,
                        f"{turma.nome}: {disc_a} e {disc_b} no dia {dia}",
                    )
