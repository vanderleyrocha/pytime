"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { criarClienteServico } from "@/lib/supabase/cliente-servico";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { esquemaConvite } from "@/lib/validacao/auth";

export type EstadoConvite = { erro?: string; sucesso?: boolean };

export async function criarConvite(
  _anterior: EstadoConvite,
  formData: FormData,
): Promise<EstadoConvite> {
  const dados = esquemaConvite.safeParse({
    email: formData.get("email"),
    papel: formData.get("papel"),
  });
  if (!dados.success) {
    return { erro: dados.error.issues[0].message };
  }
  // Revalidação de role no servidor (o RLS é a última linha de defesa)
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel !== "admin") {
    return { erro: "Apenas administradores convidam usuários." };
  }
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("convites")
    .insert({
      unidade_id: perfil.unidade_id,
      email: dados.data.email,
      papel: dados.data.papel,
    })
    .select("token")
    .single();
  if (error || !data) {
    return { erro: "Não foi possível criar o convite." };
  }
  // E-mail best-effort via Supabase Auth; se o usuário já existir, o
  // convite continua válido pelo link copiável exibido na lista.
  try {
    const servico = criarClienteServico();
    await servico.auth.admin.inviteUserByEmail(dados.data.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/convite/${data.token}`,
    });
  } catch {
    // silencioso: o link copiável cobre este caso
  }
  revalidatePath("/convites");
  return { sucesso: true };
}

export async function revogarConvite(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const supabase = await criarClienteServidor();
  await supabase.from("convites").delete().eq("id", id); // RLS: só admin
  revalidatePath("/convites");
}
