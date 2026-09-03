import { describe, expect, it } from "vitest";
import { haGeracaoEmAndamento } from "@/lib/geracoes";

describe("haGeracaoEmAndamento", () => {
  it("é verdadeiro com geração na fila ou executando", () => {
    expect(haGeracaoEmAndamento(["concluida", "pendente"])).toBe(true);
    expect(haGeracaoEmAndamento(["executando"])).toBe(true);
  });

  it("é falso quando todas terminaram", () => {
    expect(haGeracaoEmAndamento(["concluida", "inviavel", "erro"])).toBe(false);
  });

  it("é falso sem nenhuma geração", () => {
    expect(haGeracaoEmAndamento([])).toBe(false);
  });
});
