from collections import defaultdict

from ..modelo import ContextoModelo
from ..ocorrencias import rotulo_slot, turmas_em
from .base import Regra, registrar


@registrar
class RegraDisciplinaSincronizada(Regra):
    """A disciplina escolhida ocupa os mesmos horários em todas as turmas.

    Parâmetro: `disciplina_id`. Entram todas as turmas com atribuição da
    disciplina; cada uma é alinhada à primeira turma do mesmo turno. Hard
    exige horários idênticos; soft cobra cada horário em que a disciplina
    está numa turma e não na de referência (ou o contrário).

    Limitações: só alinha turmas do mesmo turno (turnos diferentes têm
    horários distintos); cargas diferentes entre as turmas, ou o mesmo
    professor dando a disciplina em duas turmas do turno, tornam a versão
    hard inviável. Para as aulas ficarem juntas, use as geminadas da
    atribuição ou a regra "aulas_juntas".
    """

    tipo = "disciplina_sincronizada"

    def aplicar(self, ctx: ContextoModelo) -> None:
        disciplina_id = self.config.parametros["disciplina_id"]
        atribs_por_turma: dict[str, list[str]] = defaultdict(list)
        for a in ctx.instancia.atribuicoes:
            if a.disciplina_id == disciplina_id:
                atribs_por_turma[a.turma_id].append(a.id)
        turmas_por_turno: dict[str, list[str]] = defaultdict(list)
        for turma in ctx.instancia.turmas:
            if turma.id in atribs_por_turma:
                turmas_por_turno[turma.turno_id].append(turma.id)

        nome_disciplina = next(
            (d.nome for d in ctx.instancia.disciplinas if d.id == disciplina_id),
            disciplina_id,
        )
        nome_turma = {t.id: t.nome for t in ctx.instancia.turmas}

        def occ(turma_id: str, slot_id: str):
            return sum(
                ctx.occ_atribuicao(a, slot_id) for a in atribs_por_turma[turma_id]
            )

        for turmas in turmas_por_turno.values():
            referencia, *outras = turmas
            slots = ctx.slots_da_turma(referencia)
            for turma_id in outras:
                for s in slots:
                    if self.config.hard:
                        lit = ctx.assumption(
                            f"disciplina_sincronizada:{self.config.id}"
                        )
                        ctx.model.add(
                            occ(turma_id, s.id) == occ(referencia, s.id)
                        ).only_enforce_if(lit)
                    else:
                        diferente = ctx.model.new_bool_var(
                            f"{self.config.id}_dif_{turma_id}_{s.id}"
                        )
                        ctx.model.add(
                            diferente >= occ(turma_id, s.id) - occ(referencia, s.id)
                        )
                        ctx.model.add(
                            diferente >= occ(referencia, s.id) - occ(turma_id, s.id)
                        )
                        # amarrado por cima: custo exato em qualquer solução
                        ctx.model.add(
                            diferente <= occ(turma_id, s.id) + occ(referencia, s.id)
                        )
                        ctx.model.add(
                            diferente <= 2 - occ(turma_id, s.id) - occ(referencia, s.id)
                        )
                        ctx.adicionar_custo(
                            self.config.id,
                            self.tipo,
                            diferente,
                            self.config.peso,
                            f"{nome_disciplina} fora de sincronia em"
                            f" {nome_turma[turma_id]} ({rotulo_slot(s)})",
                            turmas_em([referencia, turma_id], [s.id]),
                        )
