import { z } from "zod";

export type ModoHard = "fixa_hard" | "fixa_soft" | "alternavel";

export type TipoRegra =
  | "disponibilidade_professor"
  | "geminadas"
  | "recurso_compartilhado"
  | "janelas_professor"
  | "distribuicao_disciplina"
  | "preferencia_professor"
  | "preferencia_disciplina"
  | "compactacao_dias"
  | "ultimo_horario"
  | "nao_mesmo_dia";

export const CATALOGO_REGRAS: Record<
  TipoRegra,
  { rotulo: string; descricao: string; modo: ModoHard; temParametros: boolean }
> = {
  disponibilidade_professor: {
    rotulo: "Disponibilidade do professor",
    descricao: "Nunca alocar professor em slot marcado como indisponível.",
    modo: "fixa_hard",
    temParametros: false,
  },
  geminadas: {
    rotulo: "Aulas geminadas",
    descricao:
      "Exige os pares de aulas consecutivas definidos nas atribuições.",
    modo: "fixa_hard",
    temParametros: false,
  },
  recurso_compartilhado: {
    rotulo: "Recursos compartilhados",
    descricao: "Laboratórios/quadras não excedem a capacidade por slot.",
    modo: "fixa_hard",
    temParametros: false,
  },
  janelas_professor: {
    rotulo: "Janelas do professor",
    descricao: "Minimiza buracos entre a primeira e a última aula do dia.",
    modo: "fixa_soft",
    temParametros: false,
  },
  distribuicao_disciplina: {
    rotulo: "Distribuição da disciplina",
    descricao: "Limita aulas por dia e espalha a disciplina pela semana.",
    modo: "fixa_soft",
    temParametros: true,
  },
  preferencia_professor: {
    rotulo: "Preferências do professor",
    descricao: "Penaliza aulas em slots 'evita' e fora dos 'prefere'.",
    modo: "fixa_soft",
    temParametros: false,
  },
  preferencia_disciplina: {
    rotulo: "Preferência de horário da disciplina",
    descricao:
      "Disciplina prefere/evita posições do dia (ex.: pesadas cedo).",
    modo: "fixa_soft",
    temParametros: true,
  },
  compactacao_dias: {
    rotulo: "Compactação de dias",
    descricao: "Concentra as aulas do professor em menos dias.",
    modo: "fixa_soft",
    temParametros: false,
  },
  ultimo_horario: {
    rotulo: "Não no último horário",
    descricao: "Disciplina não cai no último horário do dia.",
    modo: "alternavel",
    temParametros: true,
  },
  nao_mesmo_dia: {
    rotulo: "Não no mesmo dia",
    descricao: "Duas disciplinas não caem no mesmo dia da mesma turma.",
    modo: "alternavel",
    temParametros: true,
  },
};

export function hardPadrao(tipo: TipoRegra): boolean {
  return CATALOGO_REGRAS[tipo].modo !== "fixa_soft";
}

const semParametros = <T extends TipoRegra>(tipo: T) =>
  z.object({ tipo: z.literal(tipo) });

export const esquemaParametros = z
  .discriminatedUnion("tipo", [
    semParametros("disponibilidade_professor"),
    semParametros("geminadas"),
    semParametros("recurso_compartilhado"),
    semParametros("janelas_professor"),
    semParametros("preferencia_professor"),
    semParametros("compactacao_dias"),
    z.object({
      tipo: z.literal("distribuicao_disciplina"),
      max_por_dia: z.coerce
        .number()
        .int()
        .min(1, "Máximo por dia deve ser ao menos 1"),
    }),
    z.object({
      tipo: z.literal("preferencia_disciplina"),
      disciplina_id: z.uuid("Escolha a disciplina"),
      ordens: z
        .array(z.coerce.number().int().min(0))
        .min(1, "Escolha ao menos uma posição do dia"),
      modo: z.enum(["evita", "prefere"]),
    }),
    z.object({
      tipo: z.literal("ultimo_horario"),
      disciplina_id: z.uuid("Escolha a disciplina"),
    }),
    z.object({
      tipo: z.literal("nao_mesmo_dia"),
      disciplina_a: z.uuid("Escolha a primeira disciplina"),
      disciplina_b: z.uuid("Escolha a segunda disciplina"),
    }),
  ])
  .superRefine((p, ctx) => {
    // refine dentro de membro quebra a detecção do discriminador em algumas
    // versões do zod — a validação cruzada vive na união.
    if (p.tipo === "nao_mesmo_dia" && p.disciplina_a === p.disciplina_b) {
      ctx.addIssue({
        code: "custom",
        message: "Escolha disciplinas diferentes",
      });
    }
  });
