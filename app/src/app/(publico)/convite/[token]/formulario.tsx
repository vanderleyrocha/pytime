"use client";

import { useActionState } from "react";
import { aceitarConvite, type EstadoAceite } from "./actions";
import { Button } from "@/components/ui/button";

export function FormularioAceite({
  token,
  nomeUnidade,
  papel,
}: {
  token: string;
  nomeUnidade: string;
  papel: string;
}) {
  const [estado, acao, pendente] = useActionState<EstadoAceite, FormData>(
    aceitarConvite,
    {},
  );
  return (
    <form action={acao} className="mx-auto mt-24 flex w-96 flex-col gap-4">
      <h1 className="text-2xl font-bold">Convite para {nomeUnidade}</h1>
      <p className="text-sm">
        Você entrará como <strong>{papel}</strong>.
      </p>
      <input type="hidden" name="token" value={token} />
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Aceitando..." : "Aceitar convite"}
      </Button>
    </form>
  );
}
