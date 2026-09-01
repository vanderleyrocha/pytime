import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";

export type Perfil = {
  unidade_id: string;
  papel: "admin" | "coordenador" | "professor";
  unidade_nome: string;
};

export async function obterPerfis(): Promise<Perfil[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("perfis")
    .select("unidade_id, papel, unidades(nome)")
    .order("criado_em");
  if (error || !data) return [];
  return data.map((p) => ({
    unidade_id: p.unidade_id,
    papel: p.papel,
    unidade_nome:
      (p.unidades as unknown as { nome: string } | null)?.nome ?? "Unidade",
  }));
}
