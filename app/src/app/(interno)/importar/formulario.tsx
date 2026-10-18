"use client";

import { useActionState } from "react";
import { importarPacote, type EstadoImportar } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROTULOS: Record<string, string> = {
  turnos: "Turnos",
  horarios: "Horários",
  turmas: "Turmas",
  disciplinas: "Disciplinas",
  professores: "Professores",
  recursos: "Recursos",
  disponibilidades: "Disponibilidades",
  atribuicoes: "Atribuições",
  regras: "Regras",
};

export function FormularioImportar() {
  const [estado, acao, pendente] = useActionState<EstadoImportar, FormData>(
    importarPacote,
    {},
  );
  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="arquivos">Pacote (.json ou os arquivos .csv)</Label>
        <Input
          id="arquivos"
          name="arquivos"
          type="file"
          accept=".json,.csv"
          multiple
          className="max-w-md"
        />
      </div>
      <div className="flex gap-3">
        <Button type="submit" name="modo" value="validar" variant="outline" disabled={pendente}>
          Validar
        </Button>
        <Button type="submit" name="modo" value="importar" disabled={pendente}>
          {pendente ? "Processando..." : "Importar"}
        </Button>
      </div>

      {estado.importado && (
        <p className="text-sm font-medium text-green-700">
          Pacote importado. Os cadastros já estão atualizados.
        </p>
      )}
      {(estado.erros ?? []).length > 0 && (
        <section className="text-sm">
          <h2 className="font-semibold text-red-600">
            {estado.erros!.length} erro(s): nada foi gravado
          </h2>
          <ul className="list-inside list-disc text-red-600">
            {estado.erros!.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
      )}
      {estado.resumo && (
        <section className="text-sm">
          <h2 className="font-semibold">
            {estado.importado ? "Itens gravados" : "Pacote válido — itens a gravar"}
          </h2>
          <ul className="list-inside list-disc">
            {Object.entries(estado.resumo).map(([secao, n]) => (
              <li key={secao}>
                {ROTULOS[secao] ?? secao}: {n}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(estado.avisos ?? []).length > 0 && (
        <section className="text-sm">
          <h2 className="font-semibold text-amber-600">Avisos</h2>
          <ul className="list-inside list-disc text-amber-600">
            {estado.avisos!.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </form>
  );
}
