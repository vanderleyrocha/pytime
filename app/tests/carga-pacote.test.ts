import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validarPacote,
  type CodigosExistentes,
} from "@/lib/carga/validacao";

const exemplo = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../docs/carga/exemplos/pacote-exemplo.json"),
    "utf-8",
  ),
);

const vazio: CodigosExistentes = {
  turnos: [],
  turmas: [],
  disciplinas: [],
  professores: [],
  recursos: [],
  horarios: [],
};

/** Pacote mínimo válido: 1 turno de 2 horários, 1 turma com matriz cheia. */
function minimo() {
  return {
    versao: "1.0",
    origem: { sistema: "teste", gerado_em: "2026-10-18T10:00:00-05:00" },
    turnos: [{ codigo: "INTEGRAL", nome: "Integral" }],
    horarios: [
      { turno: "INTEGRAL", dia: 0, ordem: 0, hora_inicio: "07:00", hora_fim: "07:50" },
      { turno: "INTEGRAL", dia: 0, ordem: 1 },
    ],
    turmas: [{ codigo: "TUR-1", nome: "6º A", turno: "INTEGRAL" }],
    disciplinas: [
      { codigo: "DIS-1", nome: "Matemática" },
      { codigo: "DIS-2", nome: "História" },
    ],
    professores: [{ codigo: "SRV-1", nome: "Bruno" }],
    atribuicoes: [
      { professor: "SRV-1", disciplina: "DIS-1", turma: "TUR-1", carga_semanal: 2 },
    ],
  } as Record<string, unknown> & { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe("validarPacote", () => {
  it("aceita o exemplo da documentação sem erros nem avisos", () => {
    const r = validarPacote(exemplo, vazio);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.pacote?.atribuicoes).toHaveLength(18);
  });

  it("aplica os defaults dos campos opcionais", () => {
    const r = validarPacote(minimo(), vazio);
    expect(r.erros).toEqual([]);
    expect(r.pacote?.recursos).toEqual([]);
    expect(r.pacote?.regras).toEqual([]);
    expect(r.pacote?.atribuicoes[0]).toMatchObject({ geminadas: 0, recursos: [] });
  });

  it("reporta erro de formato com o caminho do campo", () => {
    const p = minimo();
    p.turmas[0].turno = 5;
    p.horarios[0].hora_inicio = "7:00";
    const r = validarPacote(p, vazio);
    expect(r.pacote).toBeUndefined();
    expect(r.erros.some((e) => e.startsWith("turmas[0].turno:"))).toBe(true);
    expect(r.erros.some((e) => e.startsWith("horarios[0].hora_inicio:"))).toBe(true);
  });

  it("rejeita campo desconhecido", () => {
    const p = minimo();
    p.turmas[0].serie = "6º ano";
    expect(validarPacote(p, vazio).erros.join()).toContain("serie");
  });

  it("rejeita código duplicado na mesma entidade", () => {
    const p = minimo();
    p.disciplinas[1].codigo = "DIS-1";
    expect(validarPacote(p, vazio).erros).toContain(
      'disciplinas: código "DIS-1" repetido.',
    );
  });

  it("rejeita chaves naturais repetidas", () => {
    const p = minimo();
    p.horarios[1].ordem = 0;
    p.atribuicoes.push({ ...p.atribuicoes[0] });
    const erros = validarPacote(p, vazio).erros;
    expect(erros).toContain("horarios: INTEGRAL dia 0 ordem 0 repetido.");
    expect(erros).toContain("atribuicoes: SRV-1/DIS-1/TUR-1 repetida.");
  });

  it("rejeita referências inexistentes", () => {
    const p = minimo();
    p.turmas[0].turno = "TARDE";
    p.atribuicoes[0].recursos = ["LAB"];
    p.disponibilidades = [
      { professor: "SRV-1", turno: "INTEGRAL", dia: 3, ordem: 0, status: "evita" },
    ];
    p.regras = [
      { codigo: "R1", tipo: "ultimo_horario", hard: true, parametros: { disciplina: "DIS-9" } },
    ];
    const erros = validarPacote(p, vazio).erros;
    expect(erros).toContain('turmas[0].turno: turno "TARDE" não encontrado.');
    expect(erros).toContain('atribuicoes[0].recursos: recurso "LAB" não encontrado.');
    expect(erros).toContain(
      "disponibilidades[0]: horário INTEGRAL dia 3 ordem 0 não encontrado.",
    );
    expect(erros).toContain(
      'regras[0].parametros.disciplina: disciplina "DIS-9" não encontrada.',
    );
  });

  it("aceita referência a código já cadastrado na unidade", () => {
    const p = minimo();
    p.atribuicoes[0].turma = "TUR-ANTIGA";
    p.atribuicoes[0].recursos = ["LAB"];
    const r = validarPacote(p, { ...vazio, turmas: ["TUR-ANTIGA"], recursos: ["LAB"] });
    expect(r.erros).toEqual([]);
  });

  it("rejeita geminadas que não cabem na carga", () => {
    const p = minimo();
    p.atribuicoes[0].geminadas = 2;
    expect(validarPacote(p, vazio).erros).toContain(
      "atribuicoes[0]: 2 pares geminados não cabem em 2 aulas semanais.",
    );
  });

  it("rejeita hora de fim antes da de início", () => {
    const p = minimo();
    p.horarios[0].hora_fim = "06:00";
    expect(validarPacote(p, vazio).erros).toContain(
      "horarios[0]: hora_fim deve ser depois de hora_inicio.",
    );
  });

  it("rejeita regra incompatível com o modo do tipo e nao_mesmo_dia repetida", () => {
    const p = minimo();
    p.regras = [
      { codigo: "R1", tipo: "geminadas", hard: false },
      {
        codigo: "R2",
        tipo: "nao_mesmo_dia",
        hard: true,
        parametros: { disciplina_a: "DIS-1", disciplina_b: "DIS-1" },
      },
    ];
    const erros = validarPacote(p, vazio).erros;
    expect(erros.some((e) => e.startsWith("regras[0].hard:"))).toBe(true);
    expect(validarPacote(
      { ...p, regras: [p.regras[1]] },
      vazio,
    ).erros).toContain("regras[0]: escolha disciplinas diferentes.");
  });

  it("avisa matriz incompleta, turma sem atribuição e professor sobrecarregado", () => {
    const p = minimo();
    p.atribuicoes[0].carga_semanal = 1;
    p.turmas.push({ codigo: "TUR-2", nome: "6º B", turno: "INTEGRAL" });
    p.atribuicoes.push({
      professor: "SRV-1",
      disciplina: "DIS-2",
      turma: "TUR-1",
      carga_semanal: 2,
    });
    const r = validarPacote(p, vazio);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toContain(
      "Turma 6º A: carga total 3 difere do número de horários do turno (2).",
    );
    expect(r.avisos).toContain("Turma 6º B: nenhuma atribuição.");
    expect(r.avisos).toContain(
      "Professor Bruno: 3 aulas semanais para 2 horários disponíveis.",
    );
  });

  it("avisa recurso exigido por mais aulas do que a capacidade comporta", () => {
    const p = minimo();
    p.recursos = [{ codigo: "LAB", nome: "Laboratório" }];
    p.professores.push({ codigo: "SRV-2", nome: "Carla" });
    p.turmas.push({ codigo: "TUR-2", nome: "6º B", turno: "INTEGRAL" });
    p.atribuicoes[0].recursos = ["LAB"];
    p.atribuicoes.push({
      professor: "SRV-2",
      disciplina: "DIS-1",
      turma: "TUR-2",
      carga_semanal: 2,
      recursos: ["LAB"],
    });
    expect(validarPacote(p, vazio).avisos).toContain(
      "Recurso Laboratório: 4 aulas semanais para capacidade 1 em 2 horários.",
    );
  });
});
