import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { FormularioImportar } from "./formulario";

export default async function PaginaImportar() {
  const perfil = (await obterUnidadeAtiva())!;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Importar dados</h1>
      {perfil.papel === "professor" ? (
        <p className="text-sm text-muted-foreground">
          Apenas gestores importam dados.
        </p>
      ) : (
        <>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Carregue turnos, horários, turmas, disciplinas, professores,
            recursos, disponibilidades, atribuições e regras a partir do
            pacote exportado pelo sistema de gestão escolar (formato em
            docs/carga). Registros são inseridos ou atualizados pelo código;
            nada é apagado. Valide antes de importar.
          </p>
          <FormularioImportar />
        </>
      )}
    </div>
  );
}
