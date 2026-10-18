from ..modelo import ContextoModelo
from ..ocorrencias import aulas_em, no_dia
from .base import Regra, registrar


@registrar
class RegraMesmoDia(Regra):
    """Aulas das disciplinas A e B não no mesmo dia (por turma)."""

    tipo = "nao_mesmo_dia"

    def aplicar(self, ctx: ContextoModelo) -> None:
        disc_a = self.config.parametros["disciplina_a"]
        disc_b = self.config.parametros["disciplina_b"]
        nomes = {d.id: d.nome for d in ctx.instancia.disciplinas}
        nome_a, nome_b = nomes.get(disc_a, disc_a), nomes.get(disc_b, disc_b)
        for turma in ctx.instancia.turmas:
            atribs_a = [
                a
                for a in ctx.instancia.atribuicoes
                if a.turma_id == turma.id and a.disciplina_id == disc_a
            ]
            atribs_b = [
                a
                for a in ctx.instancia.atribuicoes
                if a.turma_id == turma.id and a.disciplina_id == disc_b
            ]
            if not atribs_a or not atribs_b:
                continue
            slots = ctx.slots_da_turma(turma.id)
            for dia in sorted({s.dia for s in slots}):
                slots_dia = [s for s in slots if s.dia == dia]
                soma_a = sum(
                    ctx.occ_atribuicao(a.id, s.id) for a in atribs_a for s in slots_dia
                )
                soma_b = sum(
                    ctx.occ_atribuicao(a.id, s.id) for a in atribs_b for s in slots_dia
                )
                tem_a = ctx.model.new_bool_var(f"nmd_a_{turma.id}_{dia}")
                tem_b = ctx.model.new_bool_var(f"nmd_b_{turma.id}_{dia}")
                ctx.model.add(soma_a >= 1).only_enforce_if(tem_a)
                ctx.model.add(soma_a == 0).only_enforce_if(tem_a.Not())
                ctx.model.add(soma_b >= 1).only_enforce_if(tem_b)
                ctx.model.add(soma_b == 0).only_enforce_if(tem_b.Not())
                if self.config.hard:
                    lit = ctx.assumption(f"nao_mesmo_dia:{self.config.id}")
                    ctx.model.add_bool_or([tem_a.Not(), tem_b.Not()]).only_enforce_if(
                        lit
                    )
                else:
                    ambas = ctx.model.new_bool_var(f"nmd_ambas_{turma.id}_{dia}")
                    ctx.model.add_bool_and([tem_a, tem_b]).only_enforce_if(ambas)
                    ctx.model.add_bool_or([tem_a.Not(), tem_b.Not()]).only_enforce_if(
                        ambas.Not()
                    )
                    ctx.adicionar_custo(
                        self.config.id,
                        self.tipo,
                        ambas,
                        self.config.peso,
                        f"{turma.nome}: {nome_a} e {nome_b} {no_dia(dia)}",
                        aulas_em(
                            [a.id for a in atribs_a + atribs_b],
                            [s.id for s in slots_dia],
                            "turma",
                        ),
                    )
