"use client";

import { useState, useTransition } from "react";
import {
  CATALOGO_REGRAS,
  hardPadrao,
  type TipoRegra,
} from "@/lib/validacao/regras";
import { alternarAtiva, excluirRegra, salvarRegra } from "./actions";
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

export type RegraExistente = {
  id: string;
  tipo: TipoRegra;
  hard: boolean;
  peso: number;
  ativa: boolean;
  parametros: Record<string, unknown>;
};

const ORDENS = [0, 1, 2, 3, 4, 5, 6, 7];

function SeletorDisciplina({
  nome,
  rotulo,
  valor,
  disciplinas,
}: {
  nome: string;
  rotulo: string;
  valor?: unknown;
  disciplinas: Opcao[];
}) {
  return (
    <div>
      <Label htmlFor={nome}>{rotulo}</Label>
      <select
        id={nome}
        name={nome}
        required
        defaultValue={typeof valor === "string" ? valor : ""}
        className="block h-9 w-full rounded-md border px-2 text-sm"
      >
        <option value="" disabled>
          Escolha...
        </option>
        {disciplinas.map((d) => (
          <option key={d.valor} value={d.valor}>
            {d.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FormularioRegra({
  disciplinas,
  registro,
}: {
  disciplinas: Opcao[];
  registro?: RegraExistente;
}) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoRegra>(
    registro?.tipo ?? "disponibilidade_professor",
  );
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const meta = CATALOGO_REGRAS[tipo];
  const params = registro?.parametros ?? {};

  function enviar(formData: FormData) {
    iniciar(async () => {
      const r = await salvarRegra(registro?.id ?? null, {
        tipo,
        hard: formData.get("hard") === "true",
        peso: formData.get("peso") ?? 1,
        ativa: formData.get("ativa") === "on",
        max_por_dia: formData.get("max_por_dia") ?? undefined,
        disciplina_id: formData.get("disciplina_id") ?? undefined,
        disciplina_a: formData.get("disciplina_a") ?? undefined,
        disciplina_b: formData.get("disciplina_b") ?? undefined,
        modo: formData.get("modo") ?? undefined,
        ordens: formData.getAll("ordens"),
      });
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
        render={
          <Button variant={registro ? "outline" : "default"} size="sm" />
        }
      >
        {registro ? "Editar" : "Adicionar regra"}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{registro ? "Editar regra" : "Nova regra"}</DialogTitle>
        <form action={enviar} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="tipo">Tipo</Label>
            <select
              id="tipo"
              value={tipo}
              disabled={!!registro}
              onChange={(e) => setTipo(e.target.value as TipoRegra)}
              className="block h-9 w-full rounded-md border px-2 text-sm"
            >
              {Object.entries(CATALOGO_REGRAS).map(([t, m]) => (
                <option key={t} value={t}>
                  {m.rotulo}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {meta.descricao}
            </p>
          </div>

          {meta.modo === "alternavel" ? (
            <fieldset className="flex gap-4 text-sm">
              <legend className="font-medium">Aplicação</legend>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="hard"
                  value="true"
                  defaultChecked={registro ? registro.hard : true}
                />
                Obrigatória (hard)
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="hard"
                  value="false"
                  defaultChecked={registro ? !registro.hard : false}
                />
                Preferencial (soft)
              </label>
            </fieldset>
          ) : (
            <p className="text-xs text-muted-foreground">
              {hardPadrao(tipo)
                ? "Regra obrigatória (hard) — o motor não permite violá-la."
                : "Regra preferencial (soft) — violações entram no custo."}
            </p>
          )}

          {tipo === "distribuicao_disciplina" && (
            <div>
              <Label htmlFor="max_por_dia">Máximo de aulas por dia</Label>
              <Input
                id="max_por_dia"
                name="max_por_dia"
                type="number"
                min={1}
                defaultValue={Number(params.max_por_dia ?? 2)}
                required
              />
            </div>
          )}
          {tipo === "ultimo_horario" && (
            <SeletorDisciplina
              nome="disciplina_id"
              rotulo="Disciplina"
              valor={params.disciplina_id}
              disciplinas={disciplinas}
            />
          )}
          {tipo === "preferencia_disciplina" && (
            <>
              <SeletorDisciplina
                nome="disciplina_id"
                rotulo="Disciplina"
                valor={params.disciplina_id}
                disciplinas={disciplinas}
              />
              <fieldset className="text-sm">
                <legend className="font-medium">Posições do dia</legend>
                <div className="flex flex-wrap gap-3">
                  {ORDENS.map((o) => (
                    <label key={o} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        name="ordens"
                        value={o}
                        defaultChecked={
                          Array.isArray(params.ordens) &&
                          (params.ordens as number[]).includes(o)
                        }
                      />
                      {o + 1}º
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="flex gap-4 text-sm">
                <legend className="font-medium">Modo</legend>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="modo"
                    value="prefere"
                    defaultChecked={params.modo === "prefere"}
                  />
                  Prefere essas posições
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="modo"
                    value="evita"
                    defaultChecked={params.modo !== "prefere"}
                  />
                  Evita essas posições
                </label>
              </fieldset>
            </>
          )}
          {tipo === "nao_mesmo_dia" && (
            <>
              <SeletorDisciplina
                nome="disciplina_a"
                rotulo="Disciplina A"
                valor={params.disciplina_a}
                disciplinas={disciplinas}
              />
              <SeletorDisciplina
                nome="disciplina_b"
                rotulo="Disciplina B"
                valor={params.disciplina_b}
                disciplinas={disciplinas}
              />
            </>
          )}

          <div className="flex items-end gap-4">
            <div>
              <Label htmlFor="peso">Peso</Label>
              <Input
                id="peso"
                name="peso"
                type="number"
                min={1}
                defaultValue={registro?.peso ?? 1}
                required
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                name="ativa"
                defaultChecked={registro ? registro.ativa : true}
              />
              Ativa
            </label>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AcoesRegra({ regra }: { regra: RegraExistente }) {
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await alternarAtiva(regra.id, !regra.ativa);
            setErro(r.erro);
          })
        }
      >
        {regra.ativa ? "Desativar" : "Ativar"}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await excluirRegra(regra.id);
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
