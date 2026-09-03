"use client";

import { useMemo, useState, useTransition } from "react";
import {
  COR_STATUS,
  ROTULO_STATUS,
  proximoStatus,
  type StatusDisponibilidade,
} from "@/lib/disponibilidade";
import { salvarDisponibilidades } from "./actions";
import { Button } from "@/components/ui/button";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export type SlotMatriz = {
  id: string;
  dia: number;
  ordem: number;
  turno_nome: string;
};

export function MatrizDisponibilidade({
  professorId,
  slots,
  iniciais,
}: {
  professorId: string;
  slots: SlotMatriz[];
  iniciais: Record<string, StatusDisponibilidade>;
}) {
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

  function salvar() {
    iniciar(async () => {
      setOk(false);
      const marcacoes = Object.entries(status)
        .filter(([, st]) => st !== "disponivel")
        .map(([slot_id, st]) => ({ slot_id, status: st }));
      const r = await salvarDisponibilidades(professorId, marcacoes);
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
                          title={ROTULO_STATUS[atual]}
                          className={`border px-4 py-2 cursor-pointer ${COR_STATUS[atual]}`}
                          onMouseDown={() => {
                            const novo = proximoStatus(atual);
                            aplicar(slot.id, novo);
                            setPintando(novo);
                          }}
                          onMouseEnter={() => {
                            if (pintando) aplicar(slot.id, pintando);
                          }}
                        >
                          {ROTULO_STATUS[atual][0]}
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
      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar disponibilidade"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Clique cicla Disponível → Indisponível → Prefere → Evita; arraste
          para pintar vários slots.
        </span>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {ok && <p className="text-sm text-green-700">Disponibilidade salva.</p>}
    </div>
  );
}
