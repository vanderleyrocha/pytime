import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/cliente-servico", () => ({
  criarClienteServico: vi.fn(),
}));

import type { Avaliacao } from "@/lib/edicao/avaliacao";
import { reavaliarSeDesatualizada } from "@/lib/edicao/reavaliacao";
import type { InstanciaMotor } from "@/lib/instancia";

const instancia = { turnos: [], slots: [] } as unknown as InstanciaMotor;
const aulas = [{ atribuicao_id: "a1", slot_id: "s1" }];
const antiga: Avaliacao = {
  violacoes_hard: [],
  custos: [
    { regra_id: "r1", tipo: "janelas_professor", custo: 3, detalhes: [] },
  ],
  custo_total: 3,
  tempo_segundos: 0.1,
};
const nova: Avaliacao = {
  ...antiga,
  custos: [{ ...antiga.custos[0], ocorrencias: [] }],
};

describe("reavaliarSeDesatualizada", () => {
  it("recalcula a avaliação antiga no validador e grava", async () => {
    const avaliar = vi.fn().mockResolvedValue({ ok: true, avaliacao: nova });
    const gravar = vi.fn().mockResolvedValue(undefined);
    const r = await reavaliarSeDesatualizada(antiga, instancia, aulas, {
      avaliar,
      gravar,
    });
    expect(r).toEqual(nova);
    expect(avaliar).toHaveBeenCalledWith(instancia, aulas, expect.anything());
    expect(gravar).toHaveBeenCalledWith(nova);
  });

  it("não chama o validador quando a avaliação já tem ocorrências", async () => {
    const avaliar = vi.fn();
    const r = await reavaliarSeDesatualizada(nova, instancia, aulas, {
      avaliar,
    });
    expect(r).toBe(nova);
    expect(avaliar).not.toHaveBeenCalled();
  });

  it("sem gravar (professor) só devolve a nova avaliação", async () => {
    const avaliar = vi.fn().mockResolvedValue({ ok: true, avaliacao: nova });
    const r = await reavaliarSeDesatualizada(null, instancia, aulas, {
      avaliar,
    });
    expect(r).toEqual(nova);
  });

  it("validador fora do ar ou falha ao gravar mantém a exibição", async () => {
    const fora = vi.fn().mockResolvedValue({ ok: false, erro: "x" });
    expect(
      await reavaliarSeDesatualizada(antiga, instancia, aulas, {
        avaliar: fora,
      }),
    ).toBe(antiga);

    const avaliar = vi.fn().mockResolvedValue({ ok: true, avaliacao: nova });
    const gravar = vi.fn().mockRejectedValue(new Error("rede"));
    expect(
      await reavaliarSeDesatualizada(antiga, instancia, aulas, {
        avaliar,
        gravar,
      }),
    ).toEqual(nova);
  });

  it("sem o snapshot da geração não há o que avaliar", async () => {
    const avaliar = vi.fn();
    expect(
      await reavaliarSeDesatualizada(antiga, null, aulas, { avaliar }),
    ).toBe(antiga);
    expect(avaliar).not.toHaveBeenCalled();
  });
});
