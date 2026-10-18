import {
  novoRascunho,
  trocar,
  type Aula,
  type Rascunho,
  type Troca,
} from "./trocas";

export type Direcao = "cima" | "baixo" | "esquerda" | "direita";

/**
 * Horário vizinho na grade (linhas = ordem do horário, colunas = dia), para
 * navegar pelo teclado. Na borda, fica no mesmo horário.
 */
export function vizinho(
  slots: { id: string; dia: number; ordem: number }[],
  atual: string,
  direcao: Direcao,
): string {
  const s = slots.find((x) => x.id === atual);
  if (!s) return atual;
  const dias = [...new Set(slots.map((x) => x.dia))].sort((a, b) => a - b);
  const ordens = [...new Set(slots.map((x) => x.ordem))].sort((a, b) => a - b);
  let dia = dias.indexOf(s.dia);
  let ordem = ordens.indexOf(s.ordem);
  if (direcao === "cima") ordem = Math.max(0, ordem - 1);
  if (direcao === "baixo") ordem = Math.min(ordens.length - 1, ordem + 1);
  if (direcao === "esquerda") dia = Math.max(0, dia - 1);
  if (direcao === "direita") dia = Math.min(dias.length - 1, dia + 1);
  const alvo = slots.find(
    (x) => x.dia === dias[dia] && x.ordem === ordens[ordem],
  );
  return alvo?.id ?? atual;
}

/**
 * Depois de um conflito de versão: reaplica as trocas do rascunho sobre a
 * grade que outra pessoa salvou. Troca que não cabe mais é descartada.
 */
export function reaplicarTrocas(
  base: Aula[],
  feitas: Troca[],
  turmaDaAtribuicao: Record<string, string>,
): { rascunho: Rascunho; descartadas: Troca[] } {
  let rascunho = novoRascunho(base);
  const descartadas: Troca[] = [];
  for (const t of feitas) {
    try {
      rascunho = trocar(rascunho, t, turmaDaAtribuicao);
    } catch {
      descartadas.push(t);
    }
  }
  return { rascunho, descartadas };
}
