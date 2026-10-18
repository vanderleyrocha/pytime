import { describe, expect, it } from "vitest";
import {
  esquemaAulas,
  esquemaNome,
  mapearErroRpc,
  montarExcecoes,
} from "@/lib/edicao/acoes";

const u = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

describe("esquemaAulas", () => {
  it("aceita a grade com uuids", () => {
    expect(
      esquemaAulas.safeParse([
        { atribuicao_id: u(1), slot_id: u(2) },
        { atribuicao_id: u(1), slot_id: u(3) },
      ]).success,
    ).toBe(true);
  });

  it("recusa grade vazia, id que não é uuid e a mesma aula repetida", () => {
    expect(esquemaAulas.safeParse([]).success).toBe(false);
    expect(
      esquemaAulas.safeParse([{ atribuicao_id: "x", slot_id: u(2) }]).success,
    ).toBe(false);
    expect(
      esquemaAulas.safeParse([
        { atribuicao_id: u(1), slot_id: u(2) },
        { atribuicao_id: u(1), slot_id: u(2) },
      ]).success,
    ).toBe(false);
  });
});

describe("esquemaNome", () => {
  it("apara espaços e limita a 80 caracteres", () => {
    expect(esquemaNome.parse("  Versão B ")).toBe("Versão B");
    expect(esquemaNome.safeParse("   ").success).toBe(false);
    expect(esquemaNome.safeParse("x".repeat(81)).success).toBe(false);
  });
});

describe("mapearErroRpc", () => {
  it("traduz os erros das RPCs de cenário", () => {
    expect(mapearErroRpc("conflito_versao")).toMatch(/Outra pessoa salvou/);
    expect(mapearErroRpc("Apenas gestores editam cenários.")).toBe(
      "Apenas gestores editam cenários.",
    );
    expect(mapearErroRpc("Grade não corresponde ao cenário.")).toMatch(
      /não corresponde/,
    );
    expect(
      mapearErroRpc("duplicate key value violates unique constraint"),
    ).toMatch(/Não foi possível salvar/);
  });
});

describe("montarExcecoes", () => {
  it("registra cada violação forçada com quem e quando", () => {
    expect(
      montarExcecoes(["disponibilidade:p1"], u(9), "2026-10-18T06:00:00.000Z"),
    ).toEqual([
      {
        motivo: "disponibilidade:p1",
        forcado_por: u(9),
        forcado_em: "2026-10-18T06:00:00.000Z",
      },
    ]);
  });
});
