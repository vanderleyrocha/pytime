"use client";

import { useActionState } from "react";
import { gerarHorario, type EstadoGerar } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioGerar() {
  const [estado, acao, pendente] = useActionState<EstadoGerar, FormData>(
    gerarHorario,
    {},
  );
  return (
    <form action={acao} className="flex items-end gap-3">
      <div>
        <Label htmlFor="budget">Tempo máximo (s)</Label>
        <Input
          id="budget"
          name="budget"
          type="number"
          min={1}
          max={600}
          defaultValue={60}
          className="w-28"
        />
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? "Enfileirando..." : "Gerar horário"}
      </Button>
      <div className="text-sm">
        {estado.erro && <p className="text-red-600">{estado.erro}</p>}
        {(estado.pendencias ?? []).map((p) => (
          <p key={p.turma_id} className="text-amber-600">
            {p.turma_nome}: {p.atual} de {p.esperado} aulas atribuídas
          </p>
        ))}
      </div>
    </form>
  );
}
