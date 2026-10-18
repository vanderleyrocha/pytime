import { pacoteDeCsv } from "@/lib/carga/csv";
import type { PacoteCarga } from "@/lib/carga/pacote";
import type { CodigosExistentes } from "@/lib/carga/validacao";

export type ArquivoEnviado = { nome: string; texto: string };

/**
 * Converte os arquivos enviados em pacote bruto: um único `.json` ou o
 * conjunto de `.csv` do pacote (docs/carga/README.md, seção 2).
 */
export function lerArquivosCarga(arquivos: ArquivoEnviado[]): {
  bruto: Record<string, unknown>;
  erros: string[];
} {
  if (arquivos.length === 0) {
    return { bruto: {}, erros: ["Escolha o arquivo do pacote."] };
  }
  const jsons = arquivos.filter((a) => a.nome.toLowerCase().endsWith(".json"));
  if (jsons.length > 0) {
    if (jsons.length > 1 || arquivos.length > 1) {
      return {
        bruto: {},
        erros: ["Envie um único arquivo .json ou os arquivos .csv do pacote."],
      };
    }
    try {
      return { bruto: JSON.parse(jsons[0].texto.replace(/^﻿/, "")), erros: [] };
    } catch {
      return { bruto: {}, erros: [`O arquivo "${jsons[0].nome}" não é um JSON válido.`] };
    }
  }
  return pacoteDeCsv(Object.fromEntries(arquivos.map((a) => [a.nome, a.texto])));
}

type ComCodigo = { codigo_externo: string | null };

/** Códigos já cadastrados na unidade, a partir das linhas do banco. */
export function codigosExistentes(linhas: {
  turnos: (ComCodigo & { id: string })[];
  turmas: ComCodigo[];
  disciplinas: ComCodigo[];
  professores: ComCodigo[];
  recursos: ComCodigo[];
  slots: { turno_id: string; dia: number; ordem: number }[];
}): CodigosExistentes {
  const codigos = (l: ComCodigo[]) =>
    l.map((x) => x.codigo_externo).filter((c): c is string => !!c);
  const codigoDoTurno = new Map(linhas.turnos.map((t) => [t.id, t.codigo_externo]));
  return {
    turnos: codigos(linhas.turnos),
    turmas: codigos(linhas.turmas),
    disciplinas: codigos(linhas.disciplinas),
    professores: codigos(linhas.professores),
    recursos: codigos(linhas.recursos),
    horarios: linhas.slots
      .filter((s) => codigoDoTurno.get(s.turno_id))
      .map((s) => `${codigoDoTurno.get(s.turno_id)}|${s.dia}|${s.ordem}`),
  };
}

export const SECOES_PACOTE = [
  "turnos",
  "horarios",
  "turmas",
  "disciplinas",
  "professores",
  "recursos",
  "disponibilidades",
  "atribuicoes",
  "regras",
] as const;

export type ResumoPacote = Record<(typeof SECOES_PACOTE)[number], number>;

/** Quantidade de itens por seção do pacote. */
export function resumirPacote(p: PacoteCarga): ResumoPacote {
  return Object.fromEntries(SECOES_PACOTE.map((s) => [s, p[s].length])) as ResumoPacote;
}
