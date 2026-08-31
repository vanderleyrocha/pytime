"""Benchmark tempo × qualidade do motor.

Uso: python bench/benchmark.py [--turmas 20 40 80] [--budget 60]
Sai com código 1 se algum caso não alcançar solução viável no budget.
"""
import argparse
import sys

from pytime_engine import resolver
from pytime_engine.gerador import gerar


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--turmas", nargs="+", type=int,
                        default=[20, 40, 80])
    parser.add_argument("--budget", type=float, default=60.0)
    args = parser.parse_args()

    print(f"{'turmas':>7} {'aulas':>7} {'status':>22} "
          f"{'custo':>7} {'tempo(s)':>9}")
    falhou = False
    for n in args.turmas:
        inst = gerar(n, seed=7)
        inst.budget_segundos = args.budget
        n_aulas = sum(a.carga_semanal for a in inst.atribuicoes)
        r = resolver(inst)
        print(f"{n:>7} {n_aulas:>7} {r.status:>22} "
              f"{r.custo_total:>7} {r.tempo_segundos:>9.1f}")
        if r.status not in ("otimo", "viavel"):
            falhou = True
            if r.nucleo_conflito:
                print(f"        núcleo: {r.nucleo_conflito}")
    return 1 if falhou else 0


if __name__ == "__main__":
    sys.exit(main())
