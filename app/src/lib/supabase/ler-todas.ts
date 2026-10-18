/**
 * Linhas por página: igual ao `max_rows` do PostgREST (supabase/config.toml
 * e padrão do Supabase hospedado). Nunca acima dele: uma página cortada
 * pelo servidor pareceria a última.
 */
const TAMANHO_PAGINA = 1000;

/**
 * Lê todas as linhas de uma consulta, página a página. O PostgREST corta
 * cada resposta em `max_rows` sem avisar, então consultas que podem passar
 * disso (aulas de um cenário, disponibilidades...) precisam paginar.
 *
 * `montar(de, ate)` devolve a consulta com `.range(de, ate)` e uma ordem
 * estável (por chave única), senão as páginas podem repetir ou pular linhas.
 */
export async function lerTodas<T, E>(
  montar: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: E | null }>,
): Promise<{ data: T[] | null; error: E | null }> {
  const linhas: T[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await montar(de, de + TAMANHO_PAGINA - 1);
    if (error) return { data: null, error };
    linhas.push(...(data ?? []));
    if ((data?.length ?? 0) < TAMANHO_PAGINA)
      return { data: linhas, error: null };
  }
}
