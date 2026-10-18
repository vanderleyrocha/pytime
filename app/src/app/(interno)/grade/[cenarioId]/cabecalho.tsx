"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { duplicarCenario, marcarOficial, renomearCenario } from "./actions";

export type DadosCabecalho = {
  cenarioId: string;
  nome: string;
  origem: "gerado" | "duplicado";
  nomeBase: string | null;
  oficial: boolean;
  versao: number;
  atualizadoEm: string;
  podeEditar: boolean;
};

/** Nome, selos e ações (renomear, duplicar, marcar oficial) do cenário. */
export function Cabecalho({ dados }: { dados: DadosCabecalho }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(dados.nome);

  const executar = (
    acao: () => Promise<{ erro?: string }>,
    depois?: () => void,
  ) =>
    iniciar(async () => {
      setErro(null);
      const r = await acao();
      if (r.erro) setErro(r.erro);
      else depois?.();
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {renomeando ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              executar(
                () => renomearCenario(dados.cenarioId, nome),
                () => setRenomeando(false),
              );
            }}
          >
            <input
              aria-label="Nome do cenário"
              className="rounded border px-2 py-1 text-lg"
              value={nome}
              maxLength={80}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className="text-sm underline"
              disabled={pendente}
            >
              Salvar nome
            </button>
            <button
              type="button"
              className="text-sm underline"
              onClick={() => {
                setNome(dados.nome);
                setRenomeando(false);
              }}
            >
              Cancelar
            </button>
          </form>
        ) : (
          <h1 className="text-2xl font-bold">{dados.nome}</h1>
        )}
        {dados.oficial && (
          <span className="rounded bg-green-700 px-2 py-0.5 text-xs font-semibold text-white">
            Oficial
          </span>
        )}
        {dados.origem === "duplicado" && (
          <span className="text-xs text-muted-foreground">
            cópia de {dados.nomeBase ?? "outro cenário"}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          versão {dados.versao} · atualizado em{" "}
          {new Date(dados.atualizadoEm).toLocaleString("pt-BR")}
        </span>
      </div>

      {dados.podeEditar && (
        <div className="flex flex-wrap gap-4 text-sm">
          <a className="underline" href={`/grade/${dados.cenarioId}?editar=1`}>
            Editar grade
          </a>
          {!renomeando && (
            <button className="underline" onClick={() => setRenomeando(true)}>
              Renomear
            </button>
          )}
          <button
            className="underline"
            disabled={pendente}
            onClick={() =>
              executar(async () => {
                const r = await duplicarCenario(dados.cenarioId);
                if (r.dados) router.push(`/grade/${r.dados.id}`);
                return r;
              })
            }
          >
            Duplicar
          </button>
          {!dados.oficial && (
            <button
              className="underline"
              disabled={pendente}
              onClick={() => {
                if (
                  confirm(
                    "Marcar este cenário como o horário oficial da escola? O oficial anterior deixa de ser oficial.",
                  )
                ) {
                  executar(
                    () => marcarOficial(dados.cenarioId),
                    () => router.refresh(),
                  );
                }
              }}
            >
              Marcar como oficial
            </button>
          )}
        </div>
      )}
      {pendente && <p className="text-sm text-muted-foreground">Aguarde…</p>}
      {erro && (
        <p role="alert" className="text-sm text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}
