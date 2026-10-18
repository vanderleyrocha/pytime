import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { avaliarNoValidador } from "@/lib/edicao/validador";
import type { InstanciaMotor } from "@/lib/instancia";

const instancia = { turnos: [], slots: [] } as unknown as InstanciaMotor;
const aulas = [{ atribuicao_id: "a1", slot_id: "s1" }];
const avaliacao = {
  violacoes_hard: [],
  custos: [],
  custo_total: 0,
  tempo_segundos: 0.2,
};

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("avaliarNoValidador", () => {
  beforeEach(() => {
    vi.stubEnv("VALIDADOR_URL", "https://validador.exemplo/");
    vi.stubEnv("VALIDADOR_TOKEN", "segredo");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("envia instância e grade com o token e devolve a avaliação", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(200, avaliacao));
    const r = await avaliarNoValidador(instancia, aulas, { fetch });
    expect(r).toEqual({ ok: true, avaliacao });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://validador.exemplo/avaliar");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer segredo");
    expect(JSON.parse(init.body)).toEqual({ instancia, grade: aulas });
  });

  it("repassa as ocorrências com as células de cada custo", async () => {
    const comOcorrencias = {
      ...avaliacao,
      custos: [
        {
          regra_id: "r1",
          tipo: "janelas_professor",
          custo: 3,
          detalhes: ["Ana: janelas na segunda"],
          ocorrencias: [
            {
              descricao: "Ana: janelas na segunda",
              unidades: 1,
              custo: 3,
              celulas: [{ slot_id: "s2", turma_id: null, professor_id: "p1" }],
            },
          ],
        },
      ],
      custo_total: 3,
    };
    const fetch = vi.fn().mockResolvedValue(resposta(200, comOcorrencias));
    const r = await avaliarNoValidador(instancia, aulas, { fetch });
    expect(r).toEqual({ ok: true, avaliacao: comOcorrencias });
  });

  it.each([
    [401, /mal configurad/],
    [422, /dados inválidos/],
    [500, /indisponível/],
    [503, /indisponível/],
  ])("HTTP %i vira mensagem legível", async (status, mensagem) => {
    const fetch = vi.fn().mockResolvedValue(resposta(status, { erro: "x" }));
    const r = await avaliarNoValidador(instancia, aulas, { fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(mensagem);
  });

  it("falha de rede ou timeout vira 'indisponível'", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("tempo esgotado", "AbortError"));
    const r = await avaliarNoValidador(instancia, aulas, {
      fetch,
      timeoutMs: 5,
    });
    expect(r).toEqual({
      ok: false,
      erro: expect.stringMatching(/indisponível/),
    });
  });

  it("sem configuração não chama o validador", async () => {
    vi.stubEnv("VALIDADOR_TOKEN", "");
    const fetch = vi.fn();
    const r = await avaliarNoValidador(instancia, aulas, { fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/não está configurad/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resposta 200 fora do contrato é tratada como erro", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(200, { inesperado: 1 }));
    const r = await avaliarNoValidador(instancia, aulas, { fetch });
    expect(r.ok).toBe(false);
  });
});
