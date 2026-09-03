"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { buscarDadosUnidade, montarInstancia } from "@/lib/instancia";
import { calcularPendencias, type PendenciaMatriz } from "@/lib/matriz";

const esquemaBudget = z.coerce
  .number()
  .int()
  .min(1, "Budget mínimo é 1 s")
  .max(600, "Budget máximo é 600 s");

export type EstadoGerar = { erro?: string; pendencias?: PendenciaMatriz[] };

export async function gerarHorario(
  _anterior: EstadoGerar,
  formData: FormData,
): Promise<EstadoGerar> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores geram horários." };
  }
  const budget = esquemaBudget.safeParse(formData.get("budget"));
  if (!budget.success) return { erro: budget.error.issues[0].message };

  const supabase = await criarClienteServidor();
  let dados;
  try {
    dados = await buscarDadosUnidade(supabase, perfil.unidade_id);
  } catch {
    return { erro: "Não foi possível ler os dados da unidade." };
  }

  if (dados.turmas.length === 0) {
    return { erro: "Cadastre turmas e atribuições antes de gerar." };
  }

  // Pré-validação barata (a pesada é do motor): matriz cheia por turma
  const slotsPorTurno: Record<string, number> = {};
  for (const s of dados.slots) {
    slotsPorTurno[s.turno_id] = (slotsPorTurno[s.turno_id] ?? 0) + 1;
  }
  const cargaPorTurma: Record<string, number> = {};
  for (const a of dados.atribuicoes) {
    cargaPorTurma[a.turma_id] =
      (cargaPorTurma[a.turma_id] ?? 0) + a.carga_semanal;
  }
  const pendencias = calcularPendencias(
    dados.turmas,
    slotsPorTurno,
    cargaPorTurma,
  );
  if (pendencias.length > 0) {
    return { erro: "Matriz incompleta — ajuste as atribuições.", pendencias };
  }

  const instancia = montarInstancia(dados, budget.data);
  const { error } = await supabase.from("geracoes").insert({
    unidade_id: perfil.unidade_id,
    instancia,
    budget_segundos: budget.data,
  });
  if (error) return { erro: "Não foi possível enfileirar a geração." };
  revalidatePath("/geracoes");
  return {};
}

export async function tentarNovamente(formData: FormData): Promise<void> {
  const geracaoId = formData.get("geracao_id");
  if (typeof geracaoId !== "string") return;
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") return;
  const supabase = await criarClienteServidor();
  // Reaproveita a mesma instância/budget numa geração nova (spec §6)
  const { data: original } = await supabase
    .from("geracoes")
    .select("instancia, budget_segundos")
    .eq("id", geracaoId)
    .eq("unidade_id", perfil.unidade_id)
    .in("status", ["erro", "inviavel"])
    .maybeSingle();
  if (!original) return;
  await supabase.from("geracoes").insert({
    unidade_id: perfil.unidade_id,
    instancia: original.instancia,
    budget_segundos: original.budget_segundos,
  });
  revalidatePath("/geracoes");
}
