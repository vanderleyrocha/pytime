import math

from ..modelo import ContextoModelo
from .base import Regra, registrar


@registrar
class RegraDistribuicaoDisciplina(Regra):
    """Máximo de N aulas/dia por atribuição + espalhar pelos dias."""

    tipo = "distribuicao_disciplina"

    def aplicar(self, ctx: ContextoModelo) -> None:
        max_por_dia = int(self.config.parametros.get("max_por_dia", 2))
        for atrib in ctx.instancia.atribuicoes:
            slots = ctx.slots_da_turma(atrib.turma_id)
            dias: dict[int, list] = {}
            for s in slots:
                dias.setdefault(s.dia, []).append(s)
            disciplina = next(
                d.nome for d in ctx.instancia.disciplinas
                if d.id == atrib.disciplina_id
            )
            dia_usado_vars = []
            for dia, slots_dia in sorted(dias.items()):
                no_dia = sum(
                    ctx.occ_atribuicao(atrib.id, s.id) for s in slots_dia
                )
                excesso = ctx.model.NewIntVar(
                    0, len(slots_dia), f"exc_{atrib.id}_{dia}"
                )
                ctx.model.Add(excesso >= no_dia - max_por_dia)
                ctx.adicionar_custo(
                    self.config.id, self.tipo, excesso, self.config.peso,
                    f"{disciplina} ({atrib.turma_id}): excesso no dia {dia}",
                )
                usado = ctx.model.NewBoolVar(f"dia_{atrib.id}_{dia}")
                ctx.model.Add(no_dia >= 1).OnlyEnforceIf(usado)
                ctx.model.Add(no_dia == 0).OnlyEnforceIf(usado.Not())
                dia_usado_vars.append(usado)
            dias_min = min(
                math.ceil(atrib.carga_semanal / max_por_dia), len(dias)
            )
            falta = ctx.model.NewIntVar(0, len(dias), f"falta_{atrib.id}")
            ctx.model.Add(falta >= dias_min - sum(dia_usado_vars))
            ctx.adicionar_custo(
                self.config.id, self.tipo, falta, self.config.peso,
                f"{disciplina} ({atrib.turma_id}): concentrada em poucos dias",
            )
