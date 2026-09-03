"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { criarClienteServico } from "@/lib/supabase/cliente-servico";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { esquemaConvite } from "@/lib/validacao/auth";

export type EstadoConvite = {
  erro?: string;
  sucesso?: boolean;
  aviso?: string;
};

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
  // E-mail via Supabase Auth; se falhar (ou se o usuário já existir), o
  // convite continua válido pelo link copiável exibido na lista.
  const servico = criarClienteServico();
  const { error: erroEmail } = await servico.auth.admin.inviteUserByEmail(
    dados.data.email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/convite/${data.token}`,
    },
  );
  revalidatePath("/convites");
  if (erroEmail) {
    console.error("Falha ao enviar e-mail de convite:", erroEmail.message);
    return {
      sucesso: true,
      aviso:
        "Convite criado, mas o e-mail não pôde ser enviado — copie o link da lista e envie manualmente.",
    };
  }
  return { sucesso: true };
}

export async function revogarConvite(formData: FormData): Promise<void> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel !== "admin") return;
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const supabase = await criarClienteServidor();
  await supabase.from("convites").delete().eq("id", id); // RLS: só admin
  revalidatePath("/convites");
}
