import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  buscarDadosUnidade,
  montarInstancia,
  type InstanciaMotor,
} from "@/lib/instancia";
import { impressaoInstancia } from "@/lib/edicao/snapshot";
import { custoExibido, type Avaliacao } from "@/lib/edicao/avaliacao";
import {
  gravarAvaliacaoRecalculada,
  reavaliarSeDesatualizada,
} from "@/lib/edicao/reavaliacao";
import {
  legendaRegras,
  marcasDaGrade,
  type DonoGrade,
} from "@/lib/pontos-atencao";
import type { Excecao } from "@/lib/edicao/acoes";
import { traduzirNucleo } from "@/lib/nucleo";
import { CATALOGO_REGRAS, type TipoRegra } from "@/lib/validacao/regras";
import { Cabecalho } from "./cabecalho";
import { Editor } from "./editor";
import { GradeMarcada, type GradeExibida } from "./grade-marcada";

type Celula = { disciplina: string; extra: string };
type Slot = { id: string; dia: number; ordem: number; turno_id: string };

export default async function PaginaGrade({
  params,
  searchParams,
}: {
  params: Promise<{ cenarioId: string }>;
  searchParams: Promise<{ visao?: string; alvo?: string; editar?: string }>;
}) {
  const { cenarioId } = await params;
  const { visao = "turma", alvo, editar } = await searchParams;
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();

  const { data: cenario } = await supabase
    .from("cenarios")
    .select(
      "id, geracao_id, nome, origem, oficial, versao, avaliacao, excecoes, atualizado_em, cenario_base_id",
    )
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
        .select("resultado, instancia")
        .eq("id", cenario.geracao_id)
        .maybeSingle(),
    ]);

  const erroLeitura = [
    aulasR,
    atribR,
    slotsR,
    turmasR,
    profsR,
    discR,
    turnosR,
    gerR,
  ].some((r) => r.error);
  const { data: base } = cenario.cenario_base_id
    ? await supabase
        .from("cenarios")
        .select("nome")
        .eq("id", cenario.cenario_base_id)
        .maybeSingle()
    : { data: null };
  const instancia =
    (gerR.data?.instancia as InstanciaMotor | undefined) ?? null;
  const podeEditar = perfil.papel !== "professor";
  // Avaliações antigas não dizem onde estão os custos: recalcula no
  // validador e, para gestor, grava (professor só vê o recálculo).
  const avaliacao = erroLeitura
    ? ((cenario.avaliacao as Avaliacao | null) ?? null)
    : await reavaliarSeDesatualizada(
        (cenario.avaliacao as Avaliacao | null) ?? null,
        instancia,
        aulasR.data ?? [],
        {
          gravar: podeEditar
            ? (nova) =>
                gravarAvaliacaoRecalculada(cenarioId, cenario.versao, nova)
            : undefined,
        },
      );
  const excecoes = (cenario.excecoes as Excecao[] | null) ?? [];
  // A grade é avaliada contra o snapshot da geração: avisa quando os
  // cadastros mudaram depois dela (inclusive por reimportação do escolajba).
  let cadastrosMudaram = false;
  if (instancia) {
    try {
      const atual = montarInstancia(
        await buscarDadosUnidade(supabase, perfil.unidade_id),
        instancia.budget_segundos,
      );
      cadastrosMudaram =
        impressaoInstancia(atual) !== impressaoInstancia(instancia);
    } catch {
      // sem o aviso se a leitura falhar; o erro de leitura já aparece acima
    }
  }

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

  const resultado = gerR.data?.resultado as Pick<
    Avaliacao,
    "custo_total" | "custos"
  > | null;
  const custo = custoExibido(avaliacao, resultado);
  const rotuloRegra = (tipo: string) =>
    CATALOGO_REGRAS[tipo as TipoRegra]?.rotulo ?? tipo;
  const legenda = legendaRegras(
    avaliacao?.custos ?? resultado?.custos ?? [],
    rotuloRegra,
  );

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

  const celulasDe = (m: Map<string, Celula> | undefined) =>
    Object.fromEntries(m ?? []);
  const grades: GradeExibida[] = [];
  if (visao === "turma" && turmaAtiva) {
    grades.push({
      chave: turmaAtiva.id,
      dono: { eixo: "turma", id: turmaAtiva.id },
      slots: slotsDoTurno(turmaAtiva.turno_id),
      celulas: celulasDe(porTurma.get(turmaAtiva.id)),
    });
  } else if (visao === "professor" && alvoAtivo) {
    for (const tn of turnosR.data ?? []) {
      grades.push({
        chave: tn.id,
        titulo: tn.nome,
        dono: { eixo: "professor", id: alvoAtivo },
        slots: slotsDoTurno(tn.id),
        celulas: celulasDe(porProfessor.get(alvoAtivo)),
      });
    }
  } else if (visao === "turno" && alvoAtivo) {
    for (const t of (turmasR.data ?? []).filter(
      (t) => t.turno_id === alvoAtivo,
    )) {
      grades.push({
        chave: t.id,
        titulo: t.nome,
        dono: { eixo: "turma", id: t.id },
        slots: slotsDoTurno(alvoAtivo),
        celulas: celulasDe(porTurma.get(t.id)),
      });
    }
  }
  const donos: DonoGrade[] = grades.map((g) => g.dono);
  const marcas = marcasDaGrade(legenda, donos);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Cabecalho
          dados={{
            cenarioId,
            nome: cenario.nome,
            origem: cenario.origem as "gerado" | "duplicado",
            nomeBase: base?.nome ?? null,
            oficial: cenario.oficial,
            versao: cenario.versao,
            atualizadoEm: cenario.atualizado_em,
            podeEditar,
          }}
        />
        <div className="flex gap-4 text-sm">
          <span>
            {cenario.oficial
              ? "Exportar o horário oficial para o escolajba: "
              : "Exportar para o escolajba: "}
            <a
              className="underline"
              href={`/grade/${cenarioId}/quadro-horarios`}
            >
              JSON
            </a>{" "}
            ·{" "}
            <a
              className="underline"
              href={`/grade/${cenarioId}/quadro-horarios?formato=csv`}
            >
              CSV
            </a>
          </span>
          <Link className="underline" href="/geracoes">
            Voltar às gerações
          </Link>
        </div>
      </div>
      {erroLeitura && (
        <p role="alert" className="text-sm text-red-700">
          Parte dos dados do cenário não pôde ser lida. Recarregue a página.
        </p>
      )}
      {cadastrosMudaram && (
        <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">
          Os cadastros mudaram desde a geração deste cenário. Ajustes são
          avaliados com os dados da época da geração; gere um novo horário para
          incorporar as mudanças.
        </p>
      )}
      {custo && (
        <p className="text-sm">
          Custo das regras preferenciais: <strong>{custo.total}</strong>
          {custo.fonte === "estimado" && (
            <span className="text-muted-foreground">
              {" "}
              (estimado pela geração; vira exato na próxima edição salva)
            </span>
          )}
        </p>
      )}
      {excecoes.length > 0 && (
        <section className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">
          <h2 className="font-semibold">
            Regras obrigatórias violadas e aceitas (salvo com
            &quot;forçar&quot;)
          </h2>
          <ul className="list-inside list-disc">
            {traduzirNucleo(
              excecoes.map((e) => e.motivo),
              instancia,
            ).map((texto, i) => (
              <li key={i}>
                {texto}{" "}
                <span className="text-muted-foreground">
                  ({new Date(excecoes[i].forcado_em).toLocaleString("pt-BR")})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {editar === "1" && podeEditar ? (
        <Editor
          cenarioId={cenarioId}
          versao={cenario.versao}
          oficial={cenario.oficial}
          aulas={aulasR.data ?? []}
          avaliacaoBase={avaliacao}
          turmas={turmasR.data ?? []}
          slots={slots}
          turmaInicial={turmaAtiva?.id ?? turmasR.data?.[0]?.id ?? ""}
          turmaDaAtribuicao={Object.fromEntries(
            (atribR.data ?? []).map((a) => [a.id, a.turma_id]),
          )}
          rotulos={Object.fromEntries(
            (atribR.data ?? []).map((a) => [
              a.id,
              {
                disciplina: nomeDisc[a.disciplina_id] ?? "?",
                professor: nomeProf[a.professor_id] ?? "?",
              },
            ]),
          )}
          rotulosRegra={Object.fromEntries(
            Object.entries(CATALOGO_REGRAS).map(([tipo, c]) => [
              tipo,
              c.rotulo,
            ]),
          )}
        />
      ) : (
        <>
          <nav className="flex gap-4 text-sm">
            {abas.map((a) => (
              <Link
                key={a.chave}
                href={`/grade/${cenarioId}?visao=${a.chave}`}
                className={
                  a.chave === visao ? "font-bold underline" : "underline"
                }
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
                className={
                  x.id === alvoAtivo ? "font-bold underline" : "underline"
                }
              >
                {x.nome}
              </Link>
            ))}
          </nav>

          <GradeMarcada
            grades={grades}
            legenda={legenda.map((r) => ({ ...r, ocorrencias: undefined }))}
            porCelula={marcas.porCelula}
            visiveis={marcas.visiveis}
          />
        </>
      )}
      {legenda.length > 0 && (
        <section className="text-sm">
          <h2 className="font-semibold">Custo por regra preferencial</h2>
          <ul className="flex flex-col gap-1">
            {legenda.map((r) => (
              <li key={r.regra_id}>
                <details>
                  <summary className="cursor-pointer">
                    <span
                      aria-hidden
                      className="mr-2 inline-block size-3 rounded-full align-middle"
                      style={{ backgroundColor: r.cor }}
                    />
                    {r.rotulo}: {r.resumo}
                  </summary>
                  {r.ocorrencias.length > 0 ? (
                    <ul className="ml-7 list-disc">
                      {r.ocorrencias.map((o, i) => (
                        <li key={i}>
                          {o.descricao}
                          {o.unidades > 1 && <> (×{o.unidades})</>}{" "}
                          <span className="text-muted-foreground">
                            custo {o.custo}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ml-7 text-muted-foreground">
                      Detalhes indisponíveis: a validação não respondeu.
                      Recarregue a página para tentar de novo.
                    </p>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
