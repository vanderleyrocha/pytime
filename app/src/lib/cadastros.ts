"use server";

import { revalidatePath } from "next/cache";
import type { ZodType } from "zod";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  esquemaDisciplina,
  esquemaProfessor,
  esquemaRecurso,
  esquemaTurma,
  esquemaTurno,
} from "@/lib/validacao/cadastros";

// Allowlist: o cliente escolhe a tabela, então só tabelas de cadastro
// simples entram aqui (o RLS é a última linha de defesa).
const ESQUEMAS: Record<string, ZodType> = {
  turnos: esquemaTurno,
  turmas: esquemaTurma,
  disciplinas: esquemaDisciplina,
  recursos: esquemaRecurso,
  professores: esquemaProfessor,
};

export type TabelaCadastro =
  | "turnos"
  | "turmas"
  | "disciplinas"
  | "recursos"
  | "professores";

export type EstadoCadastro = { erro?: string; sucesso?: boolean };

async function exigirGestor() {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") return null;
  return perfil;
}

export async function salvarRegistro(
  tabela: TabelaCadastro,
  id: string | null,
  valores: Record<string, unknown>,
): Promise<EstadoCadastro> {
  const esquema = ESQUEMAS[tabela];
  if (!esquema) return { erro: "Cadastro desconhecido." };
  const perfil = await exigirGestor();
  if (!perfil) return { erro: "Apenas gestores editam cadastros." };
  const dados = esquema.safeParse(valores);
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const linha = { ...(dados.data as object), unidade_id: perfil.unidade_id };
  if (id) {
    const { data, error } = await supabase
      .from(tabela)
      .update(linha)
      .eq("id", id)
      .eq("unidade_id", perfil.unidade_id)
      .select("id")
      .maybeSingle();
    if (error) return { erro: "Não foi possível salvar. Tente novamente." };
    if (!data) return { erro: "Registro não encontrado." };
  } else {
    const { error } = await supabase.from(tabela).insert(linha);
    if (error) return { erro: "Não foi possível salvar. Tente novamente." };
  }
  revalidatePath(`/${tabela}`);
  return { sucesso: true };
}

export async function excluirRegistro(
  tabela: TabelaCadastro,
  id: string,
): Promise<EstadoCadastro> {
  if (!ESQUEMAS[tabela]) return { erro: "Cadastro desconhecido." };
  const perfil = await exigirGestor();
  if (!perfil) return { erro: "Apenas gestores editam cadastros." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from(tabela)
    .delete()
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id);
  if (error) {
    return {
      erro: "Não foi possível excluir — verifique se o registro está em uso.",
    };
  }
  revalidatePath(`/${tabela}`);
  return { sucesso: true };
}
