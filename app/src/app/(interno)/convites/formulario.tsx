"use client";

import { useActionState } from "react";
import { criarConvite, type EstadoConvite } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioConvite() {
  const [estado, acao, pendente] = useActionState<EstadoConvite, FormData>(
    criarConvite,
    {},
  );
  return (
    <form action={acao} className="flex items-end gap-4">
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div>
        <Label htmlFor="papel">Papel</Label>
        <select
          id="papel"
          name="papel"
          className="block h-9 rounded-md border px-2 text-sm"
          defaultValue="coordenador"
        >
          <option value="coordenador">Coordenador</option>
          <option value="admin">Administrador</option>
        </select>
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? "Convidando..." : "Convidar"}
      </Button>
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      {estado.sucesso && (
        <p
          className={
            estado.aviso
              ? "text-sm text-amber-600"
              : "text-sm text-green-700"
          }
        >
          {estado.aviso ?? "Convite criado."}
        </p>
      )}
    </form>
  );
}
