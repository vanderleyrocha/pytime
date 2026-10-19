import { z } from "zod";
import { esquemaPacote, type PacoteCarga } from "@/lib/carga/pacote";

/** Códigos que já existem na unidade (`codigo_externo` não nulo). */
export type CodigosExistentes = {
  turnos: string[];
  turmas: string[];
  disciplinas: string[];
  professores: string[];
  recursos: string[];
  /** Horários já cadastrados como "TURNO|dia|ordem". */
  horarios: string[];
};

export type ResultadoValidacao = {
  /** Presente só quando não há erros (com os defaults aplicados). */
  pacote?: PacoteCarga;
  erros: string[];
  avisos: string[];
};

const chaveHorario = (turno: string, dia: number, ordem: number) =>
  `${turno}|${dia}|${ordem}`;
const rotuloHorario = (turno: string, dia: number, ordem: number) =>
  `${turno} dia ${dia} ordem ${ordem}`;

function caminho(path: PropertyKey[]): string {
  return path
    .map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`))
    .join("");
}

/**
 * Valida um pacote de carga (docs/carga/README.md, seção 5): formato
 * (zod), unicidade, referências por código — no pacote ou já cadastradas
 * na unidade — e coerências; depois calcula os avisos de viabilidade.
 */
export function validarPacote(
  bruto: unknown,
  existentes: CodigosExistentes,
): ResultadoValidacao {
  const r = esquemaPacote.safeParse(bruto, { error: z.locales.pt().localeError });
  if (!r.success) {
    return {
      erros: r.error.issues.map((i) =>
        i.path.length ? `${caminho(i.path)}: ${i.message}` : i.message,
      ),
      avisos: [],
    };
  }
  const p = r.data;
  const erros = [...unicidade(p), ...referencias(p, existentes), ...coerencia(p)];
  if (erros.length) return { erros, avisos: [] };
  return { pacote: p, erros: [], avisos: avisos(p, existentes) };
}

function repetidos<T>(itens: T[], chave: (x: T) => string): string[] {
  const vistos = new Set<string>();
  const rep = new Set<string>();
  for (const x of itens) {
    const k = chave(x);
    if (vistos.has(k)) rep.add(k);
    vistos.add(k);
  }
  return [...rep];
}

function unicidade(p: PacoteCarga): string[] {
  const erros: string[] = [];
  const entidades = ["turnos", "turmas", "disciplinas", "professores", "recursos", "regras"] as const;
  for (const e of entidades) {
    for (const c of repetidos(p[e] as { codigo: string }[], (x) => x.codigo)) {
      erros.push(`${e}: código "${c}" repetido.`);
    }
  }
  for (const k of repetidos(p.horarios, (h) => rotuloHorario(h.turno, h.dia, h.ordem))) {
    erros.push(`horarios: ${k} repetido.`);
  }
  for (const k of repetidos(
    p.disponibilidades,
    (d) => `${d.professor} em ${rotuloHorario(d.turno, d.dia, d.ordem)}`,
  )) {
    erros.push(`disponibilidades: ${k} repetida.`);
  }
  for (const k of repetidos(
    p.turmas_sem_aula,
    (t) => `${t.turma} em ${rotuloHorario(t.turno, t.dia, t.ordem)}`,
  )) {
    erros.push(`turmas_sem_aula: ${k} repetida.`);
  }
  for (const k of repetidos(
    p.disponibilidades_disciplina,
    (d) => `${d.disciplina} em ${rotuloHorario(d.turno, d.dia, d.ordem)}`,
  )) {
    erros.push(`disponibilidades_disciplina: ${k} repetida.`);
  }
  for (const k of repetidos(p.atribuicoes, (a) => `${a.professor}/${a.disciplina}/${a.turma}`)) {
    erros.push(`atribuicoes: ${k} repetida.`);
  }
  return erros;
}

function referencias(p: PacoteCarga, ex: CodigosExistentes): string[] {
  const conj = (lista: { codigo: string }[], extras: string[]) =>
    new Set([...lista.map((x) => x.codigo), ...extras]);
  const turnos = conj(p.turnos, ex.turnos);
  const turmas = conj(p.turmas, ex.turmas);
  const disciplinas = conj(p.disciplinas, ex.disciplinas);
  const professores = conj(p.professores, ex.professores);
  const recursos = conj(p.recursos, ex.recursos);
  const horarios = new Set([
    ...p.horarios.map((h) => chaveHorario(h.turno, h.dia, h.ordem)),
    ...ex.horarios,
  ]);

  const erros: string[] = [];
  const exigir = (
    conjunto: Set<string>,
    valor: string,
    onde: string,
    rotulo: string,
    feminino = false,
  ) => {
    if (!conjunto.has(valor)) {
      erros.push(`${onde}: ${rotulo} "${valor}" não ${feminino ? "encontrada" : "encontrado"}.`);
    }
  };

  p.horarios.forEach((h, i) => exigir(turnos, h.turno, `horarios[${i}].turno`, "turno"));
  p.turmas.forEach((t, i) => exigir(turnos, t.turno, `turmas[${i}].turno`, "turno"));
  p.disponibilidades.forEach((d, i) => {
    exigir(professores, d.professor, `disponibilidades[${i}].professor`, "professor");
    if (!horarios.has(chaveHorario(d.turno, d.dia, d.ordem))) {
      erros.push(
        `disponibilidades[${i}]: horário ${rotuloHorario(d.turno, d.dia, d.ordem)} não encontrado.`,
      );
    }
  });
  // turno da turma só é conhecido para as turmas do pacote
  const turnoDaTurma = new Map(p.turmas.map((t) => [t.codigo, t.turno]));
  p.turmas_sem_aula.forEach((t, i) => {
    exigir(turmas, t.turma, `turmas_sem_aula[${i}].turma`, "turma", true);
    const turno = turnoDaTurma.get(t.turma);
    if (!horarios.has(chaveHorario(t.turno, t.dia, t.ordem))) {
      erros.push(
        `turmas_sem_aula[${i}]: horário ${rotuloHorario(t.turno, t.dia, t.ordem)} não encontrado.`,
      );
    } else if (turno !== undefined && turno !== t.turno) {
      erros.push(
        `turmas_sem_aula[${i}]: horário ${rotuloHorario(t.turno, t.dia, t.ordem)} não é do turno da turma.`,
      );
    }
  });
  p.disponibilidades_disciplina.forEach((d, i) => {
    exigir(
      disciplinas,
      d.disciplina,
      `disponibilidades_disciplina[${i}].disciplina`,
      "disciplina",
      true,
    );
    if (!horarios.has(chaveHorario(d.turno, d.dia, d.ordem))) {
      erros.push(
        `disponibilidades_disciplina[${i}]: horário ${rotuloHorario(d.turno, d.dia, d.ordem)} não encontrado.`,
      );
    }
  });
  p.atribuicoes.forEach((a, i) => {
    exigir(professores, a.professor, `atribuicoes[${i}].professor`, "professor");
    exigir(disciplinas, a.disciplina, `atribuicoes[${i}].disciplina`, "disciplina", true);
    exigir(turmas, a.turma, `atribuicoes[${i}].turma`, "turma", true);
    a.recursos.forEach((c) => exigir(recursos, c, `atribuicoes[${i}].recursos`, "recurso"));
  });
  p.regras.forEach((r, i) => {
    const params = r.parametros as Record<string, unknown>;
    for (const campo of ["disciplina", "disciplina_a", "disciplina_b"]) {
      if (typeof params[campo] === "string") {
        exigir(
          disciplinas,
          params[campo] as string,
          `regras[${i}].parametros.${campo}`,
          "disciplina",
          true,
        );
      }
    }
  });
  return erros;
}

function coerencia(p: PacoteCarga): string[] {
  const erros: string[] = [];
  p.horarios.forEach((h, i) => {
    if (h.hora_inicio && h.hora_fim && h.hora_fim <= h.hora_inicio) {
      erros.push(`horarios[${i}]: hora_fim deve ser depois de hora_inicio.`);
    }
  });
  p.atribuicoes.forEach((a, i) => {
    if (2 * a.geminadas > a.carga_semanal) {
      erros.push(
        `atribuicoes[${i}]: ${a.geminadas} pares geminados não cabem em ${a.carga_semanal} aulas semanais.`,
      );
    }
  });
  p.regras.forEach((r, i) => {
    if (
      r.tipo === "nao_mesmo_dia" &&
      r.parametros.disciplina_a === r.parametros.disciplina_b
    ) {
      erros.push(`regras[${i}]: escolha disciplinas diferentes.`);
    }
  });
  return erros;
}

function avisos(p: PacoteCarga, ex: CodigosExistentes): string[] {
  const avisos: string[] = [];
  // horários por turno: os do pacote mais os já cadastrados
  const horariosPorTurno = new Map<string, Set<string>>();
  const adicionar = (turno: string, chave: string) => {
    if (!horariosPorTurno.has(turno)) horariosPorTurno.set(turno, new Set());
    horariosPorTurno.get(turno)!.add(chave);
  };
  p.horarios.forEach((h) => adicionar(h.turno, chaveHorario(h.turno, h.dia, h.ordem)));
  ex.horarios.forEach((k) => adicionar(k.split("|")[0], k));
  const nHorarios = (turno: string) => horariosPorTurno.get(turno)?.size ?? 0;
  const turnoDaTurma = new Map(p.turmas.map((t) => [t.codigo, t.turno]));

  for (const t of p.turmas) {
    const carga = p.atribuicoes
      .filter((a) => a.turma === t.codigo)
      .reduce((s, a) => s + a.carga_semanal, 0);
    const doTurno = nHorarios(t.turno);
    const comAula =
      doTurno -
      new Set(
        p.turmas_sem_aula
          .filter((x) => x.turma === t.codigo)
          .map((x) => chaveHorario(x.turno, x.dia, x.ordem)),
      ).size;
    if (carga === 0) {
      avisos.push(`Turma ${t.nome}: nenhuma atribuição.`);
    } else if (carga !== comAula) {
      avisos.push(
        comAula === doTurno
          ? `Turma ${t.nome}: carga total ${carga} difere do número de horários do turno (${doTurno}).`
          : `Turma ${t.nome}: carga total ${carga} difere do número de horários com aula da turma (${comAula} de ${doTurno} do turno).`,
      );
    }
  }

  for (const prof of p.professores) {
    const dele = p.atribuicoes.filter((a) => a.professor === prof.codigo);
    const carga = dele.reduce((s, a) => s + a.carga_semanal, 0);
    const turnos = new Set(
      dele.map((a) => turnoDaTurma.get(a.turma)).filter((t): t is string => !!t),
    );
    // turmas só já cadastradas (fora do pacote) não dizem o turno: sem aviso
    if (carga === 0 || turnos.size === 0) continue;
    const indisponiveis = new Set(
      p.disponibilidades
        .filter((d) => d.professor === prof.codigo && d.status === "indisponivel")
        .map((d) => chaveHorario(d.turno, d.dia, d.ordem)),
    );
    let disponiveis = 0;
    for (const t of turnos) {
      for (const k of horariosPorTurno.get(t) ?? []) {
        if (!indisponiveis.has(k)) disponiveis++;
      }
    }
    if (carga > disponiveis) {
      avisos.push(
        `Professor ${prof.nome}: ${carga} aulas semanais para ${disponiveis} horários disponíveis.`,
      );
    }
  }

  for (const rec of p.recursos) {
    const usam = p.atribuicoes.filter((a) => a.recursos.includes(rec.codigo));
    const aulas = usam.reduce((s, a) => s + a.carga_semanal, 0);
    const turnos = new Set(
      usam.map((a) => turnoDaTurma.get(a.turma)).filter((t): t is string => !!t),
    );
    const horarios = [...turnos].reduce((s, t) => s + nHorarios(t), 0);
    if (aulas > rec.capacidade * horarios) {
      avisos.push(
        `Recurso ${rec.nome}: ${aulas} aulas semanais para capacidade ${rec.capacidade} em ${horarios} horários.`,
      );
    }
  }
  return avisos;
}
