from ..instancia import Disponibilidade
from ..modelo import ContextoModelo
from ..ocorrencias import aulas_em, rotulo_slot
from .base import Regra, registrar


@registrar
class RegraPreferenciaProfessor(Regra):
    """Penaliza aulas em slots 'evita' e fora dos slots 'prefere'."""

    tipo = "preferencia_professor"

    def aplicar(self, ctx: ContextoModelo) -> None:
        for prof in ctx.instancia.professores:
            evita = {
                s
                for s, st in prof.disponibilidade.items()
                if st == Disponibilidade.EVITA
            }
            prefere = {
                s
                for s, st in prof.disponibilidade.items()
                if st == Disponibilidade.PREFERE
            }
            for i, aula in enumerate(ctx.aulas):
                if aula.atribuicao.professor_id != prof.id:
                    continue
                for s in ctx.slots_da_turma(aula.atribuicao.turma_id):
                    var = ctx.x[(i, s.id)]
                    if s.id in evita:
                        ctx.adicionar_custo(
                            self.config.id,
                            self.tipo,
                            var,
                            self.config.peso,
                            f"{prof.nome}: aula em horário evitado ({rotulo_slot(s)})",
                            aulas_em([aula.atribuicao.id], [s.id], "professor"),
                        )
                    elif prefere and s.id not in prefere:
                        ctx.adicionar_custo(
                            self.config.id,
                            self.tipo,
                            var,
                            self.config.peso,
                            f"{prof.nome}: aula fora dos horários preferidos"
                            f" ({rotulo_slot(s)})",
                            aulas_em([aula.atribuicao.id], [s.id], "professor"),
                        )


@registrar
class RegraPreferenciaDisciplina(Regra):
    """Parâmetros: disciplina_id, ordens (posições no dia), modo.

    modo='evita': penaliza aula da disciplina nas ordens listadas.
    modo='prefere': penaliza aula fora das ordens listadas
    (ex.: pesadas cedo -> ordens=[0,1], modo='prefere').
    """

    tipo = "preferencia_disciplina"

    def aplicar(self, ctx: ContextoModelo) -> None:
        disciplina_id = self.config.parametros["disciplina_id"]
        ordens = set(self.config.parametros["ordens"])
        modo = self.config.parametros.get("modo", "evita")
        nome_disciplina = next(
            (d.nome for d in ctx.instancia.disciplinas if d.id == disciplina_id),
            disciplina_id,
        )
        nome_turma = {t.id: t.nome for t in ctx.instancia.turmas}
        motivo = (
            "aula em horário evitado"
            if modo == "evita"
            else "aula fora dos horários preferidos"
        )
        for i, aula in enumerate(ctx.aulas):
            if aula.atribuicao.disciplina_id != disciplina_id:
                continue
            for s in ctx.slots_da_turma(aula.atribuicao.turma_id):
                penaliza = (
                    s.ordem in ordens if modo == "evita" else s.ordem not in ordens
                )
                if penaliza:
                    ctx.adicionar_custo(
                        self.config.id,
                        self.tipo,
                        ctx.x[(i, s.id)],
                        self.config.peso,
                        f"{nome_turma[aula.atribuicao.turma_id]} –"
                        f" {nome_disciplina}: {motivo} ({rotulo_slot(s)})",
                        aulas_em([aula.atribuicao.id], [s.id], "turma"),
                    )
