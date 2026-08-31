from ..modelo import ContextoModelo
from .base import Regra, registrar


@registrar
class RegraUltimoHorario(Regra):
    """Disciplina X não no último horário do dia. Hard ou soft."""

    tipo = "ultimo_horario"

    def aplicar(self, ctx: ContextoModelo) -> None:
        disciplina_id = self.config.parametros["disciplina_id"]
        for i, aula in enumerate(ctx.aulas):
            if aula.atribuicao.disciplina_id != disciplina_id:
                continue
            slots = ctx.slots_da_turma(aula.atribuicao.turma_id)
            ultima_ordem = {
                dia: max(s.ordem for s in slots if s.dia == dia)
                for dia in {s.dia for s in slots}
            }
            for s in slots:
                if s.ordem != ultima_ordem[s.dia]:
                    continue
                var = ctx.x[(i, s.id)]
                if self.config.hard:
                    lit = ctx.assumption(f"ultimo_horario:{self.config.id}")
                    ctx.model.add(var == 0).only_enforce_if(lit)
                else:
                    ctx.adicionar_custo(
                        self.config.id,
                        self.tipo,
                        var,
                        self.config.peso,
                        f"{disciplina_id}: aula no último horário ({s.id})",
                    )
