import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buscarDadosUnidade, montarInstancia } from "../src/lib/instancia";

/**
 * Massa do E2E no STAGING (nunca produção), criada via service_role e sem
 * depender do worker: unidade descartável, gestora com senha, 1 turma com
 * 3 aulas e uma professora indisponível no 1º horário de segunda — trocar
 * Matemática com Português viola a disponibilidade; com História, não.
 */
export type Semente = {
  email: string;
  senha: string;
  usuarioId: string;
  unidadeId: string;
  cenarioId: string;
  turmaId: string;
  slots: { seg1: string; seg2: string; ter1: string };
};

export const NOMES = {
  matematica: "Matemática E2E",
  portugues: "Português E2E",
  historia: "História E2E",
  professoraPortugues: "Profa. Beatriz E2E",
};

export function clienteServico(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error(
      "E2E exige NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do staging.",
    );
  }
  return createClient(url, chave, { auth: { persistSession: false } });
}

async function inserir<T>(
  sb: SupabaseClient,
  tabela: string,
  linhas: object | object[],
): Promise<T[]> {
  const { data, error } = await sb.from(tabela).insert(linhas).select();
  if (error) throw new Error(`semente: ${tabela}: ${error.message}`);
  return data as T[];
}

export async function semear(sb: SupabaseClient): Promise<Semente> {
  const sufixo = randomUUID().slice(0, 8);
  const email = `e2e-${sufixo}@pytime.test`;
  const senha = `E2e-${randomUUID()}`;
  const { data: criado, error: erroUsuario } = await sb.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (erroUsuario) throw new Error(`semente: usuária: ${erroUsuario.message}`);
  const usuarioId = criado.user.id;

  const [unidade] = await inserir<{ id: string }>(sb, "unidades", {
    nome: `Escola E2E ${sufixo}`,
  });
  const u = unidade.id;
  await inserir(sb, "perfis", {
    user_id: usuarioId,
    unidade_id: u,
    papel: "coordenador",
  });

  const [turno] = await inserir<{ id: string }>(sb, "turnos", {
    unidade_id: u,
    nome: "Manhã",
  });
  const slots = await inserir<{ id: string; dia: number; ordem: number }>(
    sb,
    "slots",
    [
      { dia: 0, ordem: 0 },
      { dia: 0, ordem: 1 },
      { dia: 1, ordem: 0 },
    ].map((s) => ({ ...s, unidade_id: u, turno_id: turno.id })),
  );
  const slot = (dia: number, ordem: number) =>
    slots.find((s) => s.dia === dia && s.ordem === ordem)!.id;
  const [turma] = await inserir<{ id: string }>(sb, "turmas", {
    unidade_id: u,
    turno_id: turno.id,
    nome: "6º A",
  });
  const disciplinas = await inserir<{ id: string; nome: string }>(
    sb,
    "disciplinas",
    [NOMES.matematica, NOMES.portugues, NOMES.historia].map((nome) => ({
      unidade_id: u,
      nome,
    })),
  );
  const professores = await inserir<{ id: string; nome: string }>(
    sb,
    "professores",
    ["Prof. Ana E2E", NOMES.professoraPortugues, "Prof. Caio E2E"].map(
      (nome) => ({ unidade_id: u, nome }),
    ),
  );
  await inserir(sb, "disponibilidades", {
    unidade_id: u,
    professor_id: professores[1].id,
    slot_id: slot(0, 0),
    status: "indisponivel",
  });
  await inserir(sb, "regras", {
    unidade_id: u,
    tipo: "disponibilidade_professor",
    hard: true,
  });
  const atribuicoes = await inserir<{ id: string; professor_id: string }>(
    sb,
    "atribuicoes",
    [0, 1, 2].map((i) => ({
      unidade_id: u,
      professor_id: professores[i].id,
      disciplina_id: disciplinas[i].id,
      turma_id: turma.id,
      carga_semanal: 1,
    })),
  );
  const atribuicaoDe = (i: number) =>
    atribuicoes.find((a) => a.professor_id === professores[i].id)!.id;

  // snapshot igual ao que o app montaria: sem aviso de "cadastros mudaram"
  const instancia = montarInstancia(await buscarDadosUnidade(sb, u), 10);
  const [geracao] = await inserir<{ id: string }>(sb, "geracoes", {
    unidade_id: u,
    status: "concluida",
    instancia,
    resultado: { status: "otimo", custo_total: 0, custos: [] },
    budget_segundos: 10,
    criada_por: usuarioId,
  });
  const [cenario] = await inserir<{ id: string }>(sb, "cenarios", {
    unidade_id: u,
    geracao_id: geracao.id,
  });
  await inserir(
    sb,
    "aulas_alocadas",
    [
      [0, slot(0, 0)],
      [1, slot(0, 1)],
      [2, slot(1, 0)],
    ].map(([i, s]) => ({
      unidade_id: u,
      cenario_id: cenario.id,
      atribuicao_id: atribuicaoDe(i as number),
      slot_id: s,
    })),
  );

  return {
    email,
    senha,
    usuarioId,
    unidadeId: u,
    cenarioId: cenario.id,
    turmaId: turma.id,
    slots: { seg1: slot(0, 0), seg2: slot(0, 1), ter1: slot(1, 0) },
  };
}

/**
 * Remove a massa. A ordem importa: FKs `on delete restrict` (atribuições →
 * professores/disciplinas, turmas → turnos) barrariam o cascade da unidade.
 */
export async function limpar(
  sb: SupabaseClient,
  s: Pick<Semente, "unidadeId" | "usuarioId">,
): Promise<void> {
  for (const tabela of ["geracoes", "atribuicoes", "turmas"]) {
    const { error } = await sb
      .from(tabela)
      .delete()
      .eq("unidade_id", s.unidadeId);
    if (error) throw new Error(`limpeza: ${tabela}: ${error.message}`);
  }
  const { error } = await sb.from("unidades").delete().eq("id", s.unidadeId);
  if (error) throw new Error(`limpeza: unidades: ${error.message}`);
  await sb.auth.admin.deleteUser(s.usuarioId);
}
