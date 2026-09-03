"use client";

import { useState, useTransition } from "react";
import { excluirAtribuicao, salvarAtribuicao } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type Opcao = { valor: string; rotulo: string };

export type AtribuicaoExistente = {
  id: string;
  professor_id: string;
  disciplina_id: string;
  turma_id: string;
  carga_semanal: number;
  geminadas: number;
  recurso_ids: string[];
};

export function FormularioAtribuicao({
  professores,
  disciplinas,
  turmas,
  recursos,
  registro,
}: {
  professores: Opcao[];
  disciplinas: Opcao[];
  turmas: Opcao[];
  recursos: Opcao[];
  registro?: AtribuicaoExistente;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();

  function enviar(formData: FormData) {
    iniciar(async () => {
      const r = await salvarAtribuicao(registro?.id ?? null, {
        professor_id: formData.get("professor_id"),
        disciplina_id: formData.get("disciplina_id"),
        turma_id: formData.get("turma_id"),
        carga_semanal: formData.get("carga_semanal"),
        geminadas: formData.get("geminadas"),
        recurso_ids: formData.getAll("recurso_ids"),
      });
      if (r.erro) setErro(r.erro);
      else {
        setErro(undefined);
        setAberto(false);
      }
    });
  }

  const selecoes: {
    nome: "professor_id" | "disciplina_id" | "turma_id";
    rotulo: string;
    opcoes: Opcao[];
  }[] = [
    { nome: "professor_id", rotulo: "Professor", opcoes: professores },
    { nome: "disciplina_id", rotulo: "Disciplina", opcoes: disciplinas },
    { nome: "turma_id", rotulo: "Turma", opcoes: turmas },
  ];

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={registro ? "outline" : "default"} size="sm" />}
      >
        {registro ? "Editar" : "Adicionar"}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>
          {registro ? "Editar atribuição" : "Nova atribuição"}
        </DialogTitle>
        <form action={enviar} className="flex flex-col gap-4">
          {selecoes.map((s) => (
            <div key={s.nome}>
              <Label htmlFor={s.nome}>{s.rotulo}</Label>
              <select
                id={s.nome}
                name={s.nome}
                defaultValue={registro?.[s.nome] ?? ""}
                className="block h-9 w-full rounded-md border px-2 text-sm"
                required
              >
                <option value="" disabled>
                  Escolha...
                </option>
                {s.opcoes.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="flex gap-4">
            <div>
              <Label htmlFor="carga_semanal">Carga semanal</Label>
              <Input
                id="carga_semanal"
                name="carga_semanal"
                type="number"
                min={1}
                defaultValue={registro?.carga_semanal ?? 1}
                required
              />
            </div>
            <div>
              <Label htmlFor="geminadas">Geminadas (pares)</Label>
              <Input
                id="geminadas"
                name="geminadas"
                type="number"
                min={0}
                defaultValue={registro?.geminadas ?? 0}
                required
              />
            </div>
          </div>
          {recursos.length > 0 && (
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="font-medium">Recursos usados</legend>
              {recursos.map((r) => (
                <label key={r.valor} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="recurso_ids"
                    value={r.valor}
                    defaultChecked={registro?.recurso_ids.includes(r.valor)}
                  />
                  {r.rotulo}
                </label>
              ))}
            </fieldset>
          )}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BotaoExcluirAtribuicao({ id }: { id: string }) {
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
            const r = await excluirAtribuicao(id);
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
