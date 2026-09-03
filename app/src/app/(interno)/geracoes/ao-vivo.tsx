"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/cliente-navegador";

const INTERVALO_SONDAGEM = 4000;

/**
 * Mantém a lista de gerações atualizada sozinha.
 *
 * Caminho rápido: assina os UPDATEs da tabela via Realtime. O socket precisa do
 * token do usuário antes da assinatura, senão a RLS descarta os eventos.
 * Rede de segurança: enquanto houver geração em andamento, revalida a página
 * periodicamente — cobre WebSocket bloqueado e token expirado.
 */
export function AoVivo({
  unidadeId,
  emAndamento,
}: {
  unidadeId: string;
  emAndamento: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = criarClienteNavegador();
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let cancelado = false;

    async function assinar() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelado) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (cancelado) return;
      canal = supabase
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
    }
    void assinar();

    return () => {
      cancelado = true;
      if (canal) supabase.removeChannel(canal);
    };
  }, [unidadeId, router]);

  useEffect(() => {
    if (!emAndamento) return;
    const id = setInterval(() => router.refresh(), INTERVALO_SONDAGEM);
    return () => clearInterval(id);
  }, [emAndamento, router]);

  return null;
}
