"use client";

import { useState } from "react";
import type { Ocorrencia } from "@/lib/edicao/avaliacao";
import {
  chaveCelula,
  type DonoGrade,
  type RefOcorrencia,
  type RegraLegenda,
} from "@/lib/pontos-atencao";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type Slot = { id: string; dia: number; ordem: number; turno_id: string };
type CelulaAula = { disciplina: string; extra: string };

export type GradeExibida = {
  chave: string;
  titulo?: string;
  dono: DonoGrade;
  slots: Slot[];
  celulas: Record<string, CelulaAula>;
};

export type PropsGradeMarcada = {
  grades: GradeExibida[];
  legenda: (Omit<RegraLegenda, "ocorrencias"> & { ocorrencias?: undefined })[];
  porCelula: Record<string, RefOcorrencia[]>;
  visiveis: (RefOcorrencia & { ocorrencia: Ocorrencia })[];
};

const mesma = (a: RefOcorrencia | null, b: RefOcorrencia) =>
  a !== null && a.regra_id === b.regra_id && a.indice === b.indice;

/**
 * Grade(s) da visão atual com as quebras de regras preferenciais: cada
 * regra tem uma cor; a célula ganha um marcador por regra que a aponta.
 * Passar o mouse (ou clicar, para fixar) num ponto de atenção destaca as
 * células dele; a legenda liga e desliga as marcas de cada regra.
 */
export function GradeMarcada({
  grades,
  legenda,
  porCelula,
  visiveis,
}: PropsGradeMarcada) {
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set());
  const [sobre, setSobre] = useState<RefOcorrencia | null>(null);
  const [fixo, setFixo] = useState<RefOcorrencia | null>(null);
  const destaque = sobre ?? fixo;

  const cor = Object.fromEntries(legenda.map((r) => [r.regra_id, r.cor]));
  const descricao = new Map(
    visiveis.map((v) => [`${v.regra_id}#${v.indice}`, v.ocorrencia.descricao]),
  );
  const ativas = (refs: RefOcorrencia[] | undefined) =>
    (refs ?? []).filter((r) => !ocultas.has(r.regra_id));
  const alternar = (regraId: string) =>
    setOcultas((atual) => {
      const nova = new Set(atual);
      if (nova.has(regraId)) nova.delete(regraId);
      else nova.add(regraId);
      return nova;
    });

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex flex-col gap-4">
        {grades.map((g) => (
          <div key={g.chave}>
            {g.titulo && <h2 className="mb-1 font-semibold">{g.titulo}</h2>}
            <TabelaMarcada
              grade={g}
              refsDaCelula={(slotId) =>
                ativas(porCelula[chaveCelula(g.dono, slotId)])
              }
              cor={cor}
              descricao={descricao}
              destaque={destaque}
            />
          </div>
        ))}
      </div>
      {legenda.length > 0 && (
        <aside className="flex w-full max-w-sm flex-col gap-3 text-sm">
          <h2 className="font-semibold">Pontos de atenção</h2>
          <ul className="flex flex-col gap-1">
            {legenda.map((r) => (
              <li key={r.regra_id}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!ocultas.has(r.regra_id)}
                    onChange={() => alternar(r.regra_id)}
                  />
                  <span
                    aria-hidden
                    className="inline-block size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: r.cor }}
                  />
                  <span>
                    {r.rotulo}{" "}
                    <span className="text-muted-foreground">({r.resumo})</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <h3 className="font-medium">Nesta grade</h3>
          {visiveis.filter((v) => !ocultas.has(v.regra_id)).length === 0 ? (
            <p className="text-muted-foreground">
              Nenhuma regra preferencial quebrada nesta grade.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {visiveis
                .filter((v) => !ocultas.has(v.regra_id))
                .map((v) => (
                  <li key={`${v.regra_id}#${v.indice}`}>
                    <button
                      type="button"
                      aria-pressed={mesma(fixo, v)}
                      className={`flex w-full items-start gap-2 rounded px-1 py-0.5 text-left hover:bg-muted ${
                        mesma(destaque, v) ? "bg-muted" : ""
                      }`}
                      onMouseEnter={() => setSobre(v)}
                      onMouseLeave={() => setSobre(null)}
                      onFocus={() => setSobre(v)}
                      onBlur={() => setSobre(null)}
                      onClick={() => setFixo(mesma(fixo, v) ? null : v)}
                    >
                      <span
                        aria-hidden
                        className="mt-1 inline-block size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cor[v.regra_id] }}
                      />
                      <span>
                        {v.ocorrencia.descricao}
                        {v.ocorrencia.unidades > 1 && (
                          <> (×{v.ocorrencia.unidades})</>
                        )}{" "}
                        <span className="text-muted-foreground">
                          custo {v.ocorrencia.custo}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </aside>
      )}
    </div>
  );
}

function TabelaMarcada({
  grade,
  refsDaCelula,
  cor,
  descricao,
  destaque,
}: {
  grade: GradeExibida;
  refsDaCelula: (slotId: string) => RefOcorrencia[];
  cor: Record<string, string>;
  descricao: Map<string, string>;
  destaque: RefOcorrencia | null;
}) {
  const { slots, celulas } = grade;
  const dias = [...new Set(slots.map((s) => s.dia))].sort((a, b) => a - b);
  const ordens = [...new Set(slots.map((s) => s.ordem))].sort((a, b) => a - b);
  return (
    <table className="border text-sm">
      <thead>
        <tr>
          <th className="border px-2 py-1"></th>
          {dias.map((d) => (
            <th key={d} className="border px-2 py-1">
              {DIAS[d]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ordens.map((o) => (
          <tr key={o}>
            <td className="border px-2 py-1 font-medium">{o + 1}º</td>
            {dias.map((d) => {
              const slot = slots.find((s) => s.dia === d && s.ordem === o);
              const cel = slot ? celulas[slot.id] : undefined;
              const refs = slot ? refsDaCelula(slot.id) : [];
              const regras = [...new Set(refs.map((r) => r.regra_id))];
              const realce = refs.find((r) => mesma(destaque, r));
              const dica = [
                ...new Set(
                  refs.map((r) => descricao.get(`${r.regra_id}#${r.indice}`)),
                ),
              ]
                .filter(Boolean)
                .join("\n");
              return (
                <td
                  key={d}
                  title={dica || undefined}
                  className="relative border px-3 py-2 text-center"
                  style={
                    realce
                      ? {
                          outline: `3px solid ${cor[realce.regra_id]}`,
                          outlineOffset: "-3px",
                        }
                      : undefined
                  }
                >
                  {regras.length > 0 && (
                    <span
                      aria-hidden
                      className="absolute top-0.5 left-0.5 flex gap-0.5"
                    >
                      {regras.map((id) => (
                        <span
                          key={id}
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: cor[id] }}
                        />
                      ))}
                    </span>
                  )}
                  {cel ? (
                    <>
                      <div className="font-medium">{cel.disciplina}</div>
                      <div className="text-xs text-muted-foreground">
                        {cel.extra}
                      </div>
                    </>
                  ) : regras.length > 0 ? (
                    <span
                      className="block rounded border border-dashed px-1 text-xs text-muted-foreground"
                      style={{ borderColor: cor[regras[0]] }}
                    >
                      vago
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
