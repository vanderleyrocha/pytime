import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lerCsv, pacoteDeCsv } from "@/lib/carga/csv";
import { validarPacote } from "@/lib/carga/validacao";

const DOCS = path.resolve(__dirname, "../../docs/carga");
const vazio = {
  turnos: [],
  turmas: [],
  disciplinas: [],
  professores: [],
  recursos: [],
  horarios: [],
};

function modelos(): Record<string, string> {
  const pasta = path.join(DOCS, "modelos");
  return Object.fromEntries(
    readdirSync(pasta).map((f) => [f, readFileSync(path.join(pasta, f), "utf-8")]),
  );
}

describe("lerCsv", () => {
  it("lê cabeçalho e linhas separadas por ponto e vírgula", () => {
    expect(lerCsv("a;b\n1;2\n3;4\n")).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("trata aspas, aspas escapadas, separador dentro de aspas, BOM e CRLF", () => {
    const texto = '﻿nome;obs\r\n"Silva; Ana";"diz ""oi"""\r\n';
    expect(lerCsv(texto)).toEqual([{ nome: "Silva; Ana", obs: 'diz "oi"' }]);
  });

  it("ignora linhas em branco", () => {
    expect(lerCsv("a\n1\n\n")).toEqual([{ a: "1" }]);
  });
});

describe("pacoteDeCsv", () => {
  it("os modelos CSV equivalem ao pacote JSON de exemplo", () => {
    const json = JSON.parse(
      readFileSync(path.join(DOCS, "exemplos/pacote-exemplo.json"), "utf-8"),
    );
    const doCsv = pacoteDeCsv(modelos());
    expect(doCsv.erros).toEqual([]);
    const r = validarPacote(doCsv.bruto, vazio);
    expect(r.erros).toEqual([]);
    expect(r.pacote).toEqual(validarPacote(json, vazio).pacote);
  });

  it("lê horários sem aula da turma e disponibilidade da disciplina", () => {
    const { bruto, erros } = pacoteDeCsv({
      "origem.csv": "versao;sistema;gerado_em\n1.0;x;2026-10-18T10:00:00Z\n",
      "turmas_sem_aula.csv": "turma;turno;dia;ordem\nTUR-1;MANHA;4;4\n",
      "disponibilidades_disciplina.csv":
        "disciplina;turno;dia;ordem;status\nDIS-8;MANHA;0;0;indisponivel\n",
    });
    expect(erros).not.toContain('Arquivo "turmas_sem_aula.csv" não faz parte do pacote.');
    expect(bruto.turmas_sem_aula).toEqual([
      { turma: "TUR-1", turno: "MANHA", dia: 4, ordem: 4 },
    ]);
    expect(bruto.disponibilidades_disciplina).toEqual([
      { disciplina: "DIS-8", turno: "MANHA", dia: 0, ordem: 0, status: "indisponivel" },
    ]);
  });

  it("converte números, booleanos, listas e parâmetros JSON", () => {
    const { bruto } = pacoteDeCsv({
      "origem.csv": "versao;sistema;gerado_em\n1.0;x;2026-10-18T10:00:00Z\n",
      "atribuicoes.csv":
        "professor;disciplina;turma;carga_semanal;geminadas;recursos\nP;D;T;4;;LAB|QUADRA\n",
      "regras.csv":
        'codigo;tipo;hard;peso;parametros\nR;distribuicao_disciplina;false;2;"{""max_por_dia"": 2}"\n',
    });
    expect(bruto.versao).toBe("1.0");
    expect(bruto.atribuicoes).toEqual([
      { professor: "P", disciplina: "D", turma: "T", carga_semanal: 4, recursos: ["LAB", "QUADRA"] },
    ]);
    expect(bruto.regras).toEqual([
      { codigo: "R", tipo: "distribuicao_disciplina", hard: false, peso: 2, parametros: { max_por_dia: 2 } },
    ]);
  });

  it("acusa arquivo desconhecido, origem ausente e JSON inválido", () => {
    const { erros } = pacoteDeCsv({
      "alunos.csv": "nome\nAna\n",
      "regras.csv": "codigo;tipo;hard;parametros\nR;x;true;{quebrado\n",
    });
    expect(erros).toContain('Arquivo "alunos.csv" não faz parte do pacote.');
    expect(erros).toContain('Falta o arquivo "origem.csv".');
    expect(erros).toContain("regras.csv, linha 2: parametros não é um JSON válido.");
  });
});
