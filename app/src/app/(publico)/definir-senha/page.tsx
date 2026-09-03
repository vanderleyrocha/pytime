"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { definirSenha, type EstadoSenha } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function FormularioSenha() {
  const params = useSearchParams();
  const [estado, acao, pendente] = useActionState<EstadoSenha, FormData>(
    definirSenha,
    {},
  );
  return (
    <form action={acao} className="mx-auto mt-24 flex w-80 flex-col gap-4">
      <h1 className="text-2xl font-bold">Defina sua senha</h1>
      <p className="text-sm text-muted-foreground">
        Você entrou por um convite. Escolha uma senha para os próximos acessos.
      </p>
      <input type="hidden" name="proximo" value={params.get("next") ?? ""} />
      <div>
        <Label htmlFor="senha">Senha (mínimo 8 caracteres)</Label>
        <Input id="senha" name="senha" type="password" required />
      </div>
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar senha"}
      </Button>
    </form>
  );
}

export default function PaginaDefinirSenha() {
  return (
    <Suspense>
      <FormularioSenha />
    </Suspense>
  );
}
