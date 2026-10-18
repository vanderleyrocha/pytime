/** Uma aula alocada: a atribuição ocupa o horário (slot). */
export type Aula = { atribuicao_id: string; slot_id: string };

/** Troca o conteúdo de dois horários de uma turma. */
export type Troca = { slotA: string; slotB: string; turmaId: string };

/** Grade em edição no cliente, com as pilhas de desfazer/refazer. */
export type Rascunho = { aulas: Aula[]; feitas: Troca[]; desfeitas: Troca[] };

/**
 * Troca as aulas de dois horários da mesma turma (a matriz continua cheia:
 * nenhum horário fica vazio nem duplicado). Não muta a entrada.
 */
export function aplicarTroca(
  aulas: Aula[],
  troca: Troca,
  turmaDaAtribuicao: Record<string, string>,
): Aula[] {
  if (troca.slotA === troca.slotB) {
    throw new Error("Escolha dois horários diferentes para trocar.");
  }
  const daTurma = (a: Aula, slot: string) =>
    a.slot_id === slot && turmaDaAtribuicao[a.atribuicao_id] === troca.turmaId;
  const a = aulas.findIndex((x) => daTurma(x, troca.slotA));
  const b = aulas.findIndex((x) => daTurma(x, troca.slotB));
  if (a < 0 || b < 0) {
    throw new Error("Os dois horários precisam ser da mesma turma.");
  }
  return aulas.map((x, i) =>
    i === a
      ? { ...x, slot_id: troca.slotB }
      : i === b
        ? { ...x, slot_id: troca.slotA }
        : x,
  );
}

export function novoRascunho(aulas: Aula[]): Rascunho {
  return { aulas, feitas: [], desfeitas: [] };
}

export function trocar(
  r: Rascunho,
  troca: Troca,
  turmaDaAtribuicao: Record<string, string>,
): Rascunho {
  return {
    aulas: aplicarTroca(r.aulas, troca, turmaDaAtribuicao),
    feitas: [...r.feitas, troca],
    desfeitas: [],
  };
}

/** Desfaz a última troca (uma troca aplicada de novo volta ao estado anterior). */
export function desfazer(
  r: Rascunho,
  turmaDaAtribuicao: Record<string, string>,
): Rascunho {
  const ultima = r.feitas.at(-1);
  if (!ultima) return r;
  return {
    aulas: aplicarTroca(r.aulas, ultima, turmaDaAtribuicao),
    feitas: r.feitas.slice(0, -1),
    desfeitas: [...r.desfeitas, ultima],
  };
}

export function refazer(
  r: Rascunho,
  turmaDaAtribuicao: Record<string, string>,
): Rascunho {
  const proxima = r.desfeitas.at(-1);
  if (!proxima) return r;
  return {
    aulas: aplicarTroca(r.aulas, proxima, turmaDaAtribuicao),
    feitas: [...r.feitas, proxima],
    desfeitas: r.desfeitas.slice(0, -1),
  };
}

const chave = (aulas: Aula[]) =>
  aulas
    .map((a) => `${a.atribuicao_id}@${a.slot_id}`)
    .sort()
    .join("|");

/** O rascunho difere da grade gravada (ignora a ordem das aulas)? */
export function alterado(r: Rascunho, base: Aula[]): boolean {
  return chave(r.aulas) !== chave(base);
}
