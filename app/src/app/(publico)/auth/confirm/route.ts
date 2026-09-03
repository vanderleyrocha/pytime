import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { ehCaminhoInterno } from "@/lib/rotas";

/** Normaliza `next`: aceita caminho interno ou URL absoluta do próprio site. */
function destinoSeguro(bruto: string | null, origem: string): string {
  if (!bruto) return "/painel";
  let caminho = bruto;
  if (bruto.startsWith(origem)) {
    const u = new URL(bruto);
    caminho = u.pathname + u.search;
  }
  return ehCaminhoInterno(caminho) ? caminho : "/painel";
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const codigo = url.searchParams.get("code");
  const destino = destinoSeguro(url.searchParams.get("next"), url.origin);

  const supabase = await criarClienteServidor();

  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({
      type: tipo,
      token_hash: tokenHash,
    });
    if (!error) {
      // Convidado acabou de entrar sem senha: força a definição antes de seguir.
      const alvo =
        tipo === "invite"
          ? `/definir-senha?next=${encodeURIComponent(destino)}`
          : destino;
      return NextResponse.redirect(new URL(alvo, url.origin));
    }
  } else if (codigo) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) {
      return NextResponse.redirect(new URL(destino, url.origin));
    }
  }
  return NextResponse.redirect(
    new URL("/login?erro=link-invalido", url.origin),
  );
}
