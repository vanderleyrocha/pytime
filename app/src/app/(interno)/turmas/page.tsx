import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  BotaoExcluir,
  FormularioCadastro,
} from "@/components/formulario-cadastro";

export default async function PaginaTurmas() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  const [{ data: turmas }, { data: turnos }] = await Promise.all([
    supabase
      .from("turmas")
      // hint da FK simples: a FK composta de tenant torna o embed ambíguo
      .select("id, nome, turno_id, turnos!turmas_turno_id_fkey(nome)")
      .eq("unidade_id", perfil.unidade_id)
      .order("nome"),
    supabase
      .from("turnos")
      .select("id, nome")
      .eq("unidade_id", perfil.unidade_id)
      .order("nome"),
  ]);

  const campos = [
    { nome: "nome", rotulo: "Nome", tipo: "texto" as const },
    {
      nome: "turno_id",
      rotulo: "Turno",
      tipo: "selecao" as const,
      opcoes: (turnos ?? []).map((t) => ({ valor: t.id, rotulo: t.nome })),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Turmas</h1>
        <FormularioCadastro tabela="turmas" campos={campos} />
      </div>
      {(turnos ?? []).length === 0 && (
        <p className="text-sm text-amber-600">
          Cadastre um turno antes de criar turmas.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nome</th>
            <th>Turno</th>
            <th className="w-48"></th>
          </tr>
        </thead>
        <tbody>
          {(turmas ?? []).map((t) => (
            <tr key={t.id} className="border-b">
              <td className="py-2">{t.nome}</td>
              <td>
                {(t.turnos as unknown as { nome: string } | null)?.nome ?? "—"}
              </td>
              <td className="flex gap-2 py-2">
                <FormularioCadastro
                  tabela="turmas"
                  campos={campos}
                  registro={{ id: t.id, nome: t.nome, turno_id: t.turno_id }}
                />
                <BotaoExcluir tabela="turmas" id={t.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
