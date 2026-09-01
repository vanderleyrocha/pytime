"""Executa os testes pgTAP de supabase/tests contra o banco remoto.

Uso: python supabase/tests/rodar_testes.py [arquivos .test.sql...]
Sem argumentos, roda todos os supabase/tests/*.test.sql em ordem.
Conexão: variável de ambiente SUPABASE_DB_URL.
"""

import os
import pathlib
import sys

import psycopg

def rodar_arquivo(conn: psycopg.Connection, caminho: pathlib.Path) -> bool:
    sql = caminho.read_text(encoding="utf-8")
    linhas: list[str] = []
    with conn.cursor() as cur:
        cur.execute(sql)
        while True:
            if cur.description is not None:
                for row in cur.fetchall():
                    if row and isinstance(row[0], str):
                        linhas.append(row[0])
            if not cur.nextset():
                break
    print(f"== {caminho.name}")
    for linha in linhas:
        print(linha)
    falhas = [l for l in linhas if l.startswith("not ok")]
    plano_quebrado = [l for l in linhas if l.startswith("# Looks like")]
    ok = not falhas and not plano_quebrado and any(l.startswith("ok") for l in linhas)
    if not ok:
        print(f"FALHA em {caminho.name}")
    return ok

def main() -> int:
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        print("Defina SUPABASE_DB_URL com a string de conexão do banco.")
        return 2
    pasta = pathlib.Path(__file__).parent
    if len(sys.argv) > 1:
        arquivos = [pathlib.Path(a) for a in sys.argv[1:]]
    else:
        arquivos = sorted(pasta.glob("*.test.sql"))
    if not arquivos:
        print("Nenhum arquivo de teste encontrado.")
        return 2
    tudo_ok = True
    with psycopg.connect(url, autocommit=True) as conn:
        for caminho in arquivos:
            tudo_ok = rodar_arquivo(conn, caminho) and tudo_ok
    print("RESULTADO:", "OK" if tudo_ok else "FALHA")
    return 0 if tudo_ok else 1

if __name__ == "__main__":
    raise SystemExit(main())
