import Link from "next/link";
import { z } from "zod";
import { criarClienteServico } from "@/lib/supabase/cliente-servico";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { FormularioAceite } from "./formulario";

export default async function PaginaConvite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!z.uuid().safeParse(token).success) {
    return <Aviso titulo="Convite inválido" texto="Confira o link recebido." />;
  }

  // Leitura via service_role: o convidado ainda não é membro da unidade,
  // então o RLS (convites só para admin) o bloquearia. Somente leitura
  // dos campos exibidos; o aceite em si passa pela RPC com o JWT do usuário.
  const servico = criarClienteServico();
  const { data: convite } = await servico
    .from("convites")
    .select("email, papel, expira_em, aceito_em, unidades(nome)")
    .eq("token", token)
    .maybeSingle();

  if (!convite) {
    return <Aviso titulo="Convite não encontrado" texto="Confira o link recebido." />;
  }
  if (convite.aceito_em) {
    return <Aviso titulo="Convite já utilizado" texto="Faça login para acessar." />;
  }
  if (new Date(convite.expira_em) < new Date()) {
    return <Aviso titulo="Convite expirado" texto="Peça um novo convite ao administrador." />;
  }

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nomeUnidade =
    (convite.unidades as unknown as { nome: string } | null)?.nome ?? "a escola";

  if (!user) {
    const proximo = encodeURIComponent(`/convite/${token}`);
    return (
      <div className="mx-auto mt-24 w-96">
        <h1 className="text-2xl font-bold">Convite para {nomeUnidade}</h1>
        <p className="mt-2 text-sm">
          Convite para <strong>{convite.email}</strong> como{" "}
          <strong>{convite.papel}</strong>. Entre ou crie a conta com esse
          e-mail para aceitar:
        </p>
        <div className="mt-4 flex gap-4 text-sm underline">
          <Link href={`/login?proximo=${proximo}`}>Entrar</Link>
          <Link href="/cadastro">Criar conta</Link>
        </div>
      </div>
    );
  }

  return (
    <FormularioAceite
      token={token}
      nomeUnidade={nomeUnidade}
      papel={convite.papel}
    />
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mx-auto mt-24 w-96">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <p className="mt-2 text-sm">{texto}</p>
    </div>
  );
}
