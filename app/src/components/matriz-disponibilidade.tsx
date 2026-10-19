"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CICLO_COMPLETO,
  CICLO_TURMA,
  COR_STATUS,
  COR_TURMA,
  ROTULO_STATUS,
  ROTULO_TURMA,
  proximoStatus,
  type StatusDisponibilidade,
} from "@/lib/disponibilidade";
import type { EstadoCadastro } from "@/lib/cadastros";
import { Button } from "@/components/ui/button";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export type SlotMatriz = {
  id: string;
  dia: number;
  ordem: number;
  turno_nome: string;
};

export type Marcacao = { slot_id: string; status: StatusDisponibilidade };

/** "completa" (professor, disciplina): disponível/indisponível/prefere/evita.
 *  "turma": tem aula/sem aula. */
type Variante = "completa" | "turma";

const VARIANTES: Record<
  Variante,
  {
    ciclo: StatusDisponibilidade[];
    rotulos: Record<StatusDisponibilidade, string>;
    cores: Record<StatusDisponibilidade, string>;
    ajuda: string;
  }
> = {
  completa: {
    ciclo: CICLO_COMPLETO,
    rotulos: ROTULO_STATUS,
    cores: COR_STATUS,
    ajuda:
      "Clique cicla Disponível → Indisponível → Prefere → Evita; arraste para pintar vários slots.",
  },
  turma: {
    ciclo: CICLO_TURMA,
    rotulos: ROTULO_TURMA,
    cores: COR_TURMA,
    ajuda:
      "Clique alterna Tem aula ↔ Sem aula; arraste para pintar vários horários.",
  },
};

export function MatrizDisponibilidade({
  slots,
  iniciais,
  aoSalvar,
  variante = "completa",
  carga,
  textoSalvar = "Salvar disponibilidade",
  mensagemSalvo = "Disponibilidade salva.",
}: {
  slots: SlotMatriz[];
  iniciais: Record<string, StatusDisponibilidade>;
  /** Server Action que regrava as marcações (já ligada ao dono). */
  aoSalvar: (marcacoes: Marcacao[]) => Promise<EstadoCadastro>;
  variante?: Variante;
  /** Turma: carga atribuída, comparada ao vivo com os horários com aula. */
  carga?: number;
  textoSalvar?: string;
  mensagemSalvo?: string;
}) {
  const { ciclo, rotulos, cores, ajuda } = VARIANTES[variante];
  const [status, setStatus] =
    useState<Record<string, StatusDisponibilidade>>(iniciais);
  const [pintando, setPintando] = useState<StatusDisponibilidade | null>(null);
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState(false);
  const [pendente, iniciar] = useTransition();

  const turnos = useMemo(
    () => [...new Set(slots.map((s) => s.turno_nome))],
    [slots],
  );

  function statusDe(id: string): StatusDisponibilidade {
    return status[id] ?? "disponivel";
  }

  function aplicar(id: string, novo: StatusDisponibilidade) {
    setStatus((s) => ({ ...s, [id]: novo }));
  }

  const semAula = slots.filter((s) => statusDe(s.id) === "indisponivel").length;

  function salvar() {
    iniciar(async () => {
      setOk(false);
      const marcacoes = Object.entries(status)
        .filter(([, st]) => st !== "disponivel")
        .map(([slot_id, st]) => ({ slot_id, status: st }));
      const r = await aoSalvar(marcacoes);
      setErro(r.erro);
      setOk(!!r.sucesso);
    });
  }

  return (
    <div
      className="flex flex-col gap-6 select-none"
      onMouseUp={() => setPintando(null)}
      onMouseLeave={() => setPintando(null)}
    >
      {turnos.map((turno) => {
        const doTurno = slots.filter((s) => s.turno_nome === turno);
        const dias = [...new Set(doTurno.map((s) => s.dia))].sort();
        const ordens = [...new Set(doTurno.map((s) => s.ordem))].sort(
          (a, b) => a - b,
        );
        return (
          <div key={turno}>
            <h2 className="mb-2 text-lg font-semibold">{turno}</h2>
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
                      const slot = doTurno.find(
                        (s) => s.dia === d && s.ordem === o,
                      );
                      if (!slot) {
                        return <td key={d} className="border bg-gray-100" />;
                      }
                      const atual = statusDe(slot.id);
                      return (
                        <td
                          key={d}
                          title={rotulos[atual]}
                          className={`border px-4 py-2 cursor-pointer ${cores[atual]}`}
                          onMouseDown={() => {
                            const novo = proximoStatus(atual, ciclo);
                            aplicar(slot.id, novo);
                            setPintando(novo);
                          }}
                          onMouseEnter={() => {
                            if (pintando) aplicar(slot.id, pintando);
                          }}
                        >
                          {rotulos[atual][0]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {carga !== undefined && (
        <ResumoCarga carga={carga} comAula={slots.length - semAula} />
      )}
      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando..." : textoSalvar}
        </Button>
        <span className="text-xs text-muted-foreground">{ajuda}</span>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {ok && <p className="text-sm text-green-700">{mensagemSalvo}</p>}
    </div>
  );
}

function ResumoCarga({ carga, comAula }: { carga: number; comAula: number }) {
  const bate = carga === comAula;
  return (
    <p className={`text-sm ${bate ? "text-green-700" : "text-amber-600"}`}>
      Carga atribuída: {carga} de {comAula} horários com aula
      {bate ? "." : " — ajuste as atribuições ou os horários sem aula antes de gerar."}
    </p>
  );
}
