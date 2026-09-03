import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  BotaoExcluir,
  FormularioCadastro,
} from "@/components/formulario-cadastro";

export default async function PaginaDisciplinas() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  const { data: disciplinas } = await supabase
    .from("disciplinas")
    .select("id, nome")
    .eq("unidade_id", perfil.unidade_id)
    .order("nome");

  const campos = [{ nome: "nome", rotulo: "Nome", tipo: "texto" as const }];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Disciplinas</h1>
        <FormularioCadastro tabela="disciplinas" campos={campos} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nome</th>
            <th className="w-48"></th>
          </tr>
        </thead>
        <tbody>
          {(disciplinas ?? []).map((d) => (
            <tr key={d.id} className="border-b">
              <td className="py-2">{d.nome}</td>
              <td className="flex gap-2 py-2">
                <FormularioCadastro
                  tabela="disciplinas"
                  campos={campos}
                  registro={d}
                />
                <BotaoExcluir tabela="disciplinas" id={d.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
