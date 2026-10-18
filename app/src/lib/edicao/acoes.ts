import { z } from "zod";

/** Grade enviada pelo editor (validada no servidor antes de qualquer uso). */
export const esquemaAulas = z
  .array(z.object({ atribuicao_id: z.guid(), slot_id: z.guid() }))
  .min(1, "Grade vazia.")
  .refine(
    (aulas) =>
      new Set(aulas.map((a) => `${a.atribuicao_id}@${a.slot_id}`)).size ===
      aulas.length,
    "A mesma aula aparece duas vezes no mesmo horário.",
  );

export const esquemaNome = z
  .string()
  .trim()
  .min(1, "Informe um nome.")
  .max(80, "Nome com no máximo 80 caracteres.");

export const MENSAGEM_CONFLITO =
  "Outra pessoa salvou este cenário. Recarregue a página; seu rascunho continua aqui.";

/** Erro das RPCs de cenário (mensagem do Postgres) → texto para o usuário. */
export function mapearErroRpc(mensagem: string): string {
  if (mensagem.includes("conflito_versao")) return MENSAGEM_CONFLITO;
  if (mensagem.includes("Apenas gestores"))
    return "Apenas gestores editam cenários.";
  if (mensagem.includes("não corresponde")) {
    return "A grade enviada não corresponde ao cenário. Recarregue a página.";
  }
  if (mensagem.includes("não encontrado")) return "Cenário não encontrado.";
  return "Não foi possível salvar. Tente de novo.";
}

export type Excecao = {
  motivo: string;
  forcado_por: string;
  forcado_em: string;
};

/** Violações aceitas com "forçar", com quem e quando (gravadas no cenário). */
export function montarExcecoes(
  violacoes: string[],
  usuario: string,
  agora: string,
): Excecao[] {
  return violacoes.map((motivo) => ({
    motivo,
    forcado_por: usuario,
    forcado_em: agora,
  }));
}
