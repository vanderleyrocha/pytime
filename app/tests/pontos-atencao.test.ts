import { describe, expect, it } from "vitest";
import type { Avaliacao, CustoRegra } from "@/lib/edicao/avaliacao";
import {
  avaliacaoDesatualizada,
  legendaRegras,
  marcasDaGrade,
  resumoCusto,
} from "@/lib/pontos-atencao";

const custo = (
  regra_id: string,
  tipo: string,
  valor: number,
  ocorrencias?: CustoRegra["ocorrencias"],
): CustoRegra => ({
  regra_id,
  tipo,
  custo: valor,
  detalhes: [],
  ...(ocorrencias ? { ocorrencias } : {}),
});

const av = (custos: CustoRegra[]): Avaliacao => ({
  violacoes_hard: [],
  custos,
  custo_total: 0,
  tempo_segundos: 0.1,
});

const excesso = {
  descricao: "6º A – Matemática: aulas acima do máximo (2) na segunda",
  unidades: 2,
  custo: 8,
  celulas: [
    { slot_id: "s1", turma_id: "t1", professor_id: null },
    { slot_id: "s2", turma_id: "t1", professor_id: null },
  ],
};
const janela = {
  descricao: "Ana: janelas na segunda",
  unidades: 1,
  custo: 3,
  celulas: [{ slot_id: "s3", turma_id: null, professor_id: "p1" }],
};
const diaTrabalho = {
  descricao: "Ana: trabalha na segunda",
  unidades: 1,
  custo: 1,
  celulas: [],
};

describe("avaliacaoDesatualizada", () => {
  it("pede recálculo sem avaliação ou com custos sem ocorrências", () => {
    expect(avaliacaoDesatualizada(null)).toBe(true);
    expect(
      avaliacaoDesatualizada(av([custo("r1", "janelas_professor", 3)])),
    ).toBe(true);
  });

  it("aceita avaliação já com ocorrências ou sem regra preferencial", () => {
    expect(
      avaliacaoDesatualizada(av([custo("r1", "janelas_professor", 0, [])])),
    ).toBe(false);
    expect(avaliacaoDesatualizada(av([]))).toBe(false);
  });
});

describe("resumoCusto", () => {
  it("conta ocorrências e mostra o custo", () => {
    expect(resumoCusto(custo("r", "x", 11, [excesso, janela]))).toBe(
      "2 ocorrências (custo 11)",
    );
    expect(resumoCusto(custo("r", "x", 3, [janela]))).toBe(
      "1 ocorrência (custo 3)",
    );
  });

  it("sem ocorrências (dado antigo) mostra só o custo", () => {
    expect(resumoCusto(custo("r", "x", 72))).toBe("custo 72");
  });
});

describe("legendaRegras", () => {
  it("só regras com custo, cada uma com cor própria e rótulo do catálogo", () => {
    const legenda = legendaRegras(
      [
        custo("r1", "distribuicao_disciplina", 8, [excesso]),
        custo("r2", "ultimo_horario", 0, []),
        custo("r3", "janelas_professor", 3, [janela]),
      ],
      (tipo) => `rótulo ${tipo}`,
    );
    expect(legenda.map((r) => [r.regra_id, r.rotulo, r.resumo])).toEqual([
      ["r1", "rótulo distribuicao_disciplina", "1 ocorrência (custo 8)"],
      ["r3", "rótulo janelas_professor", "1 ocorrência (custo 3)"],
    ]);
    expect(legenda[0].cor).not.toBe(legenda[1].cor);
  });
});

describe("marcasDaGrade", () => {
  const legenda = legendaRegras(
    [
      custo("r1", "distribuicao_disciplina", 8, [excesso]),
      custo("r2", "janelas_professor", 4, [janela, diaTrabalho]),
    ],
    (t) => t,
  );

  it("marca as células da turma e lista as ocorrências que aparecem nela", () => {
    const m = marcasDaGrade(legenda, [{ eixo: "turma", id: "t1" }]);
    expect(m.porCelula).toEqual({
      "turma:t1:s1": [{ regra_id: "r1", indice: 0 }],
      "turma:t1:s2": [{ regra_id: "r1", indice: 0 }],
    });
    expect(m.visiveis.map((v) => v.ocorrencia.descricao)).toEqual([
      excesso.descricao,
    ]);
  });

  it("a janela só aparece na grade do professor", () => {
    expect(
      marcasDaGrade(legenda, [{ eixo: "turma", id: "p1" }]).visiveis,
    ).toEqual([]);
    const m = marcasDaGrade(legenda, [{ eixo: "professor", id: "p1" }]);
    expect(m.porCelula).toEqual({
      "professor:p1:s3": [{ regra_id: "r2", indice: 0 }],
    });
  });
});
