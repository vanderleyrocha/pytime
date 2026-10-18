import { describe, expect, it } from "vitest";
import {
  CATALOGO_REGRAS,
  esquemaParametros,
  hardPadrao,
} from "@/lib/validacao/regras";

const UUID_A = "00000000-0000-4000-8000-00000000000a";
const UUID_B = "00000000-0000-4000-8000-00000000000b";

describe("catálogo de regras", () => {
  it("tem exatamente os 12 tipos do motor", () => {
    expect(Object.keys(CATALOGO_REGRAS).sort()).toEqual([
      "aulas_juntas",
      "compactacao_dias",
      "disciplina_sincronizada",
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
    expect(CATALOGO_REGRAS.aulas_juntas.modo).toBe("alternavel");
    expect(CATALOGO_REGRAS.disciplina_sincronizada.modo).toBe("alternavel");
    expect(hardPadrao("aulas_juntas")).toBe(true);
    expect(hardPadrao("disciplina_sincronizada")).toBe(true);
    expect(hardPadrao("geminadas")).toBe(true);
    expect(hardPadrao("compactacao_dias")).toBe(false);
  });
  it("valida os parâmetros das regras de aulas juntas e sincronizada", () => {
    expect(esquemaParametros.safeParse({ tipo: "aulas_juntas" }).success).toBe(
      true,
    );
    expect(
      esquemaParametros.safeParse({
        tipo: "disciplina_sincronizada",
        disciplina_id: UUID_A,
      }).success,
    ).toBe(true);
    expect(
      esquemaParametros.safeParse({ tipo: "disciplina_sincronizada" }).success,
    ).toBe(false);
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
