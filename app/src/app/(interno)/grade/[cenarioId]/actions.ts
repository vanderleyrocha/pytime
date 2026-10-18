"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { criarClienteServico } from "@/lib/supabase/cliente-servico";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import type { InstanciaMotor } from "@/lib/instancia";
import type { Avaliacao } from "@/lib/edicao/avaliacao";
import { avaliarNoValidador } from "@/lib/edicao/validador";
import {
  esquemaAulas,
  esquemaNome,
  mapearErroRpc,
  montarExcecoes,
} from "@/lib/edicao/acoes";
import { traduzirViolacoes, type MotivoTraduzido } from "@/lib/nucleo";

export type EstadoAcao<T = undefined> = {
  erro?: string;
  dados?: T;
  violacoes?: MotivoTraduzido[];
};

type Contexto = {
  usuario: string;
  supabase: SupabaseClient;
  cenario: { id: string; versao: number; geracao_id: string };
};

/** Confere papel de gestor e devolve o cenário da unidade ativa (via RLS). */
async function contextoGestor(
  cenarioId: string,
): Promise<{ erro: string } | Contexto> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam cenários." };
  }
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada. Entre de novo." };
  const { data: cenario, error } = await supabase
    .from("cenarios")
    .select("id, versao, geracao_id")
    .eq("id", cenarioId)
    .eq("unidade_id", perfil.unidade_id)
    .maybeSingle();
  if (error) return { erro: "Não foi possível ler o cenário." };
  if (!cenario) return { erro: "Cenário não encontrado." };
  return { usuario: user.id, supabase, cenario };
}

/** Snapshot da instância da geração: a grade é sempre avaliada contra ele. */
async function instanciaDaGeracao(
  supabase: SupabaseClient,
  geracaoId: string,
): Promise<InstanciaMotor | null> {
  const { data } = await supabase
    .from("geracoes")
    .select("instancia")
    .eq("id", geracaoId)
    .maybeSingle();
  return (data?.instancia as InstanciaMotor | undefined) ?? null;
}

async function avaliar(
  ctx: Contexto,
  aulas: unknown,
): Promise<
  | { erro: string }
  | {
      aulas: z.infer<typeof esquemaAulas>;
      avaliacao: Avaliacao;
      violacoes: MotivoTraduzido[];
    }
> {
  const grade = esquemaAulas.safeParse(aulas);
  if (!grade.success) return { erro: grade.error.issues[0].message };
  const instancia = await instanciaDaGeracao(
    ctx.supabase,
    ctx.cenario.geracao_id,
  );
  if (!instancia)
    return { erro: "A geração deste cenário não foi encontrada." };
  const r = await avaliarNoValidador(instancia, grade.data);
  if (!r.ok) return { erro: r.erro };
  return {
    aulas: grade.data,
    avaliacao: r.avaliacao,
    violacoes: traduzirViolacoes(r.avaliacao.violacoes_hard, instancia),
  };
}

/** Avalia o rascunho no motor. Não grava nada. */
export async function avaliarRascunho(
  cenarioId: string,
  aulas: unknown,
): Promise<EstadoAcao<{ avaliacao: Avaliacao }>> {
  const ctx = await contextoGestor(cenarioId);
  if ("erro" in ctx) return { erro: ctx.erro };
  const r = await avaliar(ctx, aulas);
  if ("erro" in r) return { erro: r.erro };
  return { dados: { avaliacao: r.avaliacao }, violacoes: r.violacoes };
}

/**
 * Salva a grade editada. Revalida no motor (nunca confia no veredito do
 * cliente); com violações, só grava se `forcar`, registrando as exceções.
 */
export async function salvarCenario(
  cenarioId: string,
  versaoLida: number,
  aulas: unknown,
  forcar: boolean,
): Promise<EstadoAcao<{ versao: number }>> {
  const versao = z.number().int().min(1).safeParse(versaoLida);
  if (!versao.success) return { erro: "Versão do cenário inválida." };
  const ctx = await contextoGestor(cenarioId);
  if ("erro" in ctx) return { erro: ctx.erro };
  const r = await avaliar(ctx, aulas);
  if ("erro" in r) return { erro: r.erro };
  const violacoes = r.avaliacao.violacoes_hard;
  if (violacoes.length > 0 && !forcar) {
    return {
      erro: "A grade viola regras obrigatórias. Corrija ou salve mesmo assim.",
      violacoes: r.violacoes,
    };
  }
  const excecoes = forcar
    ? montarExcecoes(violacoes, ctx.usuario, new Date().toISOString())
    : [];
  const { data, error } = await criarClienteServico().rpc(
    "salvar_grade_cenario",
    {
      p_cenario: cenarioId,
      p_versao_lida: versao.data,
      p_aulas: r.aulas,
      p_avaliacao: r.avaliacao,
      p_excecoes: excecoes,
      p_usuario: ctx.usuario,
    },
  );
  if (error) return { erro: mapearErroRpc(error.message) };
  revalidatePath(`/grade/${cenarioId}`);
  revalidatePath("/geracoes");
  return { dados: { versao: data as number } };
}

export async function duplicarCenario(
  cenarioId: string,
  nome?: string,
): Promise<EstadoAcao<{ id: string }>> {
  const nomeValido = nome ? esquemaNome.safeParse(nome) : null;
  if (nomeValido && !nomeValido.success) {
    return { erro: nomeValido.error.issues[0].message };
  }
  const ctx = await contextoGestor(cenarioId);
  if ("erro" in ctx) return { erro: ctx.erro };
  const { data, error } = await criarClienteServico().rpc("duplicar_cenario", {
    p_cenario: cenarioId,
    p_nome: nomeValido?.data ?? null,
    p_usuario: ctx.usuario,
  });
  if (error) return { erro: mapearErroRpc(error.message) };
  revalidatePath("/geracoes");
  return { dados: { id: data as string } };
}

export async function renomearCenario(
  cenarioId: string,
  nome: string,
): Promise<EstadoAcao> {
  const nomeValido = esquemaNome.safeParse(nome);
  if (!nomeValido.success) return { erro: nomeValido.error.issues[0].message };
  const ctx = await contextoGestor(cenarioId);
  if ("erro" in ctx) return { erro: ctx.erro };
  const { error } = await criarClienteServico().rpc("renomear_cenario", {
    p_cenario: cenarioId,
    p_nome: nomeValido.data,
    p_usuario: ctx.usuario,
  });
  if (error) return { erro: mapearErroRpc(error.message) };
  revalidatePath(`/grade/${cenarioId}`);
  revalidatePath("/geracoes");
  return {};
}

export async function marcarOficial(cenarioId: string): Promise<EstadoAcao> {
  const ctx = await contextoGestor(cenarioId);
  if ("erro" in ctx) return { erro: ctx.erro };
  const { error } = await criarClienteServico().rpc("marcar_oficial", {
    p_cenario: cenarioId,
    p_usuario: ctx.usuario,
  });
  if (error) return { erro: mapearErroRpc(error.message) };
  revalidatePath(`/grade/${cenarioId}`);
  revalidatePath("/geracoes");
  return {};
}
