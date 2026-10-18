import "server-only";
import { z } from "zod";
import type { InstanciaMotor } from "@/lib/instancia";
import type { Avaliacao } from "@/lib/edicao/avaliacao";
import type { Aula } from "@/lib/edicao/trocas";

export type RespostaValidador =
  | { ok: true; avaliacao: Avaliacao }
  | { ok: false; erro: string };

const esquemaAvaliacao = z.object({
  violacoes_hard: z.array(z.string()),
  custos: z.array(
    z.object({
      regra_id: z.string(),
      tipo: z.string(),
      custo: z.number(),
      detalhes: z.array(z.string()),
    }),
  ),
  custo_total: z.number(),
  tempo_segundos: z.number(),
});

const INDISPONIVEL = "Validação indisponível no momento. Tente de novo.";

/**
 * Avalia a grade no validador do motor (`POST {VALIDADOR_URL}/avaliar`,
 * processo `validador` do worker no Fly). Só roda no servidor: o token
 * nunca chega ao navegador. Toda falha vira mensagem para o usuário.
 */
export async function avaliarNoValidador(
  instancia: InstanciaMotor,
  aulas: Aula[],
  opcoes: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<RespostaValidador> {
  const url = process.env.VALIDADOR_URL;
  const token = process.env.VALIDADOR_TOKEN;
  if (!url || !token) {
    return { ok: false, erro: "A validação não está configurada no servidor." };
  }
  const buscar = opcoes.fetch ?? fetch;
  let resposta: Response;
  try {
    resposta = await buscar(`${url.replace(/\/+$/, "")}/avaliar`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ instancia, grade: aulas }),
      signal: AbortSignal.timeout(opcoes.timeoutMs ?? 10_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, erro: INDISPONIVEL };
  }
  if (resposta.status === 401) {
    return { ok: false, erro: "Validador mal configurado (token recusado)." };
  }
  if (resposta.status === 400 || resposta.status === 422) {
    return {
      ok: false,
      erro: "O motor recusou os dados inválidos deste cenário.",
    };
  }
  if (!resposta.ok) return { ok: false, erro: INDISPONIVEL };
  const corpo = esquemaAvaliacao.safeParse(
    await resposta.json().catch(() => null),
  );
  if (!corpo.success) return { ok: false, erro: INDISPONIVEL };
  return { ok: true, avaliacao: corpo.data };
}
