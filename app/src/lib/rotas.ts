const PREFIXOS_PUBLICOS = ["/login", "/cadastro", "/convite", "/auth", "/definir-senha"];

export function ehRotaPublica(pathname: string): boolean {
  return PREFIXOS_PUBLICOS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export function ehCaminhoInterno(destino: string): boolean {
  return (
    destino.startsWith("/") &&
    !destino.startsWith("//") &&
    !destino.startsWith("/\\")
  );
}
