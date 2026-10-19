import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  MatrizDisponibilidade,
  type SlotMatriz,
} from "@/components/matriz-disponibilidade";
import { salvarSemAulaTurma } from "./actions";

export default async function PaginaHorariosTurma({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();

  const { data: turma } = await supabase
    .from("turmas")
    // hint da FK simples: a FK composta de tenant torna o embed ambíguo
    .select("id, nome, turno_id, turnos!turmas_turno_id_fkey(nome)")
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id)
    .maybeSingle();
  if (!turma) notFound();
  const turnoNome =
    (turma.turnos as unknown as { nome: string } | null)?.nome ?? "Turno";

  const [
    { data: slots, error: erroSlots },
    { data: marcadas, error: erroMarcadas },
    { data: atribuicoes, error: erroAtribuicoes },
  ] = await Promise.all([
    supabase
      .from("slots")
      .select("id, dia, ordem")
      .eq("turno_id", turma.turno_id),
    supabase.from("turmas_sem_aula").select("slot_id").eq("turma_id", id),
    supabase.from("atribuicoes").select("carga_semanal").eq("turma_id", id),
  ]);

  const slotsMatriz: SlotMatriz[] = (slots ?? []).map((s) => ({
    id: s.id,
    dia: s.dia,
    ordem: s.ordem,
    turno_nome: turnoNome,
  }));
  const iniciais = Object.fromEntries(
    (marcadas ?? []).map((m) => [m.slot_id, "indisponivel" as const]),
  );
  const carga = (atribuicoes ?? []).reduce((t, a) => t + a.carga_semanal, 0);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Horários — {turma.nome}</h1>
      <p className="text-sm text-muted-foreground">
        Marque os horários do turno em que a turma não tem aula (ex.: sai mais
        cedo na sexta). O motor não aloca nada neles e a carga da turma deve
        somar só os horários com aula.
      </p>
      {erroSlots || erroMarcadas || erroAtribuicoes ? (
        <p role="alert" className="text-sm text-red-700">
          Não foi possível ler os horários. Recarregue a página.
        </p>
      ) : slotsMatriz.length === 0 ? (
        <p className="text-sm text-amber-600">
          O turno da turma não tem horários. Monte a grade em Turnos primeiro.
        </p>
      ) : (
        <MatrizDisponibilidade
          slots={slotsMatriz}
          iniciais={iniciais}
          aoSalvar={salvarSemAulaTurma.bind(null, turma.id)}
          variante="turma"
          carga={carga}
          textoSalvar="Salvar horários"
          mensagemSalvo="Horários da turma salvos."
        />
      )}
    </div>
  );
}
