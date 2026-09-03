import { describe, expect, it } from "vitest";
import {
  CATALOGO_REGRAS,
  esquemaParametros,
  hardPadrao,
} from "@/lib/validacao/regras";

const UUID_A = "00000000-0000-4000-8000-00000000000a";
const UUID_B = "00000000-0000-4000-8000-00000000000b";

describe("catálogo de regras", () => {
  it("tem exatamente os 10 tipos do motor", () => {
    expect(Object.keys(CATALOGO_REGRAS).sort()).toEqual([
      "compactacao_dias",
      "disponibilidade_professor",
      "distribuicao_disciplina",
      "geminadas",
      "janelas_professor",
      "nao_mesmo_dia",
      "preferencia_disciplina",
      "preferencia_professor",
      "recurso_compartilhado",
      "ultimo_horario",
    ]);
  });
  it("modos hard/soft espelham o motor", () => {
    expect(CATALOGO_REGRAS.disponibilidade_professor.modo).toBe("fixa_hard");
    expect(CATALOGO_REGRAS.janelas_professor.modo).toBe("fixa_soft");
    expect(CATALOGO_REGRAS.ultimo_horario.modo).toBe("alternavel");
    expect(CATALOGO_REGRAS.nao_mesmo_dia.modo).toBe("alternavel");
    expect(hardPadrao("geminadas")).toBe(true);
    expect(hardPadrao("compactacao_dias")).toBe(false);
  });
  it("valida parâmetros por tipo", () => {
    expect(
      esquemaParametros.safeParse({
        tipo: "distribuicao_disciplina",
        max_por_dia: "2",
      }).success,
    ).toBe(true);
    expect(
      esquemaParametros.safeParse({
        tipo: "distribuicao_disciplina",
        max_por_dia: 0,
      }).success,
    ).toBe(false);
    expect(
      esquemaParametros.safeParse({
        tipo: "preferencia_disciplina",
        disciplina_id: UUID_A,
        ordens: [0, 1],
        modo: "prefere",
      }).success,
    ).toBe(true);
    expect(
      esquemaParametros.safeParse({
        tipo: "preferencia_disciplina",
        disciplina_id: UUID_A,
        ordens: [],
        modo: "evita",
      }).success,
    ).toBe(false);
    expect(
      esquemaParametros.safeParse({
        tipo: "ultimo_horario",
        disciplina_id: UUID_A,
      }).success,
    ).toBe(true);
    expect(
      esquemaParametros.safeParse({
        tipo: "nao_mesmo_dia",
        disciplina_a: UUID_A,
        disciplina_b: UUID_A,
      }).success,
    ).toBe(false);
    expect(
      esquemaParametros.safeParse({
        tipo: "nao_mesmo_dia",
        disciplina_a: UUID_A,
        disciplina_b: UUID_B,
      }).success,
    ).toBe(true);
    expect(esquemaParametros.safeParse({ tipo: "geminadas" }).success).toBe(
      true,
    );
  });
});
