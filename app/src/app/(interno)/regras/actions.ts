"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  CATALOGO_REGRAS,
  esquemaParametros,
  hardPadrao,
  type TipoRegra,
} from "@/lib/validacao/regras";
import type { EstadoCadastro } from "@/lib/cadastros";

const esquemaBase = z.object({
  tipo: z.string(),
  hard: z.coerce.boolean(),
  peso: z.coerce.number().int().min(1, "Peso mínimo é 1"),
  ativa: z.coerce.boolean(),
});

export async function salvarRegra(
  id: string | null,
  valores: unknown,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam regras." };
  }
  const base = esquemaBase.safeParse(valores);
  if (!base.success) return { erro: base.error.issues[0].message };
  const tipo = base.data.tipo as TipoRegra;
  const meta = CATALOGO_REGRAS[tipo];
  if (!meta) return { erro: "Tipo de regra desconhecido." };

  const parametros = esquemaParametros.safeParse({
    ...(valores as object),
    tipo,
  });
  if (!parametros.success) {
    return { erro: parametros.error.issues[0].message };
  }
  const { tipo: tipoValidado, ...paramsSalvos } = parametros.data;
  void tipoValidado;

  // hard/soft: os tipos fixos ignoram o formulário; só 'alternavel' escolhe.
  const hard = meta.modo === "alternavel" ? base.data.hard : hardPadrao(tipo);

  const supabase = await criarClienteServidor();

  // As disciplinas referenciadas nos parâmetros precisam pertencer à
  // unidade ativa (RLS já protege, isto é defesa em profundidade).
  const idsDisciplinas = [
    (paramsSalvos as Record<string, unknown>).disciplina_id,
    (paramsSalvos as Record<string, unknown>).disciplina_a,
    (paramsSalvos as Record<string, unknown>).disciplina_b,
  ].filter((v): v is string => typeof v === "string");
  if (idsDisciplinas.length > 0) {
    const { data: encontradas } = await supabase
      .from("disciplinas")
      .select("id")
      .eq("unidade_id", perfil.unidade_id)
      .in("id", idsDisciplinas);
    if ((encontradas ?? []).length !== new Set(idsDisciplinas).size) {
      return { erro: "Disciplina não encontrada nesta unidade." };
    }
  }

  const linha = {
    unidade_id: perfil.unidade_id,
    tipo,
    hard,
    peso: base.data.peso,
    ativa: base.data.ativa,
    parametros: paramsSalvos,
  };
  if (id) {
    const { data, error } = await supabase
      .from("regras")
      .update(linha)
      .eq("id", id)
      .eq("unidade_id", perfil.unidade_id)
      .select("id")
      .maybeSingle();
    if (error) return { erro: "Não foi possível salvar a regra." };
    if (!data) return { erro: "Regra não encontrada." };
  } else {
    const { error } = await supabase.from("regras").insert(linha);
    if (error) return { erro: "Não foi possível salvar a regra." };
  }
  revalidatePath("/regras");
  return { sucesso: true };
}

export async function excluirRegra(id: string): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam regras." };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("regras")
    .delete()
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id);
  if (error) return { erro: "Não foi possível excluir." };
  revalidatePath("/regras");
  return { sucesso: true };
}

export async function alternarAtiva(
  id: string,
  ativa: boolean,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam regras." };
  }
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("regras")
    .update({ ativa })
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id)
    .select("id")
    .maybeSingle();
  if (error) return { erro: "Não foi possível alterar." };
  if (!data) return { erro: "Regra não encontrada." };
  revalidatePath("/regras");
  return { sucesso: true };
}
