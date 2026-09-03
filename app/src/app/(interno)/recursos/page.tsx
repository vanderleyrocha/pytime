import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  BotaoExcluir,
  FormularioCadastro,
} from "@/components/formulario-cadastro";

export default async function PaginaRecursos() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  const { data: recursos } = await supabase
    .from("recursos")
    .select("id, nome, capacidade")
    .eq("unidade_id", perfil.unidade_id)
    .order("nome");

  const campos = [
    { nome: "nome", rotulo: "Nome", tipo: "texto" as const },
    { nome: "capacidade", rotulo: "Capacidade", tipo: "numero" as const },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recursos</h1>
        <FormularioCadastro tabela="recursos" campos={campos} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nome</th>
            <th>Capacidade</th>
            <th className="w-48"></th>
          </tr>
        </thead>
        <tbody>
          {(recursos ?? []).map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2">{r.nome}</td>
              <td>{r.capacidade}</td>
              <td className="flex gap-2 py-2">
                <FormularioCadastro
                  tabela="recursos"
                  campos={campos}
                  registro={r}
                />
                <BotaoExcluir tabela="recursos" id={r.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
