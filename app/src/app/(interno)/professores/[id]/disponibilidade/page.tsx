import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import type { StatusDisponibilidade } from "@/lib/disponibilidade";
import { MatrizDisponibilidade, type SlotMatriz } from "./matriz";

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

  const [{ data: slots }, { data: marcadas }] = await Promise.all([
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
      <h1 className="text-2xl font-bold">
        Disponibilidade — {professor.nome}
      </h1>
      {slotsMatriz.length === 0 ? (
        <p className="text-sm text-amber-600">
          Nenhum slot cadastrado. Monte a grade em Turnos primeiro.
        </p>
      ) : (
        <MatrizDisponibilidade
          professorId={professor.id}
          slots={slotsMatriz}
          iniciais={iniciais}
        />
      )}
    </div>
  );
}
