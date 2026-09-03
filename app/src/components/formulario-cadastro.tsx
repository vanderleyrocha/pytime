"use client";

import { useState, useTransition } from "react";
import {
  salvarRegistro,
  excluirRegistro,
  type EstadoCadastro,
  type TabelaCadastro,
} from "@/lib/cadastros";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type Campo = {
  nome: string;
  rotulo: string;
  tipo: "texto" | "numero" | "selecao";
  opcoes?: { valor: string; rotulo: string }[];
};

export function FormularioCadastro({
  tabela,
  campos,
  registro,
  textoBotao,
}: {
  tabela: TabelaCadastro;
  campos: Campo[];
  registro?: Record<string, unknown> & { id: string };
  textoBotao?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();

  function enviar(formData: FormData) {
    const valores: Record<string, unknown> = {};
    for (const c of campos) valores[c.nome] = formData.get(c.nome);
    iniciar(async () => {
      const r: EstadoCadastro = await salvarRegistro(
        tabela,
        registro?.id ?? null,
        valores,
      );
      if (r.erro) setErro(r.erro);
      else {
        setErro(undefined);
        setAberto(false);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={registro ? "outline" : "default"} size="sm" />}
      >
        {textoBotao ?? (registro ? "Editar" : "Adicionar")}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{registro ? "Editar" : "Adicionar"}</DialogTitle>
        <form action={enviar} className="flex flex-col gap-4">
          {campos.map((c) => (
            <div key={c.nome}>
              <Label htmlFor={c.nome}>{c.rotulo}</Label>
              {c.tipo === "selecao" ? (
                <select
                  id={c.nome}
                  name={c.nome}
                  defaultValue={String(registro?.[c.nome] ?? "")}
                  className="block h-9 w-full rounded-md border px-2 text-sm"
                  required
                >
                  <option value="" disabled>
                    Escolha...
                  </option>
                  {(c.opcoes ?? []).map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={c.nome}
                  name={c.nome}
                  type={c.tipo === "numero" ? "number" : "text"}
                  defaultValue={String(registro?.[c.nome] ?? "")}
                  required
                />
              )}
            </div>
          ))}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BotaoExcluir({
  tabela,
  id,
}: {
  tabela: TabelaCadastro;
  id: string;
}) {
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="destructive"
        size="sm"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await excluirRegistro(tabela, id);
            setErro(r.erro);
          })
        }
      >
        Excluir
      </Button>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </span>
  );
}
