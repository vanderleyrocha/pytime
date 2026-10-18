"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import type { EstadoCadastro } from "@/lib/cadastros";

const esquemaMarcacoes = z.array(
  z.object({
    slot_id: z.uuid(),
    status: z.enum(["indisponivel", "prefere", "evita"]),
  }),
);

export async function salvarDisponibilidades(
  professorId: string,
  marcacoes: unknown,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam a disponibilidade." };
  }
  const dados = esquemaMarcacoes.safeParse(marcacoes);
  if (!dados.success) return { erro: "Marcações inválidas." };

  const supabase = await criarClienteServidor();
  // Apaga e regrava numa transação: falha não deixa o professor sem marcações.
  const { error } = await supabase.rpc("salvar_disponibilidades", {
    p_professor: professorId,
    p_marcacoes: dados.data,
  });
  if (error) return { erro: "Não foi possível salvar. Nada foi alterado." };
  revalidatePath(`/professores/${professorId}/disponibilidade`);
  return { sucesso: true };
}
