import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PaginaPainel() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();

  async function contar(tabela: string): Promise<number> {
    const { count } = await supabase
      .from(tabela)
      .select("*", { count: "exact", head: true })
      .eq("unidade_id", perfil.unidade_id);
    return count ?? 0;
  }

  const [turmas, professores, disciplinas] = await Promise.all([
    contar("turmas"),
    contar("professores"),
    contar("disciplinas"),
  ]);
  const { data: ultima } = await supabase
    .from("geracoes")
    .select("status, criada_em")
    .eq("unidade_id", perfil.unidade_id)
    .order("criada_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cartoes = [
    { titulo: "Turmas", valor: turmas },
    { titulo: "Professores", valor: professores },
    { titulo: "Disciplinas", valor: disciplinas },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{perfil.unidade_nome}</h1>
      <div className="grid grid-cols-3 gap-4">
        {cartoes.map((c) => (
          <Card key={c.titulo}>
            <CardHeader>
              <CardTitle className="text-sm">{c.titulo}</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{c.valor}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Última geração</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {ultima
            ? `${ultima.status} em ${new Date(ultima.criada_em).toLocaleString("pt-BR")}`
            : "Nenhuma geração ainda. Cadastros e geração chegam nas próximas fases."}
        </CardContent>
      </Card>
    </div>
  );
}
