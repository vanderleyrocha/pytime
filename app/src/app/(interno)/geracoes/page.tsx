import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { haGeracaoEmAndamento } from "@/lib/geracoes";
import { FormularioGerar } from "./gerar";
import { AoVivo } from "./ao-vivo";
import { tentarNovamente } from "./actions";

const ROTULO_STATUS: Record<string, string> = {
  pendente: "Na fila",
  executando: "Executando",
  concluida: "Concluída",
  inviavel: "Inviável",
  erro: "Erro",
};

export default async function PaginaGeracoes() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  // hint da FK simples: a FK composta de tenant torna o embed ambíguo
  const { data: geracoes, error } = await supabase
    .from("geracoes")
    .select(
      "id, status, criada_em, budget_segundos, progresso, resultado, nucleo_conflito, detalhe_erro, tentativas, cenarios!cenarios_geracao_id_fkey(id)",
    )
    .eq("unidade_id", perfil.unidade_id)
    .order("criada_em", { ascending: false })
    .limit(20);

  const emAndamento = haGeracaoEmAndamento(
    (geracoes ?? []).map((g) => g.status),
  );

  return (
    <div className="flex flex-col gap-6">
      <AoVivo unidadeId={perfil.unidade_id} emAndamento={emAndamento} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gerações</h1>
        <FormularioGerar />
      </div>
      {error && (
        <p className="text-sm text-red-600">
          Não foi possível carregar as gerações. Recarregue a página.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Criada em</th>
            <th>Situação</th>
            <th>Progresso</th>
            <th>Custo</th>
            <th>Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {(geracoes ?? []).map((g) => {
            const progresso = g.progresso as {
              custo: number;
              tempo_segundos: number;
            } | null;
            const resultado = g.resultado as { custo_total?: number } | null;
            const cenario = (g.cenarios as { id: string }[] | null)?.[0];
            return (
              <tr key={g.id} className="border-b align-top">
                <td className="py-2">
                  {new Date(g.criada_em).toLocaleString("pt-BR")}
                </td>
                <td>{ROTULO_STATUS[g.status] ?? g.status}</td>
                <td>
                  {g.status === "executando" && progresso
                    ? `custo ${progresso.custo} aos ${progresso.tempo_segundos}s`
                    : g.status === "executando"
                      ? "iniciando..."
                      : "—"}
                </td>
                <td>{resultado?.custo_total ?? "—"}</td>
                <td className="max-w-md">
                  {g.status === "concluida" && cenario && (
                    <Link className="underline" href={`/grade/${cenario.id}`}>
                      Ver grade
                    </Link>
                  )}
                  {g.status === "inviavel" && (
                    <ul className="list-inside list-disc text-red-700">
                      {(g.nucleo_conflito ?? []).map((m: string) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  )}
                  {g.status === "erro" && (
                    <span className="text-red-700">{g.detalhe_erro}</span>
                  )}
                  {(g.status === "erro" || g.status === "inviavel") && (
                    <form action={tentarNovamente} className="mt-1">
                      <input type="hidden" name="geracao_id" value={g.id} />
                      <button type="submit" className="text-xs underline">
                        Tentar novamente
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(geracoes ?? []).length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          Nenhuma geração ainda. Complete os cadastros e clique em Gerar
          horário.
        </p>
      )}
    </div>
  );
}
