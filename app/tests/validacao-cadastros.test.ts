import { describe, expect, it } from "vitest";
import {
  esquemaAtribuicao,
  esquemaDisciplina,
  esquemaGrade,
  esquemaRecurso,
  esquemaTurma,
  esquemaTurno,
} from "@/lib/validacao/cadastros";

const UUID = "00000000-0000-4000-8000-000000000001";

describe("schemas de cadastro", () => {
  it("turno exige nome", () => {
    expect(esquemaTurno.safeParse({ nome: "Manhã" }).success).toBe(true);
    expect(esquemaTurno.safeParse({ nome: "  " }).success).toBe(false);
  });
  it("turma exige turno válido", () => {
    expect(esquemaTurma.safeParse({ nome: "6º A", turno_id: UUID }).success).toBe(true);
    expect(esquemaTurma.safeParse({ nome: "6º A", turno_id: "x" }).success).toBe(false);
  });
  it("disciplina exige nome", () => {
    expect(esquemaDisciplina.safeParse({ nome: "Matemática" }).success).toBe(true);
  });
  it("recurso coage capacidade e exige >= 1", () => {
    const ok = esquemaRecurso.safeParse({ nome: "Lab", capacidade: "2" });
    expect(ok.success && ok.data.capacidade).toBe(2);
    expect(esquemaRecurso.safeParse({ nome: "Lab", capacidade: 0 }).success).toBe(false);
  });
  it("grade exige dias 0-6, horários e fim > início", () => {
    const base = {
      dias: [0, 1, 2, 3, 4],
      horarios: [{ hora_inicio: "07:00", hora_fim: "07:50" }],
    };
    expect(esquemaGrade.safeParse(base).success).toBe(true);
    expect(esquemaGrade.safeParse({ ...base, dias: [] }).success).toBe(false);
    expect(esquemaGrade.safeParse({ ...base, dias: [7] }).success).toBe(false);
    expect(
      esquemaGrade.safeParse({
        ...base,
        horarios: [{ hora_inicio: "08:00", hora_fim: "07:00" }],
      }).success,
    ).toBe(false);
  });
  it("atribuição espelha o motor (carga >= 1, geminadas >= 0)", () => {
    const base = {
      professor_id: UUID,
      disciplina_id: UUID,
      turma_id: UUID,
      carga_semanal: "4",
      geminadas: "0",
      recurso_ids: [UUID],
    };
    const ok = esquemaAtribuicao.safeParse(base);
    expect(ok.success && ok.data.carga_semanal).toBe(4);
    expect(
      esquemaAtribuicao.safeParse({ ...base, carga_semanal: 0 }).success,
    ).toBe(false);
    expect(
      esquemaAtribuicao.safeParse({ ...base, geminadas: -1 }).success,
    ).toBe(false);
  });
});
