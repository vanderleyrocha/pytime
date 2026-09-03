import Link from "next/link";
import type { Perfil } from "@/lib/perfis";
import { sair } from "@/app/(publico)/login/actions";
import { SeletorUnidade } from "@/components/seletor-unidade";
import { Button } from "@/components/ui/button";

export function BarraLateral({
  perfis,
  ativa,
}: {
  perfis: Perfil[];
  ativa: Perfil;
}) {
  return (
    <aside className="flex w-60 flex-col gap-6 border-r p-4">
      <div>
        <div className="text-lg font-bold">PyTime</div>
        {perfis.length > 1 ? (
          <SeletorUnidade perfis={perfis} ativa={ativa.unidade_id} />
        ) : (
          <div className="text-sm text-muted-foreground">
            {ativa.unidade_nome}
          </div>
        )}
      </div>
      <nav className="flex flex-col gap-2 text-sm">
        <Link href="/painel">Painel</Link>
        <Link href="/turnos">Turnos</Link>
        <Link href="/turmas">Turmas</Link>
        <Link href="/disciplinas">Disciplinas</Link>
        <Link href="/professores">Professores</Link>
        <Link href="/recursos">Recursos</Link>
        <Link href="/atribuicoes">Atribuições</Link>
        <Link href="/regras">Regras</Link>
        {ativa.papel === "admin" && <Link href="/convites">Convites</Link>}
        {/* Rotas de gerações entram no plano 2C */}
      </nav>
      <form action={sair} className="mt-auto">
        <Button variant="outline" size="sm" type="submit">
          Sair
        </Button>
      </form>
    </aside>
  );
}
