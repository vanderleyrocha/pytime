import { z } from "zod";

/**
 * Espelho zod de docs/carga/pacote-carga.schema.json (contrato vinculante).
 * Referências entre entidades usam `codigo`, nunca UUID.
 */

const codigo = z
  .string()
  .regex(
    /^[A-Za-z0-9._-]{1,64}$/,
    "código deve ter de 1 a 64 caracteres entre letras sem acento, dígitos, '.', '_' ou '-'",
  );
const nome = z.string().trim().min(1, "informe o nome").max(200);
const dia = z.number().int().min(0).max(6);
const ordem = z.number().int().min(0);
const hora = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "use HH:MM");

const semParametros = z.strictObject({}).default({});

const regraBase = {
  codigo,
  peso: z.number().int().min(1).default(1),
  ativa: z.boolean().default(true),
};

/** Regra sem parâmetros cujo modo hard/soft é fixo pelo catálogo. */
function regraFixa<T extends string>(tipo: T, hard: boolean) {
  return z.strictObject({
    ...regraBase,
    tipo: z.literal(tipo),
    hard: z.literal(
      hard,
      hard
        ? "esta regra é sempre obrigatória (hard = true)"
        : "esta regra é sempre preferencial (hard = false)",
    ),
    parametros: semParametros,
  });
}

const regra = z.discriminatedUnion("tipo", [
  regraFixa("disponibilidade_professor", true),
  regraFixa("geminadas", true),
  regraFixa("recurso_compartilhado", true),
  regraFixa("janelas_professor", false),
  regraFixa("preferencia_professor", false),
  regraFixa("compactacao_dias", false),
  z.strictObject({
    ...regraBase,
    tipo: z.literal("distribuicao_disciplina"),
    hard: z.literal(false, "esta regra é sempre preferencial (hard = false)"),
    parametros: z.strictObject({ max_por_dia: z.number().int().min(1) }),
  }),
  z.strictObject({
    ...regraBase,
    tipo: z.literal("preferencia_disciplina"),
    hard: z.literal(false, "esta regra é sempre preferencial (hard = false)"),
    parametros: z.strictObject({
      disciplina: codigo,
      ordens: z.array(ordem).min(1),
      modo: z.enum(["evita", "prefere"]),
    }),
  }),
  z.strictObject({
    ...regraBase,
    tipo: z.literal("ultimo_horario"),
    hard: z.boolean(),
    parametros: z.strictObject({ disciplina: codigo }),
  }),
  z.strictObject({
    ...regraBase,
    tipo: z.literal("nao_mesmo_dia"),
    hard: z.boolean(),
    parametros: z.strictObject({ disciplina_a: codigo, disciplina_b: codigo }),
  }),
]);

export const esquemaPacote = z.strictObject({
  versao: z.literal("1.0", "versão do pacote deve ser \"1.0\""),
  origem: z.strictObject({
    sistema: z.string().min(1),
    escola_inep: z.string().regex(/^[0-9]{8}$/, "código INEP tem 8 dígitos").optional(),
    escola_nome: z.string().optional(),
    ano_letivo: z.number().int().min(2000).max(2100).optional(),
    gerado_em: z.iso.datetime({ offset: true }),
  }),
  turnos: z.array(z.strictObject({ codigo, nome })),
  horarios: z.array(
    z.strictObject({
      turno: codigo,
      dia,
      ordem,
      hora_inicio: hora.optional(),
      hora_fim: hora.optional(),
    }),
  ),
  turmas: z.array(z.strictObject({ codigo, nome, turno: codigo })),
  disciplinas: z.array(z.strictObject({ codigo, nome })),
  professores: z.array(z.strictObject({ codigo, nome })),
  recursos: z
    .array(
      z.strictObject({
        codigo,
        nome,
        capacidade: z.number().int().min(1).default(1),
      }),
    )
    .default([]),
  disponibilidades: z
    .array(
      z.strictObject({
        professor: codigo,
        turno: codigo,
        dia,
        ordem,
        status: z.enum(["disponivel", "indisponivel", "prefere", "evita"]),
      }),
    )
    .default([]),
  atribuicoes: z.array(
    z.strictObject({
      professor: codigo,
      disciplina: codigo,
      turma: codigo,
      carga_semanal: z.number().int().min(1),
      geminadas: z.number().int().min(0).default(0),
      recursos: z.array(codigo).default([]),
    }),
  ),
  regras: z.array(regra).default([]),
});

export type PacoteCarga = z.infer<typeof esquemaPacote>;
