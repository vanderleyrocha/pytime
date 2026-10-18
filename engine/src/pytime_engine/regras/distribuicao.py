import math

from ..modelo import ContextoModelo
from ..ocorrencias import aulas_em, no_dia
from .base import Regra, registrar


@registrar
class RegraDistribuicaoDisciplina(Regra):
    """Máximo de N aulas/dia por atribuição + espalhar pelos dias.

    Dois termos por atribuição: aulas acima do máximo em cada dia e dias
    que faltam para o mínimo ⌈carga / máximo⌉.

    Limitação conhecida: a mesma concentração costuma pesar nos dois termos
    (4 aulas num dia com máximo 2 = 2 de excesso + 1 dia faltando).
    """

    tipo = "distribuicao_disciplina"

    def aplicar(self, ctx: ContextoModelo) -> None:
        max_por_dia = int(self.config.parametros.get("max_por_dia", 2))
        if max_por_dia < 1:
            raise ValueError(
                "Parâmetro max_por_dia deve ser >= 1 na regra distribuicao_disciplina"
            )
        nome_turma = {t.id: t.nome for t in ctx.instancia.turmas}
        for atrib in ctx.instancia.atribuicoes:
            slots = ctx.slots_da_turma(atrib.turma_id)
            dias: dict[int, list] = {}
            for s in slots:
                dias.setdefault(s.dia, []).append(s)
            disciplina = next(
                d.nome for d in ctx.instancia.disciplinas if d.id == atrib.disciplina_id
            )
            turma = nome_turma[atrib.turma_id]
            dia_usado_vars = []
            for dia, slots_dia in sorted(dias.items()):
                aulas_no_dia = sum(
                    ctx.occ_atribuicao(atrib.id, s.id) for s in slots_dia
                )
                excesso = ctx.model.new_int_var(
                    0, len(slots_dia), f"exc_{atrib.id}_{dia}"
                )
                ctx.model.add(excesso >= aulas_no_dia - max_por_dia)
                ctx.adicionar_custo(
                    self.config.id,
                    self.tipo,
                    excesso,
                    self.config.peso,
                    f"{turma} – {disciplina}: aulas acima do máximo"
                    f" ({max_por_dia}) {no_dia(dia)}",
                    aulas_em([atrib.id], [s.id for s in slots_dia], "turma"),
                )
                usado = ctx.model.new_bool_var(f"dia_{atrib.id}_{dia}")
                ctx.model.add(aulas_no_dia >= 1).only_enforce_if(usado)
                ctx.model.add(aulas_no_dia == 0).only_enforce_if(usado.Not())
                dia_usado_vars.append(usado)
            dias_min = min(math.ceil(atrib.carga_semanal / max_por_dia), len(dias))
            falta = ctx.model.new_int_var(0, len(dias), f"falta_{atrib.id}")
            ctx.model.add(falta >= dias_min - sum(dia_usado_vars))
            ctx.adicionar_custo(
                self.config.id,
                self.tipo,
                falta,
                self.config.peso,
                f"{turma} – {disciplina}: concentrada em poucos dias"
                f" (mínimo {dias_min})",
                aulas_em([atrib.id], [s.id for s in slots], "turma"),
            )
