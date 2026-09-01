import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { revogarConvite } from "./actions";
import { FormularioConvite } from "./formulario";
import { Button } from "@/components/ui/button";

export default async function PaginaConvites() {
  const perfil = await obterUnidadeAtiva();
  if (!perfil) redirect("/criar-escola");
  if (perfil.papel !== "admin") redirect("/painel");

  const supabase = await criarClienteServidor();
  const { data: convites } = await supabase
    .from("convites")
    .select("id, email, papel, token, expira_em, aceito_em")
    .eq("unidade_id", perfil.unidade_id)
    .order("criado_em", { ascending: false });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Convites</h1>
      <FormularioConvite />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">E-mail</th>
            <th>Papel</th>
            <th>Situação</th>
            <th>Link</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(convites ?? []).map((c) => {
            const expirado = new Date(c.expira_em) < new Date();
            const situacao = c.aceito_em
              ? "Aceito"
              : expirado
                ? "Expirado"
                : "Pendente";
            return (
              <tr key={c.id} className="border-b">
                <td className="py-2">{c.email}</td>
                <td>{c.papel}</td>
                <td>{situacao}</td>
                <td>
                  {situacao === "Pendente" && (
                    <code className="text-xs">/convite/{c.token}</code>
                  )}
                </td>
                <td>
                  {situacao === "Pendente" && (
                    <form action={revogarConvite}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button variant="destructive" size="sm" type="submit">
                        Revogar
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
