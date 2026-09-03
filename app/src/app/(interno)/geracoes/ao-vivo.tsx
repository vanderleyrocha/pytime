"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/cliente-navegador";

/** Assina UPDATEs de geracoes da unidade e revalida a página. */
export function AoVivo({ unidadeId }: { unidadeId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = criarClienteNavegador();
    const canal = supabase
      .channel(`geracoes-${unidadeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "geracoes",
          filter: `unidade_id=eq.${unidadeId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [unidadeId, router]);
  return null;
}
