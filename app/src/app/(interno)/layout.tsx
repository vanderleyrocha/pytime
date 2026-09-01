import { redirect } from "next/navigation";
import { obterPerfis } from "@/lib/perfis";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { BarraLateral } from "@/components/barra-lateral";

export default async function LayoutInterno({
  children,
}: {
  children: React.ReactNode;
}) {
  const perfis = await obterPerfis();
  if (perfis.length === 0) {
    redirect("/criar-escola");
  }
  const ativa = await obterUnidadeAtiva();
  return (
    <div className="flex min-h-screen">
      <BarraLateral perfis={perfis} ativa={ativa!} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
