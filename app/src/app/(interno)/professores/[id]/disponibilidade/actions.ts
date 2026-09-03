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
  const { error: erroApagar } = await supabase
    .from("disponibilidades")
    .delete()
    .eq("professor_id", professorId)
    .eq("unidade_id", perfil.unidade_id);
  if (erroApagar) return { erro: "Não foi possível salvar." };

  if (dados.data.length > 0) {
    const { error } = await supabase.from("disponibilidades").insert(
      dados.data.map((m) => ({
        unidade_id: perfil.unidade_id,
        professor_id: professorId,
        slot_id: m.slot_id,
        status: m.status,
      })),
    );
    if (error) return { erro: "Não foi possível salvar." };
  }
  revalidatePath(`/professores/${professorId}/disponibilidade`);
  return { sucesso: true };
}
