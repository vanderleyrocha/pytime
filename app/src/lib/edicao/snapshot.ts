import { createHash } from "node:crypto";
import type { InstanciaMotor } from "@/lib/instancia";

/** JSON com chaves ordenadas e listas ordenadas (a ordem não tem significado). */
function canonico(valor: unknown): string {
  if (Array.isArray(valor)) {
    return `[${valor.map(canonico).sort().join(",")}]`;
  }
  if (valor && typeof valor === "object") {
    const pares = Object.entries(valor)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonico(v)}`);
    return `{${pares.join(",")}}`;
  }
  return JSON.stringify(valor);
}

/**
 * Impressão digital estável da instância: igual ⇔ mesmos dados de entrada
 * para o motor (ignora a ordem das listas e o budget da geração). Compara o
 * snapshot de uma geração com a instância montada hoje a partir do banco.
 */
export function impressaoInstancia(instancia: InstanciaMotor): string {
  const dados: Partial<InstanciaMotor> = { ...instancia };
  delete dados.budget_segundos;
  return createHash("sha256").update(canonico(dados)).digest("hex");
}
