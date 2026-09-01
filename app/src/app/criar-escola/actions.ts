"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { esquemaCriarEscola } from "@/lib/validacao/auth";

export type EstadoEscola = { erro?: string };

export async function criarEscola(
  _anterior: EstadoEscola,
  formData: FormData,
): Promise<EstadoEscola> {
  const dados = esquemaCriarEscola.safeParse({ nome: formData.get("nome") });
  if (!dados.success) {
    return { erro: dados.error.issues[0].message };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("criar_unidade_com_admin", {
    p_nome: dados.data.nome,
  });
  if (error) {
    return { erro: "Não foi possível criar a escola. Tente novamente." };
  }
  redirect("/painel");
}
