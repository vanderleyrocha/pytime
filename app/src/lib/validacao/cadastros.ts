import { z } from "zod";

const nomeObrigatorio = z.string().trim().min(1, "Informe o nome");

export const esquemaTurno = z.object({ nome: nomeObrigatorio });

export const esquemaTurma = z.object({
  nome: nomeObrigatorio,
  turno_id: z.uuid("Escolha o turno"),
});

export const esquemaDisciplina = z.object({ nome: nomeObrigatorio });

export const esquemaRecurso = z.object({
  nome: nomeObrigatorio,
  capacidade: z.coerce.number().int().min(1, "Capacidade mínima é 1"),
});

export const esquemaProfessor = z.object({ nome: nomeObrigatorio });

const horaValida = z.string().regex(/^\d{2}:\d{2}$/, "Hora no formato HH:MM");

export const esquemaGrade = z
  .object({
    dias: z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, "Escolha ao menos um dia")
      .refine((d) => new Set(d).size === d.length, "Dia repetido na grade"),
    horarios: z
      .array(z.object({ hora_inicio: horaValida, hora_fim: horaValida }))
      .min(1, "Adicione ao menos um horário")
      .max(12, "No máximo 12 horários por dia"),
  })
  .refine((g) => g.horarios.every((h) => h.hora_fim > h.hora_inicio), {
    message: "Hora final deve ser maior que a inicial",
  })
  .refine(
    (g) => {
      const ordenados = [...g.horarios].sort((a, b) =>
        a.hora_inicio.localeCompare(b.hora_inicio),
      );
      return ordenados.every(
        (h, i) => i === 0 || h.hora_inicio >= ordenados[i - 1].hora_fim,
      );
    },
    { message: "Horários não podem se sobrepor" },
  );

export const esquemaAtribuicao = z
  .object({
    professor_id: z.uuid("Escolha o professor"),
    disciplina_id: z.uuid("Escolha a disciplina"),
    turma_id: z.uuid("Escolha a turma"),
    carga_semanal: z.coerce.number().int().min(1, "Carga semanal mínima é 1"),
    geminadas: z.coerce
      .number()
      .int()
      .min(0, "Geminadas não pode ser negativo"),
    recurso_ids: z.array(z.uuid()).default([]),
  })
  // Mesma checagem da importação (`carga/validacao.ts`): cada par usa 2 aulas.
  .refine((a) => 2 * a.geminadas <= a.carga_semanal, {
    path: ["geminadas"],
    error: (issue) => {
      const a = issue.input as { carga_semanal: number };
      const maximo = Math.floor(a.carga_semanal / 2);
      return `Com ${a.carga_semanal} aula(s) semanais cabem no máximo ${maximo} ${maximo === 1 ? "par" : "pares"} geminado(s).`;
    },
  });
