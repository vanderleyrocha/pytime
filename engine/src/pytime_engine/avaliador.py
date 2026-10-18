"""Avaliação de uma grade pronta contra as regras do catálogo.

Serve à edição manual (Fase 3): em vez de reimplementar as regras em outra
linguagem, monta o mesmo modelo do solver, fixa cada `x[aula, slot]` conforme
a grade (num clone, para reaproveitar o modelo entre grades) e deixa o
CP-SAT apenas propagar.
"""

import time
from collections import Counter, defaultdict

from ortools.sat.python import cp_model

from .instancia import Instancia
from .modelo import ContextoModelo
from .resultado import AulaAlocada, Avaliacao

# A montagem é compartilhada de propósito: avaliar e resolver precisam aplicar
# exatamente as mesmas regras, do mesmo jeito.
from .solver import _consolidar_custos, _montar

#: teto (s) do solve de avaliação: com a grade fixada o CP-SAT só propaga, e
#: o chamador é síncrono (edição manual), então não herda o budget da geração.
_BUDGET_AVALIACAO = 5.0


def _configurar(solver: cp_model.CpSolver) -> None:
    """Parâmetros do solve de avaliação (não da geração).

    Com a grade fixada não há busca: o tempo é presolve + propagação. O
    portfólio paralelo do `num_workers = 8` da geração só adiciona overhead
    (80 turmas: 1,0 s com 8 workers contra 0,26 s com 1 worker e probing,
    simetria e linearização desligados, mesmo ótimo provado).
    """
    solver.parameters.max_time_in_seconds = _BUDGET_AVALIACAO
    solver.parameters.num_workers = 1
    solver.parameters.cp_model_probing_level = 0
    solver.parameters.symmetry_level = 0
    solver.parameters.linearization_level = 0


class AvaliadorPreparado:
    """Modelo de uma instância montado uma vez, para avaliar várias grades.

    A montagem domina o custo de `avaliar` (≈1 s em 80 turmas); a edição
    manual avalia muitas grades da mesma instância, então o processo
    validador guarda um `AvaliadorPreparado` por instância e cada
    `avaliar(grade)` clona o modelo montado e só acrescenta as igualdades
    que fixam a grade. Fixar por assumptions seria mais barato de montar,
    mas desliga parte do presolve e o solve deixa de provar o ótimo no
    budget (mesmo efeito descrito para a fase 1 do solver).

    Diferente do núcleo de conflito do solver (um subconjunto suficiente),
    aqui todas as regras hard violadas são listadas: cada literal de regra
    hard fica livre e o objetivo minimiza custo soft + nº de literais
    desligados; com a grade fixada, só os literais de regras violadas são
    forçados a 0.

    Premissa: nenhuma variável de custo soft depende de um literal hard
    (vale para todas as regras do catálogo atual). Se uma regra futura compartilhar
    variável entre a parte hard e a soft, o solver poderia desligar um
    literal só para baratear o soft; aí o termo dos desligados precisa de
    peso lexicográfico.

    Limitações: erros da própria instância voltam como `instancia:<frase>`;
    se a grade quebra uma restrição estrutural (carga, turma ou professor em
    choque, slot fora do turno), só essas violações são devolvidas — com a
    grade fixada o modelo seria inviável, então regras do catálogo e custos
    não são avaliados.

    Concorrência: cada `avaliar` clona o modelo e usa um solver próprio, mas
    a segurança de clonar o mesmo `CpModel` de várias threads não é garantida
    pelo OR-Tools; o validador deve serializar as chamadas por instância.
    """

    def __init__(self, instancia: Instancia):
        # cópia própria: o modelo montado e a checagem estrutural precisam ver
        # a mesma instância, mesmo que o chamador mute a original depois
        self.instancia = instancia = instancia.model_copy(deep=True)
        self._erros_instancia = [
            f"instancia:{e}"
            for e in instancia.validar_referencias() or instancia.validar_matriz_cheia()
        ]
        if self._erros_instancia:
            return
        self._ctx, termos = _montar(instancia)
        desligados = [~lit for lit in self._ctx.assumptions.values()]
        self._ctx.model.minimize(sum(termos) + sum(desligados))

    def avaliar(self, grade: list[AulaAlocada]) -> Avaliacao:
        """Diz quais regras hard a grade viola e quanto ela custa nas soft.

        Levanta `RuntimeError` se o CP-SAT não provar o resultado em
        `_BUDGET_AVALIACAO` segundos (um literal em 0 sem prova de
        otimalidade seria uma violação possivelmente falsa).
        """
        inicio = time.monotonic()
        erros = self._erros_instancia or _violacoes_estruturais(self.instancia, grade)
        if erros:
            return Avaliacao(
                violacoes_hard=erros, tempo_segundos=time.monotonic() - inicio
            )

        ctx = self._ctx
        # o clone preserva os índices das variáveis, então `solver.value` das
        # variáveis do contexto original lê a resposta do clone
        modelo = ctx.model.clone()
        for indice in _ocupados_da_grade(ctx, grade):
            modelo.add(modelo.get_bool_var_from_proto_index(indice) == 1)

        solver = cp_model.CpSolver()
        _configurar(solver)
        status = solver.solve(modelo)
        if status == cp_model.MODEL_INVALID:
            raise RuntimeError("Modelo CP-SAT inválido: " + modelo.validate())
        if status != cp_model.OPTIMAL:
            raise RuntimeError(
                f"Avaliação não concluída (status {solver.status_name(status)})."
            )

        valor = _leitor_de_valores(solver)
        violacoes = sorted(m for m, lit in ctx.assumptions.items() if valor(lit) == 0)
        custos, total = _consolidar_custos(ctx, valor, grade)
        return Avaliacao(
            violacoes_hard=violacoes,
            custos=custos,
            custo_total=total,
            tempo_segundos=time.monotonic() - inicio,
        )


def _leitor_de_valores(solver: cp_model.CpSolver):
    """Lê valores da solução direto do response por índice.

    `solver.value` por variável custava ~0,3 s em 80 turmas (≈18 mil termos
    de custo); variáveis simples são lidas do vetor da solução, e qualquer
    outra expressão cai no `solver.value`.
    """
    solucao = list(solver.response_proto.solution)

    def valor(expr) -> int:
        if isinstance(expr, cp_model.IntVar) and expr.index >= 0:
            return solucao[expr.index]
        return int(solver.value(expr))

    return valor


def avaliar(instancia: Instancia, grade: list[AulaAlocada]) -> Avaliacao:
    """Avalia uma única grade (monta o modelo a cada chamada).

    Para várias grades da mesma instância use `AvaliadorPreparado`.
    """
    return AvaliadorPreparado(instancia).avaliar(grade)


def _violacoes_estruturais(instancia: Instancia, grade: list[AulaAlocada]) -> list[str]:
    """Checa em Python as restrições básicas, que não têm literal de assumption."""
    atribuicoes = {a.id: a for a in instancia.atribuicoes}
    turno_da_turma = {t.id: t.turno_id for t in instancia.turmas}
    slots_do_turno: dict[str, set[str]] = defaultdict(set)
    for s in instancia.slots:
        slots_do_turno[s.turno_id].add(s.id)

    erros: set[str] = set()
    carga: Counter[str] = Counter()
    ocupacao_turma: Counter[tuple[str, str]] = Counter()
    ocupacao_professor: Counter[tuple[str, str]] = Counter()
    for aula in grade:
        atrib = atribuicoes.get(aula.atribuicao_id)
        if atrib is None:
            erros.add(f"estrutural:atribuicao_desconhecida:{aula.atribuicao_id}")
            continue
        carga[atrib.id] += 1
        if aula.slot_id not in slots_do_turno[turno_da_turma[atrib.turma_id]]:
            erros.add(f"estrutural:fora_do_turno:{atrib.id}:{aula.slot_id}")
            continue
        ocupacao_turma[(atrib.turma_id, aula.slot_id)] += 1
        ocupacao_professor[(atrib.professor_id, aula.slot_id)] += 1

    for atrib in instancia.atribuicoes:
        if carga[atrib.id] != atrib.carga_semanal:
            erros.add(f"estrutural:carga:{atrib.id}")
    for turma_id, turno_id in turno_da_turma.items():
        for slot_id in slots_do_turno[turno_id]:
            n = ocupacao_turma[(turma_id, slot_id)]
            if n == 0:
                erros.add(f"estrutural:turma_vazio:{turma_id}:{slot_id}")
            elif n > 1:
                erros.add(f"estrutural:turma_duplo:{turma_id}:{slot_id}")
    for (prof_id, slot_id), n in ocupacao_professor.items():
        if n > 1:
            erros.add(f"estrutural:professor_duplo:{prof_id}:{slot_id}")
    return sorted(erros)


def _ocupados_da_grade(ctx: ContextoModelo, grade: list[AulaAlocada]) -> list[int]:
    """Índices no proto dos x[aula, slot] que valem 1 na grade.

    Basta fixar esses: o `exactly_one` por aula do modelo zera os demais na
    propagação (uma igualdade por aula, não uma por par aula × slot).

    As aulas de uma atribuição recebem os slots em ordem de posição no turno,
    a mesma ordem exigida pela quebra de simetria do modelo.
    """
    slots_por_atrib: dict[str, list[str]] = defaultdict(list)
    for alocada in grade:
        slots_por_atrib[alocada.atribuicao_id].append(alocada.slot_id)

    proximo: dict[str, int] = defaultdict(int)
    slot_da_aula: dict[int, str] = {}
    ordenados: dict[str, list[str]] = {}
    for i, aula in enumerate(ctx.aulas):
        atrib = aula.atribuicao
        if atrib.id not in ordenados:
            posicao = {
                s.id: k for k, s in enumerate(ctx.slots_da_turma(atrib.turma_id))
            }
            ordenados[atrib.id] = sorted(
                slots_por_atrib[atrib.id], key=posicao.__getitem__
            )
        slot_da_aula[i] = ordenados[atrib.id][proximo[atrib.id]]
        proximo[atrib.id] += 1

    return [ctx.x[(i, slot_id)].index for i, slot_id in slot_da_aula.items()]
