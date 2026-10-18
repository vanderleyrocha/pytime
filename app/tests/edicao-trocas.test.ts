import { describe, expect, it } from "vitest";
import {
  alterado,
  aplicarTroca,
  desfazer,
  novoRascunho,
  refazer,
  trocar,
  type Aula,
} from "@/lib/edicao/trocas";

// Turma T1 com 3 horários (s1..s3); turma T2 com 1 horário (s9).
const turmaDaAtribuicao = { mat: "T1", por: "T1", his: "T1", geo: "T2" };
const base: Aula[] = [
  { atribuicao_id: "mat", slot_id: "s1" },
  { atribuicao_id: "por", slot_id: "s2" },
  { atribuicao_id: "his", slot_id: "s3" },
  { atribuicao_id: "geo", slot_id: "s9" },
];
const slotDe = (aulas: Aula[], a: string) =>
  aulas.filter((x) => x.atribuicao_id === a).map((x) => x.slot_id);

describe("aplicarTroca", () => {
  it("troca o conteúdo de dois horários da mesma turma", () => {
    const r = aplicarTroca(
      base,
      { slotA: "s1", slotB: "s3", turmaId: "T1" },
      turmaDaAtribuicao,
    );
    expect(slotDe(r, "mat")).toEqual(["s3"]);
    expect(slotDe(r, "his")).toEqual(["s1"]);
    expect(slotDe(r, "por")).toEqual(["s2"]);
  });

  it("não muta a grade de entrada", () => {
    aplicarTroca(
      base,
      { slotA: "s1", slotB: "s2", turmaId: "T1" },
      turmaDaAtribuicao,
    );
    expect(slotDe(base, "mat")).toEqual(["s1"]);
  });

  it("recusa horários de outra turma", () => {
    expect(() =>
      aplicarTroca(
        base,
        { slotA: "s1", slotB: "s9", turmaId: "T1" },
        turmaDaAtribuicao,
      ),
    ).toThrow(/mesma turma/);
  });

  it("recusa o mesmo horário dos dois lados", () => {
    expect(() =>
      aplicarTroca(
        base,
        { slotA: "s1", slotB: "s1", turmaId: "T1" },
        turmaDaAtribuicao,
      ),
    ).toThrow(/horários diferentes/);
  });

  it("aula com várias ocorrências: só a do horário trocado se move", () => {
    const grade: Aula[] = [
      { atribuicao_id: "mat", slot_id: "s1" },
      { atribuicao_id: "mat", slot_id: "s2" },
      { atribuicao_id: "por", slot_id: "s3" },
    ];
    const r = aplicarTroca(
      grade,
      { slotA: "s2", slotB: "s3", turmaId: "T1" },
      turmaDaAtribuicao,
    );
    expect(slotDe(r, "mat").sort()).toEqual(["s1", "s3"]);
    expect(slotDe(r, "por")).toEqual(["s2"]);
  });
});

describe("rascunho com desfazer e refazer", () => {
  const t1 = { slotA: "s1", slotB: "s2", turmaId: "T1" };
  const t2 = { slotA: "s2", slotB: "s3", turmaId: "T1" };

  it("desfazer volta à grade original e refazer reaplica", () => {
    let r = novoRascunho(base);
    r = trocar(r, t1, turmaDaAtribuicao);
    r = trocar(r, t2, turmaDaAtribuicao);
    const depois = r.aulas;
    r = desfazer(desfazer(r, turmaDaAtribuicao), turmaDaAtribuicao);
    expect(r.aulas).toEqual(base);
    expect(alterado(r, base)).toBe(false);
    r = refazer(refazer(r, turmaDaAtribuicao), turmaDaAtribuicao);
    expect(r.aulas).toEqual(depois);
    expect(alterado(r, base)).toBe(true);
  });

  it("nova troca depois de desfazer limpa o refazer", () => {
    let r = trocar(novoRascunho(base), t1, turmaDaAtribuicao);
    r = desfazer(r, turmaDaAtribuicao);
    r = trocar(r, t2, turmaDaAtribuicao);
    expect(r.desfeitas).toEqual([]);
    expect(refazer(r, turmaDaAtribuicao)).toBe(r);
  });

  it("desfazer sem histórico não muda nada", () => {
    const r = novoRascunho(base);
    expect(desfazer(r, turmaDaAtribuicao)).toBe(r);
  });

  it("alterado ignora a ordem das aulas", () => {
    expect(alterado(novoRascunho([...base].reverse()), base)).toBe(false);
  });
});
