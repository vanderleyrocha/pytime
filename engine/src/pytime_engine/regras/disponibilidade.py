from ..instancia import Disponibilidade
from ..modelo import ContextoModelo
from .base import Regra, registrar


@registrar
class RegraDisponibilidadeProfessor(Regra):
    tipo = "disponibilidade_professor"

    def aplicar(self, ctx: ContextoModelo) -> None:
        indisp_por_prof = {
            p.id: {
                s
                for s, st in p.disponibilidade.items()
                if st == Disponibilidade.INDISPONIVEL
            }
            for p in ctx.instancia.professores
        }
        for i, aula in enumerate(ctx.aulas):
            prof_id = aula.atribuicao.professor_id
            for slot_id in indisp_por_prof.get(prof_id, ()):
                if (i, slot_id) in ctx.x:
                    lit = ctx.assumption(f"disponibilidade:{prof_id}")
                    ctx.model.add(ctx.x[(i, slot_id)] == 0).only_enforce_if(lit)
