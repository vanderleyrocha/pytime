/** Célula marcada por uma ocorrência: na grade da turma OU do professor. */
export type CelulaOcorrencia = {
  slot_id: string;
  turma_id?: string | null;
  professor_id?: string | null;
};

/** Termo de custo soft violado (`pytime_engine.Ocorrencia`). */
export type Ocorrencia = {
  descricao: string;
  unidades: number;
  custo: number;
  celulas: CelulaOcorrencia[];
};

/**
 * Custo de uma regra preferencial. `ocorrencias` falta em avaliações
 * gravadas antes de o motor apontar onde cada custo aparece.
 */
export type CustoRegra = {
  regra_id: string;
  tipo: string;
  custo: number;
  detalhes: string[];
  ocorrencias?: Ocorrencia[];
};

/** Espelho TS de `pytime_engine.Avaliacao` (resposta do validador). */
export type Avaliacao = {
  violacoes_hard: string[];
  custos: CustoRegra[];
  custo_total: number;
  tempo_segundos: number;
};

export type DeltaCusto = {
  total: number;
  porRegra: { regra_id: string; tipo: string; delta: number }[];
};

/** Variação de custo da grade nova em relação à gravada (só regras que mudam). */
export function deltaCusto(
  base: Avaliacao | null,
  nova: Avaliacao,
): DeltaCusto {
  const antes = new Map((base?.custos ?? []).map((c) => [c.regra_id, c]));
  const depois = new Map(nova.custos.map((c) => [c.regra_id, c]));
  const ids = [...new Set([...antes.keys(), ...depois.keys()])].sort();
  const porRegra = ids
    .map((id) => ({
      regra_id: id,
      tipo: (depois.get(id) ?? antes.get(id))!.tipo,
      delta: (depois.get(id)?.custo ?? 0) - (antes.get(id)?.custo ?? 0),
    }))
    .filter((r) => r.delta !== 0);
  return { total: nova.custo_total - (base?.custo_total ?? 0), porRegra };
}

/**
 * Custo a exibir para um cenário: a avaliação exata quando existe; senão o
 * custo do resultado da geração, que superestima em soluções "viável".
 */
export function custoExibido(
  avaliacao: Avaliacao | null,
  resultado: { custo_total?: number } | null,
): { total: number; fonte: "avaliado" | "estimado" } | null {
  if (avaliacao) return { total: avaliacao.custo_total, fonte: "avaliado" };
  if (typeof resultado?.custo_total === "number") {
    return { total: resultado.custo_total, fonte: "estimado" };
  }
  return null;
}
