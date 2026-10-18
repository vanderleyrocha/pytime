import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { lerTodas } from "@/lib/supabase/ler-todas";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  gerarQuadroHorarios,
  quadroParaCsv,
  type DadosExportacao,
} from "@/lib/exportacao/quadro-horarios";

function texto(status: number, corpo: string): Response {
  return new Response(corpo, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Download do cenário no padrão quadro_horarios do escolajba
 * (docs/exportacao/README.md). `?formato=csv` devolve CSV; o padrão é JSON.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ cenarioId: string }> },
) {
  const { cenarioId } = await params;
  const formato =
    new URL(request.url).searchParams.get("formato") === "csv" ? "csv" : "json";
  const perfil = await obterUnidadeAtiva();
  if (!perfil) return texto(401, "É preciso estar autenticado.");
  const supabase = await criarClienteServidor();
  const u = perfil.unidade_id;

  const { data: cenario } = await supabase
    .from("cenarios")
    .select("id, oficial, geracao_id")
    .eq("id", cenarioId)
    .eq("unidade_id", u)
    .maybeSingle();
  if (!cenario) return texto(404, "Cenário não encontrado.");

  const [
    ger,
    aulas,
    atribuicoes,
    slots,
    turnos,
    professores,
    disciplinas,
    turmas,
  ] = await Promise.all([
    supabase
      .from("geracoes")
      .select("status, resultado")
      .eq("id", cenario.geracao_id)
      .maybeSingle(),
    lerTodas((de, ate) =>
      supabase
        .from("aulas_alocadas")
        .select("atribuicao_id, slot_id")
        .eq("cenario_id", cenarioId)
        .order("id")
        .range(de, ate),
    ),
    lerTodas((de, ate) =>
      supabase
        .from("atribuicoes")
        .select("id, professor_id, disciplina_id, turma_id")
        .eq("unidade_id", u)
        .order("id")
        .range(de, ate),
    ),
    supabase
      .from("slots")
      .select("id, turno_id, dia, ordem")
      .eq("unidade_id", u),
    supabase
      .from("turnos")
      .select("id, nome, codigo_externo")
      .eq("unidade_id", u),
    supabase
      .from("professores")
      .select("id, nome, codigo_externo")
      .eq("unidade_id", u),
    supabase
      .from("disciplinas")
      .select("id, nome, codigo_externo")
      .eq("unidade_id", u),
    supabase
      .from("turmas")
      .select("id, nome, codigo_externo")
      .eq("unidade_id", u),
  ]);
  const consultas = [
    ger,
    aulas,
    atribuicoes,
    slots,
    turnos,
    professores,
    disciplinas,
    turmas,
  ];
  if (consultas.some((c) => c.error)) {
    return texto(500, "Não foi possível ler o cenário.");
  }
  const status = (ger.data?.resultado as { status?: string } | null)?.status;
  if (status !== "otimo" && status !== "viavel") {
    return texto(
      422,
      "Só cenários de gerações concluídas (ótimo ou viável) são exportados.",
    );
  }

  const r = gerarQuadroHorarios({
    aulas: aulas.data ?? [],
    atribuicoes: atribuicoes.data ?? [],
    slots: slots.data ?? [],
    turnos: turnos.data ?? [],
    professores: professores.data ?? [],
    disciplinas: disciplinas.data ?? [],
    turmas: turmas.data ?? [],
  } as DadosExportacao);
  if (!r.linhas) {
    return texto(
      422,
      ["Não foi possível exportar:", ...r.erros.map((e) => `- ${e}`)].join(
        "\n",
      ),
    );
  }

  const nome = `quadro-horarios-${cenarioId.slice(0, 8)}.${formato}`;
  const corpo =
    formato === "csv"
      ? quadroParaCsv(r.linhas)
      : JSON.stringify(
          {
            versao: "1.0",
            origem: {
              sistema: "pytime",
              cenario_id: cenarioId,
              status,
              oficial: cenario.oficial,
              gerado_em: new Date().toISOString(),
            },
            quadro_horarios: r.linhas,
          },
          null,
          2,
        );
  const headers: Record<string, string> = {
    "Content-Type":
      formato === "csv" ? "text/csv; charset=utf-8" : "application/json",
    "Content-Disposition": `attachment; filename="${nome}"`,
  };
  // avisos (ex.: professor em dois turnos no mesmo tempo) não impedem o download
  if (r.avisos.length)
    headers["X-Avisos"] = encodeURIComponent(r.avisos.join(" | "));
  return new Response(corpo, { headers });
}
