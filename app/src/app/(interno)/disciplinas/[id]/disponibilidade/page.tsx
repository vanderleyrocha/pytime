import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import type { StatusDisponibilidade } from "@/lib/disponibilidade";
import {
  MatrizDisponibilidade,
  type SlotMatriz,
} from "@/components/matriz-disponibilidade";
import { salvarDisponibilidadesDisciplina } from "./actions";

export default async function PaginaDisponibilidadeDisciplina({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();

  const { data: disciplina } = await supabase
    .from("disciplinas")
    .select("id, nome")
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id)
    .maybeSingle();
  if (!disciplina) notFound();

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
      .from("disponibilidades_disciplina")
      .select("slot_id, status")
      .eq("disciplina_id", id),
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
        Disponibilidade — {disciplina.nome}
      </h1>
      <p className="text-sm text-muted-foreground">
        Vale para a disciplina em todas as turmas. &quot;Indisponível&quot; só
        bloqueia com a regra &quot;Disponibilidade da disciplina&quot; ativa;
        &quot;Prefere&quot;/&quot;Evita&quot; pesam com a regra
        &quot;Preferências da disciplina&quot; (em Regras).
      </p>
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
          aoSalvar={salvarDisponibilidadesDisciplina.bind(null, disciplina.id)}
        />
      )}
    </div>
  );
}
