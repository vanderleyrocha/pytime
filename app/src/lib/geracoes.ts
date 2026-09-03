/** Situações em que o worker ainda vai mexer na geração. */
const EM_ANDAMENTO = new Set(["pendente", "executando"]);

/** Indica se alguma geração ainda está na fila ou executando. */
export function haGeracaoEmAndamento(situacoes: string[]): boolean {
  return situacoes.some((s) => EM_ANDAMENTO.has(s));
}
