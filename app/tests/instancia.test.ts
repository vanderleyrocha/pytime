import { describe, expect, it } from "vitest";
import { montarInstancia, type DadosUnidade } from "@/lib/instancia";

const dados: DadosUnidade = {
  turnos: [{ id: "tn1", nome: "Manhã" }],
  slots: [
    { id: "s1", dia: 0, ordem: 0, turno_id: "tn1" },
    { id: "s2", dia: 0, ordem: 1, turno_id: "tn1" },
  ],
  turmas: [{ id: "tu1", nome: "6º A", turno_id: "tn1" }],
  disciplinas: [{ id: "d1", nome: "Matemática" }],
  professores: [{ id: "p1", nome: "Amanda" }],
  disponibilidades: [
    { professor_id: "p1", slot_id: "s1", status: "prefere" },
    { professor_id: "p1", slot_id: "s2", status: "indisponivel" },
  ],
  recursos: [{ id: "r1", nome: "Lab", capacidade: 1 }],
  atribuicoes: [
    {
      id: "a1",
      professor_id: "p1",
      disciplina_id: "d1",
      turma_id: "tu1",
      carga_semanal: 2,
      geminadas: 1,
    },
  ],
  atribuicaoRecursos: [{ atribuicao_id: "a1", recurso_id: "r1" }],
  regras: [
    {
      id: "rg1",
      tipo: "geminadas",
      hard: true,
      peso: 1,
      ativa: true,
      parametros: {},
    },
  ],
};

describe("montarInstancia", () => {
  it("espelha o contrato do motor", () => {
    const inst = montarInstancia(dados, 90);
    expect(inst.budget_segundos).toBe(90);
    expect(inst.slots).toHaveLength(2);
    expect(inst.professores[0].disponibilidade).toEqual({
      s1: "prefere",
      s2: "indisponivel",
    });
    expect(inst.atribuicoes[0].recurso_ids).toEqual(["r1"]);
    expect(inst.atribuicoes[0].geminadas).toBe(1);
    expect(inst.regras[0].tipo).toBe("geminadas");
  });

  it("professor sem marcações tem disponibilidade vazia", () => {
    const semMarcacoes = { ...dados, disponibilidades: [] };
    const inst = montarInstancia(semMarcacoes, 60);
    expect(inst.professores[0].disponibilidade).toEqual({});
    expect(inst.atribuicoes[0].recurso_ids).toEqual(["r1"]);
  });
});
