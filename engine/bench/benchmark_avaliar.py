"""Latência da validação da edição manual por porte de escola.

Uso: python bench/benchmark_avaliar.py [--turmas 20 40 80] [--repeticoes 10]
Resolve cada instância uma vez para obter uma grade viável e mede:
- `isolado`: `avaliar(instancia, grade)`, que monta o modelo a cada chamada;
- `preparo`: construção de um `AvaliadorPreparado` (uma vez por instância);
- `preparado`: `AvaliadorPreparado.avaliar(grade)` com o modelo já montado,
  alternando a grade original e uma com duas aulas trocadas.
Meta da spec (§6, edição manual): p95 ≤ 1 s em 80 turmas.
"""

import argparse
import statistics
import time

from pytime_engine import AvaliadorPreparado, avaliar, resolver
from pytime_engine.gerador import gerar
from pytime_engine.resultado import AulaAlocada


def _p95(tempos: list[float]) -> float:
    ordenados = sorted(tempos)
    return ordenados[min(len(ordenados) - 1, int(0.95 * len(ordenados)))]


def _medir(f, repeticoes: int) -> list[float]:
    tempos = []
    for k in range(repeticoes):
        inicio = time.monotonic()
        f(k)
        tempos.append(time.monotonic() - inicio)
    return tempos


def _troca_sem_choque(inst, grade: list[AulaAlocada]) -> list[AulaAlocada]:
    """Troca duas aulas de uma turma sem criar choque estrutural de professor.

    Assim a medição exercita o solve completo (regras e custos), como numa
    edição manual típica, e não o atalho das violações estruturais.
    """
    atrib = {a.id: a for a in inst.atribuicoes}
    ocupado = {(atrib[x.atribuicao_id].professor_id, x.slot_id) for x in grade}
    for i, a in enumerate(grade):
        pa = atrib[a.atribuicao_id]
        for j in range(i + 1, len(grade)):
            b = grade[j]
            pb = atrib[b.atribuicao_id]
            if pb.turma_id != pa.turma_id or pb.professor_id == pa.professor_id:
                continue
            if (pa.professor_id, b.slot_id) in ocupado:
                continue
            if (pb.professor_id, a.slot_id) in ocupado:
                continue
            nova = list(grade)
            nova[i] = AulaAlocada(atribuicao_id=a.atribuicao_id, slot_id=b.slot_id)
            nova[j] = AulaAlocada(atribuicao_id=b.atribuicao_id, slot_id=a.slot_id)
            return nova
    raise RuntimeError("Nenhuma troca sem choque encontrada.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--turmas", nargs="+", type=int, default=[20, 40, 80])
    parser.add_argument("--repeticoes", type=int, default=10)
    parser.add_argument("--budget", type=float, default=120.0)
    args = parser.parse_args()

    print(
        f"{'turmas':>7} {'isolado med/p95(s)':>19} {'preparo(s)':>11} "
        f"{'preparado med/p95(s)':>21}"
    )
    for n in args.turmas:
        inst = gerar(n, seed=7)
        inst.budget_segundos = args.budget
        r = resolver(inst)
        if not r.grade:
            print(f"{n:>7} sem grade ({r.status})")
            continue
        trocada = _troca_sem_choque(inst, r.grade)
        grades = [r.grade, trocada]

        isolado = _medir(
            lambda k, inst=inst, grades=grades: avaliar(inst, grades[k % 2]),
            args.repeticoes,
        )
        inicio = time.monotonic()
        preparado = AvaliadorPreparado(inst)
        preparo = time.monotonic() - inicio
        repetido = _medir(
            lambda k, p=preparado, grades=grades: p.avaliar(grades[k % 2]),
            args.repeticoes,
        )
        print(
            f"{n:>7} {statistics.median(isolado):>9.3f}/{_p95(isolado):<9.3f} "
            f"{preparo:>11.3f} "
            f"{statistics.median(repetido):>10.3f}/{_p95(repetido):<10.3f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
