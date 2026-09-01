"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { entrar, type EstadoAuth } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function FormularioLogin() {
  const params = useSearchParams();
  const [estado, acao, pendente] = useActionState<EstadoAuth, FormData>(
    entrar,
    {},
  );
  return (
    <form action={acao} className="mx-auto mt-24 flex w-80 flex-col gap-4">
      <h1 className="text-2xl font-bold">Entrar no PyTime</h1>
      {params.get("confirmado") && (
        <p className="text-sm text-green-700">E-mail confirmado. Faça login.</p>
      )}
      <input type="hidden" name="proximo" value={params.get("proximo") ?? ""} />
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div>
        <Label htmlFor="senha">Senha</Label>
        <Input id="senha" name="senha" type="password" required />
      </div>
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Entrando..." : "Entrar"}
      </Button>
      <p className="text-sm">
        Não tem conta? <Link className="underline" href="/cadastro">Cadastre-se</Link>
      </p>
    </form>
  );
}

export default function PaginaLogin() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}
