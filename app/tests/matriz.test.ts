import { describe, expect, it } from "vitest";
import { calcularPendencias } from "@/lib/matriz";

const turmas = [
  { id: "t1", nome: "6º A", turno_id: "manha" },
  { id: "t2", nome: "6º B", turno_id: "manha" },
];

describe("calcularPendencias", () => {
  it("aponta turma com carga menor que os slots do turno", () => {
    const pendencias = calcularPendencias(
      turmas,
      { manha: 20 },
      { t1: 18, t2: 20 },
    );
    expect(pendencias).toEqual([
      { turma_id: "t1", turma_nome: "6º A", esperado: 20, atual: 18 },
    ]);
  });
  it("aponta excesso e turma sem nenhuma atribuição", () => {
    const pendencias = calcularPendencias(
      turmas,
      { manha: 20 },
      { t1: 22 },
    );
    expect(pendencias).toHaveLength(2);
    expect(pendencias[0]).toMatchObject({ turma_id: "t1", atual: 22 });
    expect(pendencias[1]).toMatchObject({ turma_id: "t2", atual: 0 });
  });
  it("matriz cheia não gera pendência", () => {
    expect(
      calcularPendencias(turmas, { manha: 20 }, { t1: 20, t2: 20 }),
    ).toEqual([]);
  });
});
