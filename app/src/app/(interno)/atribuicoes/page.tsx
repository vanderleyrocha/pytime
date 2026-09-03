import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { calcularPendencias } from "@/lib/matriz";
import {
  BotaoExcluirAtribuicao,
  FormularioAtribuicao,
  type AtribuicaoExistente,
} from "./formulario";

export default async function PaginaAtribuicoes({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string; professor?: string }>;
}) {
  const filtros = await searchParams;
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();

  const [
    { data: professores },
    { data: disciplinas },
    { data: turmas },
    { data: recursos },
    { data: slots },
  ] = await Promise.all([
    supabase.from("professores").select("id, nome")
      .eq("unidade_id", perfil.unidade_id).order("nome"),
    supabase.from("disciplinas").select("id, nome")
      .eq("unidade_id", perfil.unidade_id).order("nome"),
    supabase.from("turmas").select("id, nome, turno_id")
      .eq("unidade_id", perfil.unidade_id).order("nome"),
    supabase.from("recursos").select("id, nome")
      .eq("unidade_id", perfil.unidade_id).order("nome"),
    supabase.from("slots").select("turno_id")
      .eq("unidade_id", perfil.unidade_id),
  ]);

  let consulta = supabase
    .from("atribuicoes")
    .select(
      "id, professor_id, disciplina_id, turma_id, carga_semanal, geminadas, atribuicao_recursos(recurso_id)",
    )
    .eq("unidade_id", perfil.unidade_id);
  if (filtros.turma) consulta = consulta.eq("turma_id", filtros.turma);
  if (filtros.professor) {
    consulta = consulta.eq("professor_id", filtros.professor);
  }
  const { data: atribuicoes } = await consulta;

  const nomes = (lista: { id: string; nome: string }[] | null) =>
    Object.fromEntries((lista ?? []).map((x) => [x.id, x.nome]));
  const nomeProfessor = nomes(professores);
  const nomeDisciplina = nomes(disciplinas);
  const nomeTurma = nomes(turmas);
  const opcoes = (lista: { id: string; nome: string }[] | null) =>
    (lista ?? []).map((x) => ({ valor: x.id, rotulo: x.nome }));

  // Aviso permanente de matriz incompleta (todas as atribuições, sem filtro)
  const { data: todas } = await supabase
    .from("atribuicoes")
    .select("turma_id, carga_semanal")
    .eq("unidade_id", perfil.unidade_id);
  const slotsPorTurno: Record<string, number> = {};
  for (const s of slots ?? []) {
    slotsPorTurno[s.turno_id] = (slotsPorTurno[s.turno_id] ?? 0) + 1;
  }
  const cargaPorTurma: Record<string, number> = {};
  for (const a of todas ?? []) {
    cargaPorTurma[a.turma_id] = (cargaPorTurma[a.turma_id] ?? 0) + a.carga_semanal;
  }
  const pendencias = calcularPendencias(turmas ?? [], slotsPorTurno, cargaPorTurma);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Atribuições</h1>
        <FormularioAtribuicao
          professores={opcoes(professores)}
          disciplinas={opcoes(disciplinas)}
          turmas={opcoes(turmas)}
          recursos={opcoes(recursos)}
        />
      </div>
      {pendencias.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium">Matriz incompleta:</p>
          <ul className="list-inside list-disc">
            {pendencias.map((p) => (
              <li key={p.turma_id}>
                {p.turma_nome}: {p.atual} de {p.esperado} aulas atribuídas
              </li>
            ))}
          </ul>
        </div>
      )}
      <form method="get" className="flex items-end gap-3 text-sm">
        <div>
          <label htmlFor="turma" className="block font-medium">Turma</label>
          <select id="turma" name="turma" defaultValue={filtros.turma ?? ""}
            className="h-9 rounded-md border px-2">
            <option value="">Todas</option>
            {(turmas ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="professor" className="block font-medium">Professor</label>
          <select id="professor" name="professor"
            defaultValue={filtros.professor ?? ""}
            className="h-9 rounded-md border px-2">
            <option value="">Todos</option>
            {(professores ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md border px-3">
          Filtrar
        </button>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Professor</th>
            <th>Disciplina</th>
            <th>Turma</th>
            <th>Carga</th>
            <th>Geminadas</th>
            <th className="w-48"></th>
          </tr>
        </thead>
        <tbody>
          {(atribuicoes ?? []).map((a) => {
            const registro: AtribuicaoExistente = {
              id: a.id,
              professor_id: a.professor_id,
              disciplina_id: a.disciplina_id,
              turma_id: a.turma_id,
              carga_semanal: a.carga_semanal,
              geminadas: a.geminadas,
              recurso_ids: (
                a.atribuicao_recursos as { recurso_id: string }[]
              ).map((r) => r.recurso_id),
            };
            return (
              <tr key={a.id} className="border-b">
                <td className="py-2">{nomeProfessor[a.professor_id]}</td>
                <td>{nomeDisciplina[a.disciplina_id]}</td>
                <td>{nomeTurma[a.turma_id]}</td>
                <td>{a.carga_semanal}</td>
                <td>{a.geminadas}</td>
                <td className="flex gap-2 py-2">
                  <FormularioAtribuicao
                    professores={opcoes(professores)}
                    disciplinas={opcoes(disciplinas)}
                    turmas={opcoes(turmas)}
                    recursos={opcoes(recursos)}
                    registro={registro}
                  />
                  <BotaoExcluirAtribuicao id={a.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
