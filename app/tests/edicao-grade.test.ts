import { describe, expect, it } from "vitest";
import { reaplicarTrocas, vizinho } from "@/lib/edicao/grade";
import type { Aula } from "@/lib/edicao/trocas";

// 2 dias × 2 horários
const slots = [
  { id: "a0", dia: 0, ordem: 0 },
  { id: "a1", dia: 0, ordem: 1 },
  { id: "b0", dia: 1, ordem: 0 },
  { id: "b1", dia: 1, ordem: 1 },
];

describe("vizinho", () => {
  it("anda por horário (vertical) e por dia (horizontal)", () => {
    expect(vizinho(slots, "a0", "baixo")).toBe("a1");
    expect(vizinho(slots, "a1", "cima")).toBe("a0");
    expect(vizinho(slots, "a0", "direita")).toBe("b0");
    expect(vizinho(slots, "b1", "esquerda")).toBe("a1");
  });

  it("para na borda", () => {
    expect(vizinho(slots, "a0", "cima")).toBe("a0");
    expect(vizinho(slots, "b1", "direita")).toBe("b1");
  });
});

describe("reaplicarTrocas", () => {
  const mapa = { mat: "T1", por: "T1", his: "T1" };
  const base: Aula[] = [
    { atribuicao_id: "mat", slot_id: "a0" },
    { atribuicao_id: "por", slot_id: "a1" },
    { atribuicao_id: "his", slot_id: "b0" },
  ];

  it("reaplica as trocas sobre a grade salva por outra pessoa", () => {
    const r = reaplicarTrocas(
      base,
      [{ slotA: "a0", slotB: "b0", turmaId: "T1" }],
      mapa,
    );
    expect(r.descartadas).toEqual([]);
    expect(
      r.rascunho.aulas.find((a) => a.atribuicao_id === "mat")?.slot_id,
    ).toBe("b0");
    expect(r.rascunho.feitas).toHaveLength(1);
  });

  it("descarta a troca que não cabe mais e segue com as outras", () => {
    const r = reaplicarTrocas(
      base,
      [
        { slotA: "a0", slotB: "zz", turmaId: "T1" }, // horário que sumiu
        { slotA: "a1", slotB: "b0", turmaId: "T1" },
      ],
      mapa,
    );
    expect(r.descartadas).toHaveLength(1);
    expect(r.rascunho.feitas).toHaveLength(1);
  });
});
