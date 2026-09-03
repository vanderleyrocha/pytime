import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type Celula = { disciplina: string; extra: string };
type Slot = { id: string; dia: number; ordem: number; turno_id: string };

function TabelaGrade({
  slots,
  celulas,
}: {
  slots: Slot[];
  celulas: Map<string, Celula>;
}) {
  const dias = [...new Set(slots.map((s) => s.dia))].sort((a, b) => a - b);
  const ordens = [...new Set(slots.map((s) => s.ordem))].sort((a, b) => a - b);
  return (
    <table className="border text-sm">
      <thead>
        <tr>
          <th className="border px-2 py-1"></th>
          {dias.map((d) => (
            <th key={d} className="border px-2 py-1">
              {DIAS[d]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ordens.map((o) => (
          <tr key={o}>
            <td className="border px-2 py-1 font-medium">{o + 1}º</td>
            {dias.map((d) => {
              const slot = slots.find((s) => s.dia === d && s.ordem === o);
              const cel = slot ? celulas.get(slot.id) : undefined;
              return (
                <td key={d} className="border px-3 py-2 text-center">
                  {cel ? (
                    <>
                      <div className="font-medium">{cel.disciplina}</div>
                      <div className="text-xs text-muted-foreground">
                        {cel.extra}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function PaginaGrade({
  params,
  searchParams,
}: {
  params: Promise<{ cenarioId: string }>;
  searchParams: Promise<{ visao?: string; alvo?: string }>;
}) {
  const { cenarioId } = await params;
  const { visao = "turma", alvo } = await searchParams;
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();

  const { data: cenario } = await supabase
    .from("cenarios")
    .select("id, geracao_id")
    .eq("id", cenarioId)
    .eq("unidade_id", perfil.unidade_id)
    .maybeSingle();
  if (!cenario) notFound();

  const [aulasR, atribR, slotsR, turmasR, profsR, discR, turnosR, gerR] =
    await Promise.all([
      supabase
        .from("aulas_alocadas")
        .select("atribuicao_id, slot_id")
        .eq("cenario_id", cenarioId),
      supabase
        .from("atribuicoes")
        .select("id, professor_id, disciplina_id, turma_id")
        .eq("unidade_id", perfil.unidade_id),
      supabase
        .from("slots")
        .select("id, dia, ordem, turno_id")
        .eq("unidade_id", perfil.unidade_id),
      supabase
        .from("turmas")
        .select("id, nome, turno_id")
        .eq("unidade_id", perfil.unidade_id)
        .order("nome"),
      supabase
        .from("professores")
        .select("id, nome")
        .eq("unidade_id", perfil.unidade_id)
        .order("nome"),
      supabase
        .from("disciplinas")
        .select("id, nome")
        .eq("unidade_id", perfil.unidade_id),
      supabase
        .from("turnos")
        .select("id, nome")
        .eq("unidade_id", perfil.unidade_id)
        .order("nome"),
      supabase
        .from("geracoes")
        .select("resultado")
        .eq("id", cenario.geracao_id)
        .maybeSingle(),
    ]);

  const nome = (l: { id: string; nome: string }[] | null) =>
    Object.fromEntries((l ?? []).map((x) => [x.id, x.nome]));
  const nomeTurma = nome(turmasR.data);
  const nomeProf = nome(profsR.data);
  const nomeDisc = nome(discR.data);
  const slots: Slot[] = slotsR.data ?? [];
  const atribPorId = Object.fromEntries(
    (atribR.data ?? []).map((a) => [a.id, a]),
  );

  // célula[slot_id] por agrupador (turma/professor)
  const porTurma = new Map<string, Map<string, Celula>>();
  const porProfessor = new Map<string, Map<string, Celula>>();
  for (const aula of aulasR.data ?? []) {
    const atrib = atribPorId[aula.atribuicao_id];
    if (!atrib) continue;
    const disciplina = nomeDisc[atrib.disciplina_id] ?? "?";
    if (!porTurma.has(atrib.turma_id)) porTurma.set(atrib.turma_id, new Map());
    porTurma.get(atrib.turma_id)!.set(aula.slot_id, {
      disciplina,
      extra: nomeProf[atrib.professor_id] ?? "?",
    });
    if (!porProfessor.has(atrib.professor_id)) {
      porProfessor.set(atrib.professor_id, new Map());
    }
    porProfessor.get(atrib.professor_id)!.set(aula.slot_id, {
      disciplina,
      extra: nomeTurma[atrib.turma_id] ?? "?",
    });
  }

  const resultado = gerR.data?.resultado as {
    custo_total?: number;
    custos?: { regra_id: string; tipo: string; custo: number }[];
  } | null;

  const slotsDoTurno = (turnoId: string) =>
    slots.filter((s) => s.turno_id === turnoId);

  const abas = [
    { chave: "turma", rotulo: "Por turma" },
    { chave: "professor", rotulo: "Por professor" },
    { chave: "turno", rotulo: "Geral por turno" },
  ];
  const alvos =
    visao === "turma"
      ? (turmasR.data ?? [])
      : visao === "professor"
        ? (profsR.data ?? [])
        : (turnosR.data ?? []);
  const alvoAtivo = alvo ?? alvos[0]?.id;
  const turmaAtiva = (turmasR.data ?? []).find((t) => t.id === alvoAtivo);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Grade gerada</h1>
        <Link className="text-sm underline" href="/geracoes">
          Voltar às gerações
        </Link>
      </div>
      <nav className="flex gap-4 text-sm">
        {abas.map((a) => (
          <Link
            key={a.chave}
            href={`/grade/${cenarioId}?visao=${a.chave}`}
            className={a.chave === visao ? "font-bold underline" : "underline"}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>
      <nav className="flex flex-wrap gap-3 text-sm">
        {alvos.map((x) => (
          <Link
            key={x.id}
            href={`/grade/${cenarioId}?visao=${visao}&alvo=${x.id}`}
            className={x.id === alvoAtivo ? "font-bold underline" : "underline"}
          >
            {x.nome}
          </Link>
        ))}
      </nav>

      {visao === "turma" && turmaAtiva && (
        <TabelaGrade
          slots={slotsDoTurno(turmaAtiva.turno_id)}
          celulas={porTurma.get(turmaAtiva.id) ?? new Map()}
        />
      )}
      {visao === "professor" && alvoAtivo && (
        <div className="flex flex-col gap-4">
          {(turnosR.data ?? []).map((tn) => (
            <div key={tn.id}>
              <h2 className="mb-1 font-semibold">{tn.nome}</h2>
              <TabelaGrade
                slots={slotsDoTurno(tn.id)}
                celulas={porProfessor.get(alvoAtivo) ?? new Map()}
              />
            </div>
          ))}
        </div>
      )}
      {visao === "turno" && alvoAtivo && (
        <div className="flex flex-col gap-4">
          {(turmasR.data ?? [])
            .filter((t) => t.turno_id === alvoAtivo)
            .map((t) => (
              <div key={t.id}>
                <h2 className="mb-1 font-semibold">{t.nome}</h2>
                <TabelaGrade
                  slots={slotsDoTurno(alvoAtivo)}
                  celulas={porTurma.get(t.id) ?? new Map()}
                />
              </div>
            ))}
        </div>
      )}

      {resultado && (
        <section className="text-sm">
          <h2 className="font-semibold">
            Custos das regras preferenciais (total {resultado.custo_total ?? 0})
          </h2>
          <ul className="list-inside list-disc">
            {(resultado.custos ?? [])
              .filter((c) => c.custo > 0)
              .map((c) => (
                <li key={c.regra_id}>
                  {c.tipo}: {c.custo}
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
