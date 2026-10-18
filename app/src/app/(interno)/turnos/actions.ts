"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { esquemaGrade } from "@/lib/validacao/cadastros";
import type { EstadoCadastro } from "@/lib/cadastros";

export async function salvarGrade(
  turnoId: string,
  dados: unknown,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam a grade." };
  }
  const grade = esquemaGrade.safeParse(dados);
  if (!grade.success) return { erro: grade.error.issues[0].message };

  const supabase = await criarClienteServidor();
  // Substitui a grade inteira do turno numa transação (disponibilidades dos
  // slots antigos caem em cascata — avisado na UI antes de salvar).
  const { error } = await supabase.rpc("salvar_grade_turno", {
    p_turno: turnoId,
    p_dias: grade.data.dias,
    p_horarios: grade.data.horarios,
  });
  if (error)
    return { erro: "Não foi possível salvar a grade. Nada foi alterado." };
  revalidatePath("/turnos");
  return { sucesso: true };
}
