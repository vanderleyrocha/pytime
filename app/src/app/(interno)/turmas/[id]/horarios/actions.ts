"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import type { EstadoCadastro } from "@/lib/cadastros";

// A matriz da turma só produz "indisponivel" (sem aula); o resto é "tem aula".
const esquemaMarcacoes = z.array(
  z.object({ slot_id: z.uuid(), status: z.literal("indisponivel") }),
);

export async function salvarSemAulaTurma(
  turmaId: string,
  marcacoes: unknown,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam os horários da turma." };
  }
  const dados = esquemaMarcacoes.safeParse(marcacoes);
  if (!dados.success) return { erro: "Marcações inválidas." };

  const supabase = await criarClienteServidor();
  // Apaga e regrava numa transação: falha não deixa a turma sem marcações.
  const { error } = await supabase.rpc("salvar_sem_aula_turma", {
    p_turma: turmaId,
    p_slots: dados.data.map((m) => m.slot_id),
  });
  if (error) return { erro: "Não foi possível salvar. Nada foi alterado." };
  revalidatePath(`/turmas/${turmaId}/horarios`);
  revalidatePath("/atribuicoes");
  return { sucesso: true };
}
