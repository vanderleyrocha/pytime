export type StatusDisponibilidade =
  | "disponivel"
  | "indisponivel"
  | "prefere"
  | "evita";

/** Professor e disciplina: os quatro status. */
export const CICLO_COMPLETO: StatusDisponibilidade[] = [
  "disponivel",
  "indisponivel",
  "prefere",
  "evita",
];

/** Turma: só tem aula / sem aula (o motor rejeita prefere/evita). */
export const CICLO_TURMA: StatusDisponibilidade[] = [
  "disponivel",
  "indisponivel",
];

export function proximoStatus(
  atual: StatusDisponibilidade,
  ciclo: StatusDisponibilidade[] = CICLO_COMPLETO,
): StatusDisponibilidade {
  return ciclo[(ciclo.indexOf(atual) + 1) % ciclo.length];
}

export const ROTULO_STATUS: Record<StatusDisponibilidade, string> = {
  disponivel: "Disponível",
  indisponivel: "Indisponível",
  prefere: "Prefere",
  evita: "Evita",
};

export const ROTULO_TURMA: Record<StatusDisponibilidade, string> = {
  ...ROTULO_STATUS,
  disponivel: "Tem aula",
  indisponivel: "Sem aula",
};

export const COR_STATUS: Record<StatusDisponibilidade, string> = {
  disponivel: "bg-white",
  indisponivel: "bg-red-200",
  prefere: "bg-green-200",
  evita: "bg-amber-200",
};

export const COR_TURMA: Record<StatusDisponibilidade, string> = {
  ...COR_STATUS,
  indisponivel: "bg-gray-300",
};
