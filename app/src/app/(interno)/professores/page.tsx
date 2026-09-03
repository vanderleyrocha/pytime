import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  BotaoExcluir,
  FormularioCadastro,
} from "@/components/formulario-cadastro";

export default async function PaginaProfessores() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  const { data: professores } = await supabase
    .from("professores")
    .select("id, nome")
    .eq("unidade_id", perfil.unidade_id)
    .order("nome");

  const campos = [{ nome: "nome", rotulo: "Nome", tipo: "texto" as const }];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Professores</h1>
        <FormularioCadastro tabela="professores" campos={campos} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nome</th>
            <th className="w-72"></th>
          </tr>
        </thead>
        <tbody>
          {(professores ?? []).map((p) => (
            <tr key={p.id} className="border-b">
              <td className="py-2">{p.nome}</td>
              <td className="flex gap-2 py-2">
                <Link
                  className="inline-flex h-8 items-center rounded-md border px-3 text-sm underline-offset-2 hover:underline"
                  href={`/professores/${p.id}/disponibilidade`}
                >
                  Disponibilidade
                </Link>
                <FormularioCadastro
                  tabela="professores"
                  campos={campos}
                  registro={p}
                />
                <BotaoExcluir tabela="professores" id={p.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
