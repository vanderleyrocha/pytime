import { describe, expect, it, vi } from "vitest";
import { lerTodas } from "@/lib/supabase/ler-todas";

/** Tabela falsa de `n` linhas que o "servidor" corta em `maxRows`. */
function tabela(n: number, maxRows = 1000) {
  const linhas = Array.from({ length: n }, (_, i) => ({ i }));
  return vi.fn(async (de: number, ate: number) => ({
    data: linhas.slice(de, Math.min(ate + 1, de + maxRows)),
    error: null,
  }));
}

describe("lerTodas", () => {
  it("junta as páginas até a última incompleta", async () => {
    const montar = tabela(2500);
    const r = await lerTodas(montar);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(2500);
    expect(r.data?.at(-1)).toEqual({ i: 2499 });
    expect(montar.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("múltiplo exato do tamanho da página pede uma página vazia e para", async () => {
    const montar = tabela(2000);
    expect((await lerTodas(montar)).data).toHaveLength(2000);
    expect(montar).toHaveBeenCalledTimes(3);
  });

  it("menos que uma página faz uma única consulta", async () => {
    const montar = tabela(10);
    expect((await lerTodas(montar)).data).toHaveLength(10);
    expect(montar).toHaveBeenCalledTimes(1);
  });

  it("erro em qualquer página devolve o erro sem dados", async () => {
    let chamada = 0;
    const r = await lerTodas(async (de: number) => {
      chamada += 1;
      return chamada === 2
        ? { data: null, error: { message: "falhou" } }
        : {
            data: Array.from({ length: 1000 }, (_, k) => ({ i: de + k })),
            error: null,
          };
    });
    expect(r).toEqual({ data: null, error: { message: "falhou" } });
  });
});
