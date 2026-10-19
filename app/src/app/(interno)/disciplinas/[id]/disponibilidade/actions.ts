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

export async function salvarDisponibilidadesDisciplina(
  disciplinaId: string,
  marcacoes: unknown,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam a disponibilidade." };
  }
  const dados = esquemaMarcacoes.safeParse(marcacoes);
  if (!dados.success) return { erro: "Marcações inválidas." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_disponibilidades_disciplina", {
    p_disciplina: disciplinaId,
    p_marcacoes: dados.data,
  });
  if (error) return { erro: "Não foi possível salvar. Nada foi alterado." };
  revalidatePath(`/disciplinas/${disciplinaId}/disponibilidade`);
  return { sucesso: true };
}
