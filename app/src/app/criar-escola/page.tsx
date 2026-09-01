import { redirect } from "next/navigation";
import { obterPerfis } from "@/lib/perfis";
import { FormularioEscola } from "./formulario";

export default async function PaginaCriarEscola() {
  const perfis = await obterPerfis();
  if (perfis.length > 0) {
    redirect("/painel");
  }
  return <FormularioEscola />;
}
