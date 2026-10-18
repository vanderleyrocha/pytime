import type { Avaliacao, CustoRegra, Ocorrencia } from "@/lib/edicao/avaliacao";

/** Cores distintas das marcas, uma por regra (cicla se faltar). */
const PALETA = [
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
];

/**
 * A avaliação gravada não diz onde estão os custos: não existe (avaliação
 * do worker falhou) ou é anterior às ocorrências do motor. Pede recálculo.
 */
export function avaliacaoDesatualizada(avaliacao: Avaliacao | null): boolean {
  if (!avaliacao) return true;
  return avaliacao.custos.some((c) => c.ocorrencias === undefined);
}

/** "9 ocorrências (custo 72)"; dado antigo sem ocorrências: "custo 72". */
export function resumoCusto(custo: CustoRegra): string {
  if (!custo.ocorrencias) return `custo ${custo.custo}`;
  const n = custo.ocorrencias.length;
  return `${n} ${n === 1 ? "ocorrência" : "ocorrências"} (custo ${custo.custo})`;
}

export type RegraLegenda = {
  regra_id: string;
  tipo: string;
  rotulo: string;
  cor: string;
  custo: number;
  resumo: string;
  ocorrencias: Ocorrencia[];
};

/** Regras preferenciais com custo, cada uma com sua cor na legenda. */
export function legendaRegras(
  custos: CustoRegra[],
  rotulo: (tipo: string) => string,
): RegraLegenda[] {
  return custos
    .filter((c) => c.custo > 0)
    .map((c, i) => ({
      regra_id: c.regra_id,
      tipo: c.tipo,
      rotulo: rotulo(c.tipo),
      cor: PALETA[i % PALETA.length],
      custo: c.custo,
      resumo: resumoCusto(c),
      ocorrencias: c.ocorrencias ?? [],
    }));
}

/** Grade exibida: a de uma turma ou a de um professor. */
export type DonoGrade = { eixo: "turma" | "professor"; id: string };

/** Ocorrência identificada pela regra e pela posição na lista dela. */
export type RefOcorrencia = { regra_id: string; indice: number };

/** Chave de célula: `turma:<id>:<slot>` ou `professor:<id>:<slot>`. */
export function chaveCelula(dono: DonoGrade, slotId: string): string {
  return `${dono.eixo}:${dono.id}:${slotId}`;
}

/**
 * Marcas das grades exibidas: por célula, as ocorrências que a apontam; e
 * a lista das ocorrências com alguma célula nessas grades (as sem célula,
 * como dias de trabalho, ficam só na lista geral).
 */
export function marcasDaGrade(
  legenda: RegraLegenda[],
  donos: DonoGrade[],
): {
  porCelula: Record<string, RefOcorrencia[]>;
  visiveis: (RefOcorrencia & { ocorrencia: Ocorrencia })[];
} {
  const exibidos = new Set(donos.map((d) => `${d.eixo}:${d.id}`));
  const porCelula: Record<string, RefOcorrencia[]> = {};
  const visiveis: (RefOcorrencia & { ocorrencia: Ocorrencia })[] = [];
  for (const regra of legenda) {
    regra.ocorrencias.forEach((ocorrencia, indice) => {
      let visivel = false;
      for (const c of ocorrencia.celulas) {
        const dono: DonoGrade | null = c.turma_id
          ? { eixo: "turma", id: c.turma_id }
          : c.professor_id
            ? { eixo: "professor", id: c.professor_id }
            : null;
        if (!dono || !exibidos.has(`${dono.eixo}:${dono.id}`)) continue;
        visivel = true;
        (porCelula[chaveCelula(dono, c.slot_id)] ??= []).push({
          regra_id: regra.regra_id,
          indice,
        });
      }
      if (visivel)
        visiveis.push({ regra_id: regra.regra_id, indice, ocorrencia });
    });
  }
  return { porCelula, visiveis };
}
