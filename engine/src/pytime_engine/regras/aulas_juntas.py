from collections import defaultdict

from ..modelo import ContextoModelo
from .base import Regra, registrar


@registrar
class RegraAulasJuntas(Regra):
    """Aulas da mesma disciplina no mesmo dia da turma ficam em sequência.

    Vale para todas as disciplinas de todas as turmas. Aulas em dias
    diferentes continuam permitidas; a regra só proíbe, num mesmo dia, mais
    de um bloco de aulas seguidas da disciplina. Professores diferentes da
    mesma disciplina na turma contam como uma disciplina só.

    Formulação: num dia, um bloco "começa" no horário ocupado cujo horário
    anterior (ordem - 1) não é da disciplina; hard exige no máximo um
    começo por dia, soft cobra cada começo além do primeiro.

    Limitação: horários não consecutivos na grade do turno (ordens com
    lacuna, como um intervalo cadastrado como falta de horário) separam os
    blocos.
    """

    tipo = "aulas_juntas"

    def aplicar(self, ctx: ContextoModelo) -> None:
        nomes = {d.id: d.nome for d in ctx.instancia.disciplinas}
        for turma in ctx.instancia.turmas:
            atribs_por_disciplina: dict[str, list[str]] = defaultdict(list)
            carga: dict[str, int] = defaultdict(int)
            for a in ctx.instancia.atribuicoes:
                if a.turma_id == turma.id:
                    atribs_por_disciplina[a.disciplina_id].append(a.id)
                    carga[a.disciplina_id] += a.carga_semanal
            slots_por_dia = defaultdict(list)
            for s in ctx.slots_da_turma(turma.id):
                slots_por_dia[s.dia].append(s)
            for disciplina_id, atribs in sorted(atribs_por_disciplina.items()):
                if carga[disciplina_id] < 2:
                    continue  # uma aula só nunca fica separada
                for dia, slots in sorted(slots_por_dia.items()):
                    slots = sorted(slots, key=lambda s: s.ordem)
                    occ = [
                        sum(ctx.occ_atribuicao(a, s.id) for a in atribs) for s in slots
                    ]
                    comecos = []
                    for p, s in enumerate(slots):
                        inicio = ctx.model.new_bool_var(
                            f"{self.config.id}_ini_{turma.id}_{disciplina_id}_{s.id}"
                        )
                        anterior_colado = p > 0 and slots[p - 1].ordem == s.ordem - 1
                        if anterior_colado:
                            ctx.model.add(inicio >= occ[p] - occ[p - 1])
                        else:
                            ctx.model.add(inicio >= occ[p])
                        comecos.append(inicio)
                    if self.config.hard:
                        lit = ctx.assumption(f"aulas_juntas:{turma.id}")
                        ctx.model.add(sum(comecos) <= 1).only_enforce_if(lit)
                    else:
                        extra = ctx.model.new_int_var(
                            0,
                            len(slots),
                            f"{self.config.id}_extra_{turma.id}_{disciplina_id}_{dia}",
                        )
                        ctx.model.add(extra >= sum(comecos) - 1)
                        ctx.adicionar_custo(
                            self.config.id,
                            self.tipo,
                            extra,
                            self.config.peso,
                            f"{turma.nome}: {nomes.get(disciplina_id)} separada"
                            f" no dia {dia}",
                        )
