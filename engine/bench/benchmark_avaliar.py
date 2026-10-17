"""Latência de `avaliar` (validação da edição manual) por porte de escola.

Uso: python bench/benchmark_avaliar.py [--turmas 20 40 80] [--repeticoes 10]
Resolve cada instância uma vez para obter uma grade viável e mede `avaliar`
sobre ela. Meta da spec (§6, edição manual): p95 ≤ 1 s em 80 turmas.
"""

import argparse
import statistics
import time

from pytime_engine import avaliar, resolver
from pytime_engine.gerador import gerar


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--turmas", nargs="+", type=int, default=[20, 40, 80])
    parser.add_argument("--repeticoes", type=int, default=10)
    parser.add_argument("--budget", type=float, default=120.0)
    args = parser.parse_args()

    print(f"{'turmas':>7} {'mediana(s)':>11} {'p95(s)':>8} {'violacoes':>10}")
    for n in args.turmas:
        inst = gerar(n, seed=7)
        inst.budget_segundos = args.budget
        r = resolver(inst)
        if not r.grade:
            print(f"{n:>7} sem grade ({r.status})")
            continue
        tempos = []
        violacoes = 0
        for _ in range(args.repeticoes):
            inicio = time.monotonic()
            av = avaliar(inst, r.grade)
            tempos.append(time.monotonic() - inicio)
            violacoes = len(av.violacoes_hard)
        tempos.sort()
        p95 = tempos[min(len(tempos) - 1, int(0.95 * len(tempos)))]
        print(f"{n:>7} {statistics.median(tempos):>11.3f} {p95:>8.3f} {violacoes:>10}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
