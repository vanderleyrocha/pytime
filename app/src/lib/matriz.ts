export type PendenciaMatriz = {
  turma_id: string;
  turma_nome: string;
  esperado: number;
  atual: number;
};

/** Espelha Instancia.validar_matriz_cheia() do motor: carga total da turma
 *  deve igualar o nº de slots do turno dela. */
export function calcularPendencias(
  turmas: { id: string; nome: string; turno_id: string }[],
  slotsPorTurno: Record<string, number>,
  cargaPorTurma: Record<string, number>,
): PendenciaMatriz[] {
  return turmas
    .map((t) => ({
      turma_id: t.id,
      turma_nome: t.nome,
      esperado: slotsPorTurno[t.turno_id] ?? 0,
      atual: cargaPorTurma[t.id] ?? 0,
    }))
    .filter((p) => p.atual !== p.esperado);
}
