"use server";

import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { esquemaCadastro } from "@/lib/validacao/auth";

export type EstadoCadastro = { erro?: string; sucesso?: boolean };

export async function cadastrar(
  _anterior: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  const dados = esquemaCadastro.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!dados.success) {
    return { erro: dados.error.issues[0].message };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signUp({
    email: dados.data.email,
    password: dados.data.senha,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login?confirmado=1`,
    },
  });
  if (error) {
    return { erro: "Não foi possível cadastrar. Tente outro e-mail." };
  }
  return { sucesso: true };
}
