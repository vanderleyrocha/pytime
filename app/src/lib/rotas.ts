const PREFIXOS_PUBLICOS = ["/login", "/cadastro", "/convite"];

export function ehRotaPublica(pathname: string): boolean {
  return PREFIXOS_PUBLICOS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}
