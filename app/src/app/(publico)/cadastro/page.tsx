"use client";

import { useActionState } from "react";
import Link from "next/link";
import { cadastrar, type EstadoCadastro } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PaginaCadastro() {
  const [estado, acao, pendente] = useActionState<EstadoCadastro, FormData>(
    cadastrar,
    {},
  );
  if (estado.sucesso) {
    return (
      <div className="mx-auto mt-24 w-80">
        <h1 className="text-2xl font-bold">Confira seu e-mail</h1>
        <p className="mt-2 text-sm">
          Enviamos um link de confirmação. Depois de confirmar,{" "}
          <Link className="underline" href="/login">faça login</Link>.
        </p>
      </div>
    );
  }
  return (
    <form action={acao} className="mx-auto mt-24 flex w-80 flex-col gap-4">
      <h1 className="text-2xl font-bold">Criar conta</h1>
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div>
        <Label htmlFor="senha">Senha (mínimo 8 caracteres)</Label>
        <Input id="senha" name="senha" type="password" required />
      </div>
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Enviando..." : "Cadastrar"}
      </Button>
      <p className="text-sm">
        Já tem conta? <Link className="underline" href="/login">Entrar</Link>
      </p>
    </form>
  );
}
