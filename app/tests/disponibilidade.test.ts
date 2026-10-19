import { describe, expect, it } from "vitest";
import {
  CICLO_TURMA,
  proximoStatus,
  type StatusDisponibilidade,
} from "@/lib/disponibilidade";

describe("proximoStatus", () => {
  it("cicla disponível → indisponível → prefere → evita → disponível", () => {
    const ciclo: StatusDisponibilidade[] = [
      "disponivel",
      "indisponivel",
      "prefere",
      "evita",
    ];
    for (let i = 0; i < ciclo.length; i++) {
      expect(proximoStatus(ciclo[i])).toBe(ciclo[(i + 1) % ciclo.length]);
    }
  });

  it("turma só alterna entre tem aula e sem aula", () => {
    expect(proximoStatus("disponivel", CICLO_TURMA)).toBe("indisponivel");
    expect(proximoStatus("indisponivel", CICLO_TURMA)).toBe("disponivel");
  });
});
