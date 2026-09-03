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
  // Substitui a grade inteira do turno (disponibilidades dos slots
  // antigos caem em cascata — avisado na UI antes de salvar).
  const { error: erroApagar } = await supabase
    .from("slots")
    .delete()
    .eq("turno_id", turnoId)
    .eq("unidade_id", perfil.unidade_id);
  if (erroApagar) return { erro: "Não foi possível regravar a grade." };

  const linhas = grade.data.dias.flatMap((dia) =>
    grade.data.horarios.map((h, ordem) => ({
      unidade_id: perfil.unidade_id,
      turno_id: turnoId,
      dia,
      ordem,
      hora_inicio: h.hora_inicio,
      hora_fim: h.hora_fim,
    })),
  );
  const { error } = await supabase.from("slots").insert(linhas);
  if (error) return { erro: "Não foi possível salvar a grade." };
  revalidatePath("/turnos");
  return { sucesso: true };
}
