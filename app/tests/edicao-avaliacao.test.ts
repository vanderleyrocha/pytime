import { describe, expect, it } from "vitest";
import {
  custoExibido,
  deltaCusto,
  type Avaliacao,
} from "@/lib/edicao/avaliacao";

const av = (custos: [string, string, number][]): Avaliacao => ({
  violacoes_hard: [],
  custos: custos.map(([regra_id, tipo, custo]) => ({
    regra_id,
    tipo,
    custo,
    detalhes: [],
  })),
  custo_total: custos.reduce((s, [, , c]) => s + c, 0),
  tempo_segundos: 0.1,
});

describe("deltaCusto", () => {
  it("compara total e regra a regra, incluindo regras que somem ou aparecem", () => {
    const d = deltaCusto(
      av([
        ["r1", "janelas_professor", 10],
        ["r2", "compactacao_dias", 4],
      ]),
      av([
        ["r1", "janelas_professor", 7],
        ["r3", "ultimo_horario", 2],
      ]),
    );
    expect(d.total).toBe(-5);
    expect(d.porRegra).toEqual([
      { regra_id: "r1", tipo: "janelas_professor", delta: -3 },
      { regra_id: "r2", tipo: "compactacao_dias", delta: -4 },
      { regra_id: "r3", tipo: "ultimo_horario", delta: 2 },
    ]);
  });

  it("omite regras sem variação", () => {
    const d = deltaCusto(av([["r1", "x", 3]]), av([["r1", "x", 3]]));
    expect(d).toEqual({ total: 0, porRegra: [] });
  });

  it("sem base, o delta é o próprio custo", () => {
    expect(deltaCusto(null, av([["r1", "x", 3]])).total).toBe(3);
  });
});

describe("custoExibido", () => {
  it("prefere a avaliação exata do cenário", () => {
    expect(custoExibido(av([["r1", "x", 5]]), { custo_total: 9 })).toEqual({
      total: 5,
      fonte: "avaliado",
    });
  });

  it("sem avaliação, usa o resultado da geração como estimativa", () => {
    expect(custoExibido(null, { custo_total: 9 })).toEqual({
      total: 9,
      fonte: "estimado",
    });
  });

  it("sem nenhum dos dois, não há custo", () => {
    expect(custoExibido(null, null)).toBeNull();
  });
});
