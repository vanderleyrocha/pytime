import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import type { StatusDisponibilidade } from "@/lib/disponibilidade";
import {
  MatrizDisponibilidade,
  type SlotMatriz,
} from "@/components/matriz-disponibilidade";
import { salvarDisponibilidades } from "./actions";

export default async function PaginaDisponibilidade({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();

  const { data: professor } = await supabase
    .from("professores")
    .select("id, nome")
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id)
    .maybeSingle();
  if (!professor) notFound();

  const [
    { data: slots, error: erroSlots },
    { data: marcadas, error: erroMarcadas },
  ] = await Promise.all([
    supabase
      .from("slots")
      // hint da FK simples: a FK composta de tenant torna o embed ambíguo
      .select("id, dia, ordem, turnos!slots_turno_id_fkey(nome)")
      .eq("unidade_id", perfil.unidade_id),
    supabase
      .from("disponibilidades")
      .select("slot_id, status")
      .eq("professor_id", id),
  ]);

  const slotsMatriz: SlotMatriz[] = (slots ?? []).map((s) => ({
    id: s.id,
    dia: s.dia,
    ordem: s.ordem,
    turno_nome:
      (s.turnos as unknown as { nome: string } | null)?.nome ?? "Turno",
  }));
  const iniciais = Object.fromEntries(
    (marcadas ?? []).map((m) => [m.slot_id, m.status as StatusDisponibilidade]),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Disponibilidade — {professor.nome}</h1>
      {erroSlots || erroMarcadas ? (
        <p role="alert" className="text-sm text-red-700">
          Não foi possível ler a disponibilidade. Recarregue a página.
        </p>
      ) : slotsMatriz.length === 0 ? (
        <p className="text-sm text-amber-600">
          Nenhum slot cadastrado. Monte a grade em Turnos primeiro.
        </p>
      ) : (
        <MatrizDisponibilidade
          slots={slotsMatriz}
          iniciais={iniciais}
          aoSalvar={salvarDisponibilidades.bind(null, professor.id)}
        />
      )}
    </div>
  );
}
