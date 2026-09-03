import { describe, expect, it } from "vitest";
import {
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
});
