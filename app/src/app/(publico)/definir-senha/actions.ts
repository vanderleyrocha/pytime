"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { ehCaminhoInterno } from "@/lib/rotas";
import { z } from "zod";

const esquemaSenha = z.object({
  senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

export type EstadoSenha = { erro?: string };

export async function definirSenha(
  _anterior: EstadoSenha,
  formData: FormData,
): Promise<EstadoSenha> {
  const dados = esquemaSenha.safeParse({ senha: formData.get("senha") });
  if (!dados.success) {
    return { erro: dados.error.issues[0].message };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({
    password: dados.data.senha,
  });
  if (error) {
    return { erro: "Não foi possível definir a senha. Tente novamente." };
  }
  const proximo = formData.get("proximo");
  redirect(
    typeof proximo === "string" && ehCaminhoInterno(proximo)
      ? proximo
      : "/painel",
  );
}
