import { describe, expect, it } from "vitest";
import {
  esquemaCadastro,
  esquemaConvite,
  esquemaCriarEscola,
  esquemaLogin,
} from "@/lib/validacao/auth";

describe("esquemas de auth", () => {
  it("login exige e-mail válido e senha de 8+", () => {
    expect(esquemaLogin.safeParse({ email: "a@b.com", senha: "12345678" }).success).toBe(true);
    expect(esquemaLogin.safeParse({ email: "x", senha: "12345678" }).success).toBe(false);
    expect(esquemaLogin.safeParse({ email: "a@b.com", senha: "1234567" }).success).toBe(false);
  });
  it("cadastro segue as mesmas regras do login", () => {
    expect(esquemaCadastro.safeParse({ email: "a@b.com", senha: "12345678" }).success).toBe(true);
  });
  it("criar escola exige nome com 2+ caracteres úteis", () => {
    expect(esquemaCriarEscola.safeParse({ nome: "  E  " }).success).toBe(false);
    expect(esquemaCriarEscola.safeParse({ nome: "Escola Alfa" }).success).toBe(true);
  });
  it("convite restringe papel a admin|coordenador", () => {
    expect(esquemaConvite.safeParse({ email: "a@b.com", papel: "coordenador" }).success).toBe(true);
    expect(esquemaConvite.safeParse({ email: "a@b.com", papel: "professor" }).success).toBe(false);
  });
});
