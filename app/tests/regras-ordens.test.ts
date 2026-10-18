import { describe, expect, it } from "vitest";
import { ordensDaUnidade } from "@/lib/validacao/regras";

describe("ordensDaUnidade", () => {
  it("vai do 1º ao maior horário cadastrado em qualquer turno", () => {
    expect(ordensDaUnidade([{ ordem: 0 }, { ordem: 4 }, { ordem: 2 }])).toEqual(
      [0, 1, 2, 3, 4],
    );
  });

  it("sem horários cadastrados, oferece um dia típico (1º ao 6º)", () => {
    expect(ordensDaUnidade([])).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
