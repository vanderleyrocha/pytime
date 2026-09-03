export type StatusDisponibilidade =
  | "disponivel"
  | "indisponivel"
  | "prefere"
  | "evita";

const CICLO: StatusDisponibilidade[] = [
  "disponivel",
  "indisponivel",
  "prefere",
  "evita",
];

export function proximoStatus(
  atual: StatusDisponibilidade,
): StatusDisponibilidade {
  return CICLO[(CICLO.indexOf(atual) + 1) % CICLO.length];
}

export const ROTULO_STATUS: Record<StatusDisponibilidade, string> = {
  disponivel: "Disponível",
  indisponivel: "Indisponível",
  prefere: "Prefere",
  evita: "Evita",
};

export const COR_STATUS: Record<StatusDisponibilidade, string> = {
  disponivel: "bg-white",
  indisponivel: "bg-red-200",
  prefere: "bg-green-200",
  evita: "bg-amber-200",
};
