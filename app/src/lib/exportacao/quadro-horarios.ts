/**
 * Exportação de um cenário no padrão `quadro_horarios` do escolajba
 * (docs/exportacao/README.md). Função pura: recebe as linhas do banco e
 * devolve as linhas da tabela de destino, ou os erros que impedem gerá-las.
 */

type ComCodigo = { id: string; nome: string; codigo_externo: string | null };

export type DadosExportacao = {
  aulas: { atribuicao_id: string; slot_id: string }[];
  atribuicoes: {
    id: string;
    professor_id: string;
    disciplina_id: string;
    turma_id: string;
  }[];
  slots: { id: string; turno_id: string; dia: number; ordem: number }[];
  turnos: ComCodigo[];
  professores: ComCodigo[];
  disciplinas: ComCodigo[];
  turmas: ComCodigo[];
};

const TEMPOS = [1, 2, 3, 4, 5, 6, 7] as const;
type Tempo = (typeof TEMPOS)[number];

export type LinhaQuadro = {
  servidor_id: number;
  disciplina_id: number;
  dia_semana: number;
  turno: number;
  ordem: null;
} & { [K in `t${Tempo}_id`]: number | null } & {
  [K in `t${Tempo}_status`]: "Aberto";
};

export const COLUNAS_QUADRO = [
  "servidor_id",
  "disciplina_id",
  "dia_semana",
  "turno",
  "ordem",
  ...TEMPOS.flatMap((i) => [`t${i}_id`, `t${i}_status`]),
] as const;

/** Código do turno no PyTime → turno do escolajba e tempos (por ordem). */
const TURNOS: Record<string, { turno: number; tempos: Tempo[] }> = {
  MANHA: { turno: 1, tempos: [1, 2, 3, 4] },
  TARDE: { turno: 2, tempos: [5, 6, 7] },
  NOITE: { turno: 3, tempos: [...TEMPOS] },
  INTEGRAL: { turno: 4, tempos: [...TEMPOS] },
};

const PREFIXOS = { professor: "SRV", disciplina: "DIS", turma: "TUR" } as const;
const ROTULO = { professor: "Professor", disciplina: "Disciplina", turma: "Turma" } as const;
const DIAS_ESCOLAJBA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function gerarQuadroHorarios(d: DadosExportacao): {
  linhas?: LinhaQuadro[];
  erros: string[];
  avisos: string[];
} {
  const erros = new Set<string>();
  const porId = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]));
  const atribuicoes = porId(d.atribuicoes);
  const slots = porId(d.slots);
  const turnos = porId(d.turnos);
  const entidades = {
    professor: porId(d.professores),
    disciplina: porId(d.disciplinas),
    turma: porId(d.turmas),
  };

  const idEscolajba = (tipo: keyof typeof PREFIXOS, id: string): number | null => {
    const reg = entidades[tipo].get(id);
    const m = reg?.codigo_externo?.match(new RegExp(`^${PREFIXOS[tipo]}-([1-9][0-9]*)$`));
    if (!m) {
      erros.add(
        `${ROTULO[tipo]} "${reg?.nome ?? id}" sem código do escolajba (${PREFIXOS[tipo]}-<id>).`,
      );
      return null;
    }
    return Number(m[1]);
  };

  const linhas = new Map<string, LinhaQuadro>();
  let orfas = 0;
  for (const aula of d.aulas) {
    const a = atribuicoes.get(aula.atribuicao_id);
    const s = slots.get(aula.slot_id);
    if (!a || !s) {
      orfas++;
      continue;
    }
    const tn = turnos.get(s.turno_id);
    const mapa = tn?.codigo_externo ? TURNOS[tn.codigo_externo] : undefined;
    if (!mapa) {
      erros.add(
        `Turno "${tn?.nome ?? s.turno_id}" sem código do escolajba (MANHA, TARDE, NOITE ou INTEGRAL).`,
      );
    }
    const tempo = mapa?.tempos[s.ordem];
    if (mapa && tempo === undefined) {
      const faixa = `T${mapa.tempos[0]}–T${mapa.tempos[mapa.tempos.length - 1]}`;
      erros.add(`Turno ${tn!.nome}: o horário de ordem ${s.ordem} não cabe nos tempos ${faixa}.`);
    }
    const servidor = idEscolajba("professor", a.professor_id);
    const disciplina = idEscolajba("disciplina", a.disciplina_id);
    const turma = idEscolajba("turma", a.turma_id);
    if (!mapa || tempo === undefined || servidor === null || disciplina === null || turma === null) {
      continue;
    }
    const diaSemana = (s.dia + 1) % 7;
    const chave = `${servidor}|${disciplina}|${diaSemana}|${mapa.turno}`;
    if (!linhas.has(chave)) {
      linhas.set(chave, {
        servidor_id: servidor,
        disciplina_id: disciplina,
        dia_semana: diaSemana,
        turno: mapa.turno,
        ordem: null,
        ...Object.fromEntries(
          TEMPOS.flatMap((i) => [
            [`t${i}_id`, null],
            [`t${i}_status`, "Aberto"],
          ]),
        ),
      } as LinhaQuadro);
    }
    linhas.get(chave)![`t${tempo}_id`] = turma;
  }
  if (orfas > 0) {
    erros.add(`A grade tem ${orfas} aula(s) sem atribuição ou horário correspondente.`);
  }
  if (erros.size > 0) return { erros: [...erros], avisos: [] };

  // conferência: o mesmo professor não pode ocupar o mesmo tempo duas vezes
  const avisos = new Set<string>();
  const ocupacao = new Map<string, number>();
  const nomeProfessor = new Map(
    d.professores.map((p) => [p.codigo_externo?.replace(/^SRV-/, ""), p.nome]),
  );
  const lista = [...linhas.values()].sort(
    (x, y) =>
      x.dia_semana - y.dia_semana ||
      x.turno - y.turno ||
      x.servidor_id - y.servidor_id ||
      x.disciplina_id - y.disciplina_id,
  );
  for (const l of lista) {
    for (const i of TEMPOS) {
      if (l[`t${i}_id`] === null) continue;
      const k = `${l.servidor_id}|${l.dia_semana}|${i}`;
      const turnoAnterior = ocupacao.get(k);
      if (turnoAnterior !== undefined) {
        const quem = nomeProfessor.get(String(l.servidor_id));
        const quando = `no tempo T${i} de ${DIAS_ESCOLAJBA[l.dia_semana]}`;
        if (turnoAnterior !== l.turno) avisos.add(`Professor ${quem}: dois turnos ${quando}.`);
        else erros.add(`Professor ${quem}: duas aulas ${quando}.`);
      }
      ocupacao.set(k, l.turno);
    }
  }
  if (erros.size > 0) return { erros: [...erros], avisos: [] };
  return { linhas: lista, erros: [], avisos: [...avisos] };
}

/** CSV no formato de docs/exportacao (separador ";", null = célula vazia). */
export function quadroParaCsv(linhas: LinhaQuadro[]): string {
  const corpo = linhas.map((l) =>
    COLUNAS_QUADRO.map((c) => {
      const v = l[c as keyof LinhaQuadro];
      return v === null ? "" : String(v);
    }).join(";"),
  );
  return [COLUNAS_QUADRO.join(";"), ...corpo].join("\n") + "\n";
}
