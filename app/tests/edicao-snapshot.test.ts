import { describe, expect, it } from "vitest";
import { impressaoInstancia } from "@/lib/edicao/snapshot";
import type { InstanciaMotor } from "@/lib/instancia";

const base = (): InstanciaMotor => ({
  turnos: [{ id: "tn1", nome: "Manhã" }],
  slots: [
    { id: "s1", dia: 0, ordem: 0, turno_id: "tn1" },
    { id: "s2", dia: 0, ordem: 1, turno_id: "tn1" },
  ],
  turmas: [{ id: "t1", nome: "6º A", turno_id: "tn1" }],
  disciplinas: [
    { id: "d1", nome: "Matemática" },
    { id: "d2", nome: "Português" },
  ],
  professores: [
    {
      id: "p1",
      nome: "Ana",
      disponibilidade: { s1: "indisponivel", s2: "prefere" },
    },
  ],
  atribuicoes: [
    {
      id: "a1",
      professor_id: "p1",
      disciplina_id: "d1",
      turma_id: "t1",
      carga_semanal: 1,
      geminadas: 0,
      recurso_ids: ["r1", "r2"],
    },
  ],
  recursos: [
    { id: "r1", nome: "Lab", capacidade: 1 },
    { id: "r2", nome: "Quadra", capacidade: 1 },
  ],
  regras: [],
  budget_segundos: 60,
});

describe("impressaoInstancia", () => {
  it("é estável para a mesma instância em outra ordem", () => {
    const a = base();
    const b = base();
    b.slots.reverse();
    b.disciplinas.reverse();
    b.atribuicoes[0].recurso_ids.reverse();
    b.professores[0].disponibilidade = { s2: "prefere", s1: "indisponivel" };
    expect(impressaoInstancia(a)).toBe(impressaoInstancia(b));
  });

  it("ignora o budget da geração", () => {
    const b = base();
    b.budget_segundos = 300;
    expect(impressaoInstancia(b)).toBe(impressaoInstancia(base()));
  });

  it("muda quando um cadastro muda", () => {
    const nome = base();
    nome.professores[0].nome = "Ana Souza";
    const atrib = base();
    atrib.atribuicoes.push({ ...atrib.atribuicoes[0], id: "a2" });
    const disp = base();
    disp.professores[0].disponibilidade = { s1: "indisponivel" };
    const original = impressaoInstancia(base());
    for (const outra of [nome, atrib, disp]) {
      expect(impressaoInstancia(outra)).not.toBe(original);
    }
  });
});
