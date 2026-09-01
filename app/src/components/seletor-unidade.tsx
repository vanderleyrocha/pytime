"use client";

import { useRef } from "react";
import type { Perfil } from "@/lib/perfis";
import { definirUnidadeAtiva } from "@/lib/unidade-ativa";

export function SeletorUnidade({
  perfis,
  ativa,
}: {
  perfis: Perfil[];
  ativa: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={definirUnidadeAtiva}>
      <select
        name="unidade_id"
        defaultValue={ativa}
        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
        onChange={() => form.current?.requestSubmit()}
      >
        {perfis.map((p) => (
          <option key={p.unidade_id} value={p.unidade_id}>
            {p.unidade_nome}
          </option>
        ))}
      </select>
    </form>
  );
}
