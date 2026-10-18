import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLUNAS_QUADRO,
  gerarQuadroHorarios,
  quadroParaCsv,
  type DadosExportacao,
} from "@/lib/exportacao/quadro-horarios";

function dados(): DadosExportacao {
  return {
    turnos: [
      { id: "tn-int", nome: "Integral", codigo_externo: "INTEGRAL" },
      { id: "tn-tar", nome: "Tarde", codigo_externo: "TARDE" },
    ],
    slots: [
      { id: "s-seg-0", turno_id: "tn-int", dia: 0, ordem: 0 },
      { id: "s-seg-2", turno_id: "tn-int", dia: 0, ordem: 2 },
      { id: "s-sex-6", turno_id: "tn-int", dia: 4, ordem: 6 },
      { id: "s-tar-0", turno_id: "tn-tar", dia: 1, ordem: 0 },
    ],
    professores: [{ id: "p1", nome: "Bruno", codigo_externo: "SRV-102" }],
    disciplinas: [
      { id: "d1", nome: "Matemática", codigo_externo: "DIS-12" },
      { id: "d2", nome: "História", codigo_externo: "DIS-14" },
    ],
    turmas: [
      { id: "t1", nome: "6º A", codigo_externo: "TUR-201" },
      { id: "t2", nome: "6º B", codigo_externo: "TUR-202" },
    ],
    atribuicoes: [
      { id: "a1", professor_id: "p1", disciplina_id: "d1", turma_id: "t1" },
      { id: "a2", professor_id: "p1", disciplina_id: "d1", turma_id: "t2" },
      { id: "a3", professor_id: "p1", disciplina_id: "d2", turma_id: "t1" },
    ],
    aulas: [
      { atribuicao_id: "a1", slot_id: "s-seg-0" },
      { atribuicao_id: "a2", slot_id: "s-seg-2" },
      { atribuicao_id: "a3", slot_id: "s-sex-6" },
      { atribuicao_id: "a3", slot_id: "s-tar-0" },
    ],
  };
}

const livre = Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7].flatMap((i) => [
    [`t${i}_id`, null],
    [`t${i}_status`, "Aberto"],
  ]),
);

describe("gerarQuadroHorarios", () => {
  it("agrupa por professor × disciplina × dia × turno, com o tempo na coluna", () => {
    const r = gerarQuadroHorarios(dados());
    expect(r.erros).toEqual([]);
    expect(r.linhas).toEqual([
      // segunda (dia_semana 1), integral: T1 = 6º A, T3 = 6º B
      { servidor_id: 102, disciplina_id: 12, dia_semana: 1, turno: 4, ordem: null,
        ...livre, t1_id: 201, t3_id: 202 },
      // terça, tarde: ordem 0 = T5
      { servidor_id: 102, disciplina_id: 14, dia_semana: 2, turno: 2, ordem: null,
        ...livre, t5_id: 201 },
      // sexta (dia_semana 5), integral: ordem 6 = T7
      { servidor_id: 102, disciplina_id: 14, dia_semana: 5, turno: 4, ordem: null,
        ...livre, t7_id: 201 },
    ]);
  });

  it("recusa registros sem código do escolajba", () => {
    const d = dados();
    d.professores[0].codigo_externo = null;
    d.turmas[1].codigo_externo = "6B";
    d.turnos[1].codigo_externo = "VESPERTINO";
    const r = gerarQuadroHorarios(d);
    expect(r.linhas).toBeUndefined();
    expect(r.erros).toContain('Professor "Bruno" sem código do escolajba (SRV-<id>).');
    expect(r.erros).toContain('Turma "6º B" sem código do escolajba (TUR-<id>).');
    expect(r.erros).toContain(
      'Turno "Tarde" sem código do escolajba (MANHA, TARDE, NOITE ou INTEGRAL).',
    );
  });

  it("recusa horário que não cabe nos tempos do turno", () => {
    const d = dados();
    d.slots[3].ordem = 3; // tarde só tem T5–T7
    expect(gerarQuadroHorarios(d).erros).toEqual([
      "Turno Tarde: o horário de ordem 3 não cabe nos tempos T5–T7.",
    ]);
  });

  it("avisa professor no mesmo tempo em turnos diferentes", () => {
    const d = dados();
    d.turnos.push({ id: "tn-man", nome: "Manhã", codigo_externo: "MANHA" });
    d.slots.push({ id: "s-man-0", turno_id: "tn-man", dia: 0, ordem: 0 });
    d.aulas.push({ atribuicao_id: "a3", slot_id: "s-man-0" });
    const r = gerarQuadroHorarios(d);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual(["Professor Bruno: dois turnos no tempo T1 de segunda."]);
  });

  it("recusa aula que aponta para atribuição ou horário inexistente", () => {
    const d = dados();
    d.aulas.push({ atribuicao_id: "a9", slot_id: "s-seg-0" });
    expect(gerarQuadroHorarios(d).erros).toEqual([
      "A grade tem 1 aula(s) sem atribuição ou horário correspondente.",
    ]);
  });
});

describe("quadroParaCsv", () => {
  it("usa as colunas do exemplo da documentação e célula vazia para null", () => {
    const exemplo = readFileSync(
      path.resolve(__dirname, "../../docs/exportacao/exemplos/quadro-horarios-exemplo.csv"),
      "utf-8",
    );
    expect(COLUNAS_QUADRO.join(";")).toBe(exemplo.split("\n")[0]);
    const csv = quadroParaCsv(gerarQuadroHorarios(dados()).linhas!);
    expect(csv.split("\n")[1]).toBe(
      "102;12;1;4;;201;Aberto;;Aberto;202;Aberto;;Aberto;;Aberto;;Aberto;;Aberto",
    );
    expect(csv.endsWith("\n")).toBe(true);
  });
});
