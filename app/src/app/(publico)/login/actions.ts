"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { ehCaminhoInterno } from "@/lib/rotas";
import { esquemaLogin } from "@/lib/validacao/auth";

export type EstadoAuth = { erro?: string };

export async function entrar(
  _anterior: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const dados = esquemaLogin.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!dados.success) {
    return { erro: dados.error.issues[0].message };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });
  if (error) {
    return { erro: "E-mail ou senha incorretos, ou e-mail não confirmado." };
  }
  const proximo = formData.get("proximo");
  redirect(
    typeof proximo === "string" && ehCaminhoInterno(proximo)
      ? proximo
      : "/painel",
  );
}

export async function sair(): Promise<void> {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
