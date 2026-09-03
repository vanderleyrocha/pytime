import { describe, expect, it } from "vitest";
import { ehCaminhoInterno, ehRotaPublica } from "@/lib/rotas";

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
  it("libera o fluxo de auth do convidado", () => {
    expect(ehRotaPublica("/auth/confirm")).toBe(true);
    expect(ehRotaPublica("/definir-senha")).toBe(true);
  });
});

describe("ehCaminhoInterno", () => {
  it("aceita caminhos internos", () => {
    expect(ehCaminhoInterno("/painel")).toBe(true);
    expect(ehCaminhoInterno("/convite/abc")).toBe(true);
  });
  it("rejeita destinos externos ou disfarçados", () => {
    expect(ehCaminhoInterno("https://evil.example")).toBe(false);
    expect(ehCaminhoInterno("//evil.example")).toBe(false);
    expect(ehCaminhoInterno("/\\evil.example")).toBe(false);
    expect(ehCaminhoInterno("")).toBe(false);
  });
});
