"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";

export type EstadoAceite = { erro?: string };

export async function aceitarConvite(
  _anterior: EstadoAceite,
  formData: FormData,
): Promise<EstadoAceite> {
  const token = formData.get("token");
  if (typeof token !== "string" || !token) {
    return { erro: "Convite inválido." };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("aceitar_convite", { p_token: token });
  if (error) {
    // A RPC devolve mensagens em português (expirado, já utilizado, e-mail errado)
    return { erro: error.message };
  }
  redirect("/painel");
}
