"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  codigosExistentes,
  lerArquivosCarga,
  resumirPacote,
  type ResumoPacote,
} from "@/lib/carga/arquivos";
import { validarPacote } from "@/lib/carga/validacao";

export type EstadoImportar = {
  erros?: string[];
  avisos?: string[];
  resumo?: ResumoPacote;
  importado?: boolean;
};

const PAGINAS_CADASTRO = [
  "/turnos",
  "/turmas",
  "/disciplinas",
  "/professores",
  "/recursos",
  "/atribuicoes",
  "/regras",
];

/**
 * Valida (modo "validar") ou valida e grava (modo "importar") o pacote de
 * carga enviado. A gravação é uma única transação (RPC
 * importar_pacote_carga): ou entra tudo, ou nada.
 */
export async function importarPacote(
  _anterior: EstadoImportar,
  formData: FormData,
): Promise<EstadoImportar> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erros: ["Apenas gestores importam dados."] };
  }
  const arquivos = await Promise.all(
    formData
      .getAll("arquivos")
      .filter((f): f is File => f instanceof File && f.size > 0)
      .map(async (f) => ({ nome: f.name, texto: await f.text() })),
  );
  const lidos = lerArquivosCarga(arquivos);
  if (lidos.erros.length) return { erros: lidos.erros };

  const supabase = await criarClienteServidor();
  const u = perfil.unidade_id;
  const consultas = await Promise.all([
    supabase.from("turnos").select("id, codigo_externo").eq("unidade_id", u),
    supabase.from("turmas").select("codigo_externo").eq("unidade_id", u),
    supabase.from("disciplinas").select("codigo_externo").eq("unidade_id", u),
    supabase.from("professores").select("codigo_externo").eq("unidade_id", u),
    supabase.from("recursos").select("codigo_externo").eq("unidade_id", u),
    supabase.from("slots").select("turno_id, dia, ordem").eq("unidade_id", u),
  ]);
  if (consultas.some((c) => c.error)) {
    return { erros: ["Não foi possível ler os cadastros da unidade."] };
  }
  const [turnos, turmas, disciplinas, professores, recursos, slots] =
    consultas.map((c) => c.data ?? []);
  const existentes = codigosExistentes({
    turnos: turnos as { id: string; codigo_externo: string | null }[],
    turmas: turmas as { codigo_externo: string | null }[],
    disciplinas: disciplinas as { codigo_externo: string | null }[],
    professores: professores as { codigo_externo: string | null }[],
    recursos: recursos as { codigo_externo: string | null }[],
    slots: slots as { turno_id: string; dia: number; ordem: number }[],
  });

  const { pacote, erros, avisos } = validarPacote(lidos.bruto, existentes);
  if (!pacote) return { erros };
  const resumo = resumirPacote(pacote);
  if (formData.get("modo") !== "importar") return { avisos, resumo };

  const { error } = await supabase.rpc("importar_pacote_carga", {
    p_unidade_id: u,
    p_pacote: pacote,
  });
  if (error) {
    return { erros: [`Nada foi gravado: ${error.message}`], avisos, resumo };
  }
  for (const p of PAGINAS_CADASTRO) revalidatePath(p);
  return { avisos, resumo, importado: true };
}
