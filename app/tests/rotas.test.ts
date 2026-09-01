import { describe, expect, it } from "vitest";
import { ehRotaPublica } from "@/lib/rotas";

describe("ehRotaPublica", () => {
  it("libera login, cadastro e convite", () => {
    expect(ehRotaPublica("/login")).toBe(true);
    expect(ehRotaPublica("/cadastro")).toBe(true);
    expect(ehRotaPublica("/convite/abc-123")).toBe(true);
  });
  it("protege o restante", () => {
    expect(ehRotaPublica("/")).toBe(false);
    expect(ehRotaPublica("/painel")).toBe(false);
    expect(ehRotaPublica("/convites")).toBe(false);
    expect(ehRotaPublica("/loginfalso")).toBe(false);
  });
});
