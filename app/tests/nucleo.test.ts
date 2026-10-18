import { describe, expect, it } from "vitest";
import { traduzirNucleo } from "@/lib/nucleo";
import type { InstanciaMotor } from "@/lib/instancia";

const instancia: InstanciaMotor = {
  turnos: [{ id: "tn1", nome: "Manhã" }],
  slots: [{ id: "s1", dia: 0, ordem: 0, turno_id: "tn1" }],
  turmas: [{ id: "t1", nome: "6º A", turno_id: "tn1" }],
  disciplinas: [
    { id: "d1", nome: "Matemática" },
    { id: "d2", nome: "Educação Física" },
  ],
  professores: [{ id: "p1", nome: "Ana Souza", disponibilidade: {} }],
  atribuicoes: [
    {
      id: "a1",
      professor_id: "p1",
      disciplina_id: "d1",
      turma_id: "t1",
      carga_semanal: 1,
      geminadas: 1,
      recurso_ids: [],
    },
  ],
  recursos: [{ id: "r1", nome: "Laboratório", capacidade: 1 }],
  regras: [
    {
      id: "g1",
      tipo: "nao_mesmo_dia",
      hard: true,
      peso: 1,
      ativa: true,
      parametros: { disciplina_a: "d1", disciplina_b: "d2" },
    },
    {
      id: "g2",
      tipo: "ultimo_horario",
      hard: true,
      peso: 1,
      ativa: true,
      parametros: { disciplina_id: "d2" },
    },
  ],
  budget_segundos: 60,
};

describe("traduzirNucleo", () => {
  it("traduz disponibilidade pelo nome do professor", () => {
    const [texto] = traduzirNucleo(["disponibilidade:p1"], instancia);
    expect(texto).toContain("Ana Souza");
    expect(texto).not.toContain("p1");
  });

  it("traduz geminadas com disciplina, turma e professor", () => {
    const [texto] = traduzirNucleo(["geminadas:a1"], instancia);
    expect(texto).toContain("Matemática");
    expect(texto).toContain("6º A");
    expect(texto).toContain("Ana Souza");
  });

  it("traduz recurso pelo nome", () => {
    const [texto] = traduzirNucleo(["recurso:r1"], instancia);
    expect(texto).toContain("Laboratório");
  });

  it("traduz regras pelos parâmetros e pelo rótulo do catálogo", () => {
    const [mesmoDia, ultimo] = traduzirNucleo(
      ["nao_mesmo_dia:g1", "ultimo_horario:g2"],
      instancia,
    );
    expect(mesmoDia).toContain("Não no mesmo dia");
    expect(mesmoDia).toContain("Matemática");
    expect(mesmoDia).toContain("Educação Física");
    expect(ultimo).toContain("Não no último horário");
    expect(ultimo).toContain("Educação Física");
  });

  it("remove o prefixo técnico do conflito estrutural", () => {
    const [texto] = traduzirNucleo(
      ["estrutural: conflito nas restrições básicas (professor/turma/carga)"],
      instancia,
    );
    expect(texto).toBe(
      "Conflito nas restrições básicas (professor/turma/carga)",
    );
  });

  it("substitui ids conhecidos por nomes em mensagens livres", () => {
    const [texto] = traduzirNucleo(
      ["Atribuição a1: recurso_id 'r1' não encontrado."],
      instancia,
    );
    expect(texto).toContain("Laboratório");
    expect(texto).toContain("Matemática");
    expect(texto).not.toMatch(/\ba1\b|\br1\b/);
  });

  it("mantém o motivo quando o id não existe na instância", () => {
    expect(traduzirNucleo(["disponibilidade:xyz"], instancia)).toEqual([
      "Disponibilidade de um professor removido (xyz): os horários indisponíveis conflitam com as aulas atribuídas.",
    ]);
  });

  it("sem instância devolve os motivos originais", () => {
    expect(traduzirNucleo(["recurso:r1"], null)).toEqual(["recurso:r1"]);
  });
});
