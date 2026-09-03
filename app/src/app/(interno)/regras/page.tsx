import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { CATALOGO_REGRAS, type TipoRegra } from "@/lib/validacao/regras";
import {
  AcoesRegra,
  FormularioRegra,
  type RegraExistente,
} from "./formulario";

export default async function PaginaRegras() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  const [{ data: regras }, { data: disciplinas }] = await Promise.all([
    supabase
      .from("regras")
      .select("id, tipo, hard, peso, ativa, parametros")
      .eq("unidade_id", perfil.unidade_id)
      .order("criada_em"),
    supabase
      .from("disciplinas")
      .select("id, nome")
      .eq("unidade_id", perfil.unidade_id)
      .order("nome"),
  ]);

  const opcoesDisciplinas = (disciplinas ?? []).map((d) => ({
    valor: d.id,
    rotulo: d.nome,
  }));
  const nomeDisciplina = Object.fromEntries(
    (disciplinas ?? []).map((d) => [d.id, d.nome]),
  );

  function resumo(regra: RegraExistente): string {
    const p = regra.parametros;
    switch (regra.tipo) {
      case "distribuicao_disciplina":
        return `máx. ${p.max_por_dia}/dia`;
      case "ultimo_horario":
        return nomeDisciplina[p.disciplina_id as string] ?? "";
      case "preferencia_disciplina":
        return `${nomeDisciplina[p.disciplina_id as string] ?? ""} ${p.modo} ${(
          p.ordens as number[]
        )
          .map((o) => `${o + 1}º`)
          .join(", ")}`;
      case "nao_mesmo_dia":
        return `${nomeDisciplina[p.disciplina_a as string] ?? ""} × ${
          nomeDisciplina[p.disciplina_b as string] ?? ""
        }`;
      default:
        return "—";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Regras do horário</h1>
        <FormularioRegra disciplinas={opcoesDisciplinas} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Regra</th>
            <th>Aplicação</th>
            <th>Peso</th>
            <th>Parâmetros</th>
            <th>Situação</th>
            <th className="w-64"></th>
          </tr>
        </thead>
        <tbody>
          {(regras ?? []).map((r) => {
            const regra: RegraExistente = {
              id: r.id,
              tipo: r.tipo as TipoRegra,
              hard: r.hard,
              peso: r.peso,
              ativa: r.ativa,
              parametros: (r.parametros ?? {}) as Record<string, unknown>,
            };
            return (
              <tr key={r.id} className="border-b">
                <td className="py-2">
                  {CATALOGO_REGRAS[regra.tipo]?.rotulo ?? regra.tipo}
                </td>
                <td>{r.hard ? "Obrigatória" : "Preferencial"}</td>
                <td>{r.peso}</td>
                <td>{resumo(regra)}</td>
                <td>{r.ativa ? "Ativa" : "Inativa"}</td>
                <td className="flex gap-2 py-2">
                  <FormularioRegra
                    disciplinas={opcoesDisciplinas}
                    registro={regra}
                  />
                  <AcoesRegra regra={regra} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(regras ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma regra configurada. As regras estruturais (professor sem
          choque, turma sempre ocupada) valem sempre; adicione aqui as demais.
        </p>
      )}
    </div>
  );
}
