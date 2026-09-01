"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { obterPerfis, type Perfil } from "@/lib/perfis";

const COOKIE_UNIDADE = "unidade_ativa";

export async function obterUnidadeAtiva(): Promise<Perfil | null> {
  const perfis = await obterPerfis();
  if (perfis.length === 0) return null;
  const cookieStore = await cookies();
  const escolhida = cookieStore.get(COOKIE_UNIDADE)?.value;
  return perfis.find((p) => p.unidade_id === escolhida) ?? perfis[0];
}

export async function definirUnidadeAtiva(formData: FormData): Promise<void> {
  const unidadeId = formData.get("unidade_id");
  if (typeof unidadeId !== "string") return;
  const perfis = await obterPerfis();
  if (!perfis.some((p) => p.unidade_id === unidadeId)) return;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_UNIDADE, unidadeId, { path: "/" });
  revalidatePath("/", "layout");
}
