"use client";

import { useState, useTransition } from "react";
import { salvarGrade } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type Horario = { hora_inicio: string; hora_fim: string };

export function GradeEditor({
  turnoId,
  diasIniciais,
  horariosIniciais,
}: {
  turnoId: string;
  diasIniciais: number[];
  horariosIniciais: Horario[];
}) {
  const [dias, setDias] = useState<number[]>(
    diasIniciais.length ? diasIniciais : [0, 1, 2, 3, 4],
  );
  const [horarios, setHorarios] = useState<Horario[]>(
    horariosIniciais.length
      ? horariosIniciais
      : [{ hora_inicio: "07:00", hora_fim: "07:50" }],
  );
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState(false);
  const [pendente, iniciar] = useTransition();

  function alternarDia(d: number) {
    setDias((atual) =>
      atual.includes(d) ? atual.filter((x) => x !== d) : [...atual, d].sort(),
    );
  }

  function mudarHorario(i: number, campo: keyof Horario, valor: string) {
    setHorarios((hs) =>
      hs.map((h, j) => (j === i ? { ...h, [campo]: valor } : h)),
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex gap-3 text-sm">
        {DIAS.map((rotulo, d) => (
          <label key={d} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={dias.includes(d)}
              onChange={() => alternarDia(d)}
            />
            {rotulo}
          </label>
        ))}
      </div>
      {horarios.map((h, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-14">{i + 1}º</span>
          <Input
            type="time"
            className="w-32"
            value={h.hora_inicio}
            onChange={(e) => mudarHorario(i, "hora_inicio", e.target.value)}
          />
          <span>às</span>
          <Input
            type="time"
            className="w-32"
            value={h.hora_fim}
            onChange={(e) => mudarHorario(i, "hora_fim", e.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHorarios((hs) => hs.filter((_, j) => j !== i))}
          >
            Remover
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setHorarios((hs) => [
              ...hs,
              { hora_inicio: "", hora_fim: "" },
            ])
          }
        >
          Adicionar horário
        </Button>
        <Button
          size="sm"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setOk(false);
              const r = await salvarGrade(turnoId, { dias, horarios });
              setErro(r.erro);
              setOk(!!r.sucesso);
            })
          }
        >
          {pendente ? "Salvando..." : "Salvar grade"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Salvar substitui a grade e apaga as disponibilidades já marcadas
          nesses slots.
        </span>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {ok && <p className="text-sm text-green-700">Grade salva.</p>}
    </div>
  );
}
