"use client";

import { useActionState } from "react";
import { criarEscola, type EstadoEscola } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioEscola() {
  const [estado, acao, pendente] = useActionState<EstadoEscola, FormData>(
    criarEscola,
    {},
  );
  return (
    <form action={acao} className="mx-auto mt-24 flex w-96 flex-col gap-4">
      <h1 className="text-2xl font-bold">Crie sua escola</h1>
      <p className="text-sm text-muted-foreground">
        Você será o administrador desta unidade.
      </p>
      <div>
        <Label htmlFor="nome">Nome da escola</Label>
        <Input id="nome" name="nome" required />
      </div>
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Criando..." : "Criar escola"}
      </Button>
    </form>
  );
}
