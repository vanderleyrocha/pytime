import "server-only";
import type { Avaliacao } from "@/lib/edicao/avaliacao";
import type { Aula } from "@/lib/edicao/trocas";
import { avaliarNoValidador } from "@/lib/edicao/validador";
import type { InstanciaMotor } from "@/lib/instancia";
import { avaliacaoDesatualizada } from "@/lib/pontos-atencao";
import { criarClienteServico } from "@/lib/supabase/cliente-servico";

/** Abaixo do timeout padrão: a página espera por esta chamada. */
const TIMEOUT_MS = 8_000;

/**
 * Avaliação a exibir para a grade do cenário. Avaliações antigas (sem as
 * ocorrências do motor) ou ausentes são recalculadas no validador contra o
 * snapshot da geração; com `gravar`, o resultado fica salvo para as
 * próximas visitas. Best-effort: qualquer falha mantém a avaliação lida.
 *
 * Só avalia a grade completa (nº de aulas = carga total da instância): uma
 * leitura truncada pelo limite de linhas do PostgREST viraria violação
 * estrutural e um custo falso. Pelo mesmo motivo, resultado com violação
 * `estrutural:`/`instancia:` é descartado.
 */
export async function reavaliarSeDesatualizada(
  avaliacao: Avaliacao | null,
  instancia: InstanciaMotor | null,
  aulas: Aula[],
  opcoes: {
    avaliar?: typeof avaliarNoValidador;
    gravar?: (nova: Avaliacao) => Promise<void>;
  } = {},
): Promise<Avaliacao | null> {
  if (!instancia || !avaliacaoDesatualizada(avaliacao)) return avaliacao;
  const carga = instancia.atribuicoes.reduce((s, a) => s + a.carga_semanal, 0);
  if (aulas.length === 0 || aulas.length !== carga) return avaliacao;
  const avaliar = opcoes.avaliar ?? avaliarNoValidador;
  const r = await avaliar(instancia, aulas, { timeoutMs: TIMEOUT_MS });
  if (!r.ok) return avaliacao;
  const quebrada = r.avaliacao.violacoes_hard.some(
    (v) => v.startsWith("estrutural:") || v.startsWith("instancia:"),
  );
  if (quebrada) return avaliacao;
  if (opcoes.gravar) await opcoes.gravar(r.avaliacao).catch(() => undefined);
  return r.avaliacao;
}

/**
 * Grava a avaliação recalculada. Só a avaliação (dado derivado pelo motor,
 * nunca enviado pelo cliente) e sem subir a versão; se o cenário foi salvo
 * entre a leitura e aqui (outra versão), não grava. Chamar só para gestor.
 */
export async function gravarAvaliacaoRecalculada(
  cenarioId: string,
  versao: number,
  avaliacao: Avaliacao,
): Promise<void> {
  const { error } = await criarClienteServico()
    .from("cenarios")
    .update({ avaliacao, avaliado_em: new Date().toISOString() })
    .eq("id", cenarioId)
    .eq("versao", versao);
  if (error) throw new Error(error.message);
}
