import type { SupabaseClient } from "@supabase/supabase-js";

/** Linhas cruas das consultas por unidade, na forma do banco. */
export type DadosUnidade = {
  turnos: { id: string; nome: string }[];
  slots: { id: string; dia: number; ordem: number; turno_id: string }[];
  turmas: { id: string; nome: string; turno_id: string }[];
  disciplinas: { id: string; nome: string }[];
  professores: { id: string; nome: string }[];
  disponibilidades: { professor_id: string; slot_id: string; status: string }[];
  recursos: { id: string; nome: string; capacidade: number }[];
  atribuicoes: {
    id: string;
    professor_id: string;
    disciplina_id: string;
    turma_id: string;
    carga_semanal: number;
    geminadas: number;
  }[];
  atribuicaoRecursos: { atribuicao_id: string; recurso_id: string }[];
  regras: {
    id: string;
    tipo: string;
    hard: boolean;
    peso: number;
    ativa: boolean;
    parametros: Record<string, unknown>;
  }[];
};

/** Espelho TS do contrato JSON de `pytime_engine.Instancia`. */
export type InstanciaMotor = {
  turnos: { id: string; nome: string }[];
  slots: { id: string; dia: number; ordem: number; turno_id: string }[];
  turmas: { id: string; nome: string; turno_id: string }[];
  disciplinas: { id: string; nome: string }[];
  professores: {
    id: string;
    nome: string;
    disponibilidade: Record<string, string>;
  }[];
  atribuicoes: {
    id: string;
    professor_id: string;
    disciplina_id: string;
    turma_id: string;
    carga_semanal: number;
    geminadas: number;
    recurso_ids: string[];
  }[];
  recursos: { id: string; nome: string; capacidade: number }[];
  regras: {
    id: string;
    tipo: string;
    hard: boolean;
    peso: number;
    ativa: boolean;
    parametros: Record<string, unknown>;
  }[];
  budget_segundos: number;
};

/** Monta a instância do motor a partir das linhas do banco (função pura). */
export function montarInstancia(
  dados: DadosUnidade,
  budgetSegundos: number,
): InstanciaMotor {
  const disponibilidadePorProfessor = new Map<string, Record<string, string>>();
  for (const d of dados.disponibilidades) {
    const mapa = disponibilidadePorProfessor.get(d.professor_id) ?? {};
    mapa[d.slot_id] = d.status;
    disponibilidadePorProfessor.set(d.professor_id, mapa);
  }
  const recursosPorAtribuicao = new Map<string, string[]>();
  for (const ar of dados.atribuicaoRecursos) {
    const lista = recursosPorAtribuicao.get(ar.atribuicao_id) ?? [];
    lista.push(ar.recurso_id);
    recursosPorAtribuicao.set(ar.atribuicao_id, lista);
  }
  return {
    turnos: dados.turnos,
    slots: dados.slots,
    turmas: dados.turmas,
    disciplinas: dados.disciplinas,
    professores: dados.professores.map((p) => ({
      ...p,
      disponibilidade: disponibilidadePorProfessor.get(p.id) ?? {},
    })),
    atribuicoes: dados.atribuicoes.map((a) => ({
      ...a,
      recurso_ids: recursosPorAtribuicao.get(a.id) ?? [],
    })),
    recursos: dados.recursos,
    regras: dados.regras,
    budget_segundos: budgetSegundos,
  };
}

/** Lê todas as tabelas da unidade necessárias para montar a instância. */
export async function buscarDadosUnidade(
  supabase: SupabaseClient,
  unidadeId: string,
): Promise<DadosUnidade> {
  const [
    turnos,
    slots,
    turmas,
    disciplinas,
    professores,
    disponibilidades,
    recursos,
    atribuicoes,
    atribuicaoRecursos,
    regras,
  ] = await Promise.all([
    supabase.from("turnos").select("id, nome").eq("unidade_id", unidadeId),
    supabase
      .from("slots")
      .select("id, dia, ordem, turno_id")
      .eq("unidade_id", unidadeId),
    supabase
      .from("turmas")
      .select("id, nome, turno_id")
      .eq("unidade_id", unidadeId),
    supabase.from("disciplinas").select("id, nome").eq("unidade_id", unidadeId),
    supabase.from("professores").select("id, nome").eq("unidade_id", unidadeId),
    supabase
      .from("disponibilidades")
      .select("professor_id, slot_id, status")
      .eq("unidade_id", unidadeId),
    supabase
      .from("recursos")
      .select("id, nome, capacidade")
      .eq("unidade_id", unidadeId),
    supabase
      .from("atribuicoes")
      .select(
        "id, professor_id, disciplina_id, turma_id, carga_semanal, geminadas",
      )
      .eq("unidade_id", unidadeId),
    supabase.from("atribuicao_recursos").select("atribuicao_id, recurso_id"),
    supabase
      .from("regras")
      .select("id, tipo, hard, peso, ativa, parametros")
      .eq("unidade_id", unidadeId),
  ]);
  const erro = [
    turnos,
    slots,
    turmas,
    disciplinas,
    professores,
    disponibilidades,
    recursos,
    atribuicoes,
    atribuicaoRecursos,
    regras,
  ].find((r) => r.error);
  if (erro?.error) {
    throw new Error(`Falha ao ler os dados da unidade: ${erro.error.message}`);
  }
  const idsAtribuicoes = new Set((atribuicoes.data ?? []).map((a) => a.id));
  return {
    turnos: turnos.data ?? [],
    slots: slots.data ?? [],
    turmas: turmas.data ?? [],
    disciplinas: disciplinas.data ?? [],
    professores: professores.data ?? [],
    disponibilidades: disponibilidades.data ?? [],
    recursos: recursos.data ?? [],
    atribuicoes: atribuicoes.data ?? [],
    // atribuicao_recursos não tem unidade_id: RLS limita às unidades do
    // usuário e este filtro garante só a unidade ativa.
    atribuicaoRecursos: (atribuicaoRecursos.data ?? []).filter((ar) =>
      idsAtribuicoes.has(ar.atribuicao_id),
    ),
    regras: (regras.data ?? []) as DadosUnidade["regras"],
  };
}
