import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  BotaoExcluir,
  FormularioCadastro,
} from "@/components/formulario-cadastro";
import { GradeEditor } from "./grade-editor";

export default async function PaginaTurnos() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  const { data: turnos } = await supabase
    .from("turnos")
    .select("id, nome")
    .eq("unidade_id", perfil.unidade_id)
    .order("criado_em");
  const { data: slots } = await supabase
    .from("slots")
    .select("turno_id, dia, ordem, hora_inicio, hora_fim")
    .eq("unidade_id", perfil.unidade_id)
    .order("ordem");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Turnos</h1>
        <FormularioCadastro
          tabela="turnos"
          campos={[{ nome: "nome", rotulo: "Nome do turno", tipo: "texto" }]}
        />
      </div>
      {(turnos ?? []).map((t) => {
        const doTurno = (slots ?? []).filter((s) => s.turno_id === t.id);
        const dias = [...new Set(doTurno.map((s) => s.dia))].sort();
        const horarios = doTurno
          .filter((s) => s.dia === dias[0])
          .sort((a, b) => a.ordem - b.ordem)
          .map((s) => ({
            hora_inicio: (s.hora_inicio ?? "").slice(0, 5),
            hora_fim: (s.hora_fim ?? "").slice(0, 5),
          }));
        return (
          <section key={t.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">{t.nome}</h2>
              <span className="text-sm text-muted-foreground">
                {doTurno.length} slots
              </span>
              <FormularioCadastro
                tabela="turnos"
                campos={[{ nome: "nome", rotulo: "Nome", tipo: "texto" }]}
                registro={{ id: t.id, nome: t.nome }}
              />
              <BotaoExcluir tabela="turnos" id={t.id} />
            </div>
            <GradeEditor
              turnoId={t.id}
              diasIniciais={dias}
              horariosIniciais={horarios}
            />
          </section>
        );
      })}
      {(turnos ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum turno ainda. Crie o primeiro para montar a grade de horários.
        </p>
      )}
    </div>
  );
}
