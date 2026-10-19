from ..instancia import Disponibilidade
from ..modelo import ContextoModelo
from .base import Regra, registrar


@registrar
class RegraDisponibilidadeDisciplina(Regra):
    """Aula da disciplina nunca em slot marcado `indisponivel` para ela.

    Usa `Disciplina.disponibilidade` (ex.: Educação Física só quando a quadra
    está livre). Sempre hard; `prefere`/`evita` ficam para a regra soft
    `preferencia_disciplina_horario`. Um literal por disciplina no núcleo de
    conflito.

    Limitação: a marcação vale para a disciplina em todas as turmas; não há
    disponibilidade por atribuição (disciplina × turma).
    """

    tipo = "disponibilidade_disciplina"

    def aplicar(self, ctx: ContextoModelo) -> None:
        indisp_por_disciplina = {
            d.id: sorted(
                s
                for s, st in d.disponibilidade.items()
                if st == Disponibilidade.INDISPONIVEL
            )
            for d in ctx.instancia.disciplinas
        }
        for i, aula in enumerate(ctx.aulas):
            disciplina_id = aula.atribuicao.disciplina_id
            for slot_id in indisp_por_disciplina.get(disciplina_id, ()):
                if (i, slot_id) in ctx.x:
                    lit = ctx.assumption(f"disponibilidade_disciplina:{disciplina_id}")
                    ctx.model.add(ctx.x[(i, slot_id)] == 0).only_enforce_if(lit)
