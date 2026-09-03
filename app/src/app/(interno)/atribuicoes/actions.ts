"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { esquemaAtribuicao } from "@/lib/validacao/cadastros";
import type { EstadoCadastro } from "@/lib/cadastros";

export async function salvarAtribuicao(
  id: string | null,
  valores: unknown,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam atribuições." };
  }
  const dados = esquemaAtribuicao.safeParse(valores);
  if (!dados.success) return { erro: dados.error.issues[0].message };
  const { recurso_ids, ...atribuicao } = dados.data;

  const supabase = await criarClienteServidor();
  let atribuicaoId = id;
  if (id) {
    const { error } = await supabase
      .from("atribuicoes")
      .update(atribuicao)
      .eq("id", id)
      .eq("unidade_id", perfil.unidade_id);
    if (error) return { erro: mensagemErro(error.code) };
  } else {
    const { data, error } = await supabase
      .from("atribuicoes")
      .insert({ ...atribuicao, unidade_id: perfil.unidade_id })
      .select("id")
      .single();
    if (error || !data) return { erro: mensagemErro(error?.code) };
    atribuicaoId = data.id;
  }

  const { error: erroLimpar } = await supabase
    .from("atribuicao_recursos")
    .delete()
    .eq("atribuicao_id", atribuicaoId!);
  if (erroLimpar) return { erro: "Não foi possível salvar os recursos." };
  if (recurso_ids.length > 0) {
    const { error } = await supabase.from("atribuicao_recursos").insert(
      recurso_ids.map((recurso_id) => ({
        atribuicao_id: atribuicaoId!,
        recurso_id,
      })),
    );
    if (error) return { erro: "Não foi possível salvar os recursos." };
  }
  revalidatePath("/atribuicoes");
  return { sucesso: true };
}

function mensagemErro(codigo?: string): string {
  if (codigo === "23505") {
    return "Já existe atribuição deste professor/disciplina/turma.";
  }
  return "Não foi possível salvar. Tente novamente.";
}

export async function excluirAtribuicao(id: string): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam atribuições." };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("atribuicoes")
    .delete()
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id);
  if (error) return { erro: "Não foi possível excluir." };
  revalidatePath("/atribuicoes");
  return { sucesso: true };
}
