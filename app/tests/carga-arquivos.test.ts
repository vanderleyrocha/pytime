import { describe, expect, it } from "vitest";
import {
  codigosExistentes,
  lerArquivosCarga,
  resumirPacote,
} from "@/lib/carga/arquivos";
import { validarPacote } from "@/lib/carga/validacao";

describe("lerArquivosCarga", () => {
  it("lê um único arquivo JSON", () => {
    const r = lerArquivosCarga([{ nome: "pacote.json", texto: '{"versao": "1.0"}' }]);
    expect(r).toEqual({ bruto: { versao: "1.0" }, erros: [] });
  });

  it("acusa JSON malformado", () => {
    const r = lerArquivosCarga([{ nome: "pacote.json", texto: "{" }]);
    expect(r.erros).toEqual(['O arquivo "pacote.json" não é um JSON válido.']);
  });

  it("lê os arquivos CSV como um pacote", () => {
    const r = lerArquivosCarga([
      { nome: "origem.csv", texto: "versao;sistema;gerado_em\n1.0;x;2026-10-18T10:00:00Z\n" },
      { nome: "turnos.csv", texto: "codigo;nome\nINTEGRAL;Integral\n" },
    ]);
    expect(r.bruto.turnos).toEqual([{ codigo: "INTEGRAL", nome: "Integral" }]);
  });

  it("rejeita nenhum arquivo, mistura de formatos e mais de um JSON", () => {
    expect(lerArquivosCarga([]).erros).toEqual(["Escolha o arquivo do pacote."]);
    expect(
      lerArquivosCarga([
        { nome: "a.json", texto: "{}" },
        { nome: "turnos.csv", texto: "" },
      ]).erros,
    ).toEqual(["Envie um único arquivo .json ou os arquivos .csv do pacote."]);
    expect(
      lerArquivosCarga([
        { nome: "a.json", texto: "{}" },
        { nome: "b.json", texto: "{}" },
      ]).erros,
    ).toEqual(["Envie um único arquivo .json ou os arquivos .csv do pacote."]);
  });
});

describe("codigosExistentes", () => {
  it("monta os códigos da unidade ignorando cadastros sem código", () => {
    const r = codigosExistentes({
      turnos: [
        { id: "t1", codigo_externo: "INTEGRAL" },
        { id: "t2", codigo_externo: null },
      ],
      turmas: [{ codigo_externo: "TUR-1" }],
      disciplinas: [],
      professores: [{ codigo_externo: null }],
      recursos: [],
      slots: [
        { turno_id: "t1", dia: 0, ordem: 2 },
        { turno_id: "t2", dia: 0, ordem: 0 },
      ],
    });
    expect(r).toEqual({
      turnos: ["INTEGRAL"],
      turmas: ["TUR-1"],
      disciplinas: [],
      professores: [],
      recursos: [],
      horarios: ["INTEGRAL|0|2"],
    });
  });
});

describe("resumirPacote", () => {
  it("conta os itens de cada seção", () => {
    const { pacote } = validarPacote(
      {
        versao: "1.0",
        origem: { sistema: "x", gerado_em: "2026-10-18T10:00:00Z" },
        turnos: [{ codigo: "T", nome: "T" }],
        horarios: [{ turno: "T", dia: 0, ordem: 0 }],
        turmas: [],
        disciplinas: [],
        professores: [],
        atribuicoes: [],
      },
      { turnos: [], turmas: [], disciplinas: [], professores: [], recursos: [], horarios: [] },
    );
    expect(resumirPacote(pacote!)).toEqual({
      turnos: 1,
      horarios: 1,
      turmas: 0,
      disciplinas: 0,
      professores: 0,
      recursos: 0,
      disponibilidades: 0,
      atribuicoes: 0,
      regras: 0,
    });
  });
});
