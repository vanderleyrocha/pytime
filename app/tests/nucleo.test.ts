import { describe, expect, it } from "vitest";
import { traduzirNucleo, traduzirViolacoes } from "@/lib/nucleo";
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

describe("traduzirViolacoes (edição manual)", () => {
  it("professor em dois lugares: frase com nome, horário e slot a destacar", () => {
    const [v] = traduzirViolacoes(
      ["estrutural:professor_duplo:p1:s1"],
      instancia,
    );
    expect(v.texto).toContain("Ana Souza");
    expect(v.texto).toContain("Seg 1º horário");
    expect(v.texto).not.toContain("p1");
    expect(v.slotIds).toEqual(["s1"]);
  });

  it("turma com horário vazio ou duplo indica a turma e o horário", () => {
    const [vazio, duplo] = traduzirViolacoes(
      ["estrutural:turma_vazio:t1:s1", "estrutural:turma_duplo:t1:s1"],
      instancia,
    );
    expect(vazio.texto).toMatch(/6º A.*sem aula|sem aula.*6º A/);
    expect(duplo.texto).toMatch(/6º A/);
    expect(duplo.texto).toMatch(/duas aulas/);
    expect(vazio.slotIds).toEqual(["s1"]);
  });

  it("aula fora do turno e carga diferente descrevem a atribuição", () => {
    const [fora, carga] = traduzirViolacoes(
      ["estrutural:fora_do_turno:a1:s1", "estrutural:carga:a1"],
      instancia,
    );
    expect(fora.texto).toContain("Matemática em 6º A (Ana Souza)");
    expect(fora.slotIds).toEqual(["s1"]);
    expect(carga.texto).toContain("Matemática em 6º A (Ana Souza)");
    expect(carga.slotIds).toEqual([]);
  });

  it("erro da própria instância perde o prefixo técnico", () => {
    const [v] = traduzirViolacoes(
      [
        "instancia:Turma 6º A: carga total 3 difere do número de slots do turno (2).",
      ],
      instancia,
    );
    expect(v.texto).toBe(
      "Turma 6º A: carga total 3 difere do número de slots do turno (2).",
    );
  });

  it("motivos de regra seguem a tradução do núcleo, sem slot", () => {
    const [v] = traduzirViolacoes(["disponibilidade:p1"], instancia);
    expect(v.texto).toContain("Ana Souza");
    expect(v.slotIds).toEqual([]);
  });

  it("estrutural em frase (vindo do solver) continua funcionando", () => {
    expect(
      traduzirViolacoes(
        ["estrutural: conflito nas restrições básicas (professor/turma/carga)"],
        instancia,
      )[0].texto,
    ).toBe("Conflito nas restrições básicas (professor/turma/carga)");
  });
});
