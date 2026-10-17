import type { InstanciaMotor } from "@/lib/instancia";
import { CATALOGO_REGRAS } from "@/lib/validacao/regras";

type Nomes = {
  professores: Map<string, string>;
  disciplinas: Map<string, string>;
  turmas: Map<string, string>;
  recursos: Map<string, string>;
  /** Todos os ids nomeáveis → nome legível (para mensagens livres). */
  todos: Map<string, string>;
};

function indexar(instancia: InstanciaMotor): Nomes {
  const mapa = (itens: { id: string; nome: string }[]) =>
    new Map(itens.map((i) => [i.id, i.nome]));
  const professores = mapa(instancia.professores);
  const disciplinas = mapa(instancia.disciplinas);
  const turmas = mapa(instancia.turmas);
  const recursos = mapa(instancia.recursos);
  const todos = new Map([
    ...mapa(instancia.turnos),
    ...turmas,
    ...disciplinas,
    ...professores,
    ...recursos,
  ]);
  for (const a of instancia.atribuicoes) {
    todos.set(
      a.id,
      descreverAtribuicao(a.id, instancia, {
        professores,
        disciplinas,
        turmas,
      }),
    );
  }
  return { professores, disciplinas, turmas, recursos, todos };
}

function descreverAtribuicao(
  id: string,
  instancia: InstanciaMotor,
  nomes: Pick<Nomes, "professores" | "disciplinas" | "turmas">,
): string {
  const a = instancia.atribuicoes.find((x) => x.id === id);
  if (!a) return `uma atribuição removida (${id})`;
  const disc = nomes.disciplinas.get(a.disciplina_id) ?? "disciplina removida";
  const turma = nomes.turmas.get(a.turma_id) ?? "turma removida";
  const prof = nomes.professores.get(a.professor_id) ?? "professor removido";
  return `${disc} em ${turma} (${prof})`;
}

function traduzirMotivo(
  motivo: string,
  instancia: InstanciaMotor,
  nomes: Nomes,
): string {
  const [prefixo, ...resto] = motivo.split(":");
  const id = resto.join(":");

  switch (prefixo) {
    case "disponibilidade": {
      const nome = nomes.professores.get(id) ?? `um professor removido (${id})`;
      return `Disponibilidade de ${nome}: os horários indisponíveis conflitam com as aulas atribuídas.`;
    }
    case "geminadas":
      return `Aulas geminadas de ${descreverAtribuicao(id, instancia, nomes)}: os pares de aulas consecutivas exigidos não cabem na grade.`;
    case "recurso": {
      const nome = nomes.recursos.get(id) ?? `um recurso removido (${id})`;
      return `Recurso ${nome}: a capacidade não comporta as aulas que o usam nos mesmos horários.`;
    }
    case "nao_mesmo_dia": {
      const p = instancia.regras.find((r) => r.id === id)?.parametros ?? {};
      const a = nomes.disciplinas.get(String(p.disciplina_a)) ?? "?";
      const b = nomes.disciplinas.get(String(p.disciplina_b)) ?? "?";
      return `Regra "${CATALOGO_REGRAS.nao_mesmo_dia.rotulo}" (${a} e ${b}): não é possível manter as duas disciplinas em dias diferentes.`;
    }
    case "ultimo_horario": {
      const p = instancia.regras.find((r) => r.id === id)?.parametros ?? {};
      const d = nomes.disciplinas.get(String(p.disciplina_id)) ?? "?";
      return `Regra "${CATALOGO_REGRAS.ultimo_horario.rotulo}" (${d}): não é possível evitar o último horário do dia.`;
    }
    case "estrutural": {
      const texto = id.trim();
      return texto.charAt(0).toUpperCase() + texto.slice(1);
    }
    default:
      return substituirIds(motivo, nomes.todos);
  }
}

/** Troca ids conhecidos (inclusive entre aspas) pelo nome legível. */
function substituirIds(texto: string, todos: Map<string, string>): string {
  let saida = texto;
  for (const [id, nome] of todos) {
    saida = saida
      .replaceAll(`'${id}'`, nome)
      .replace(new RegExp(`\\b${escaparRegex(id)}\\b`, "g"), nome);
  }
  return saida;
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Converte o núcleo de conflito do motor (ex. `disponibilidade:<uuid>`) em
 * frases em português com os nomes do snapshot da instância da geração.
 * Sem instância, devolve os motivos como vieram.
 */
export function traduzirNucleo(
  motivos: string[],
  instancia: InstanciaMotor | null,
): string[] {
  if (!instancia) return motivos;
  const nomes = indexar(instancia);
  return motivos.map((m) => traduzirMotivo(m, instancia, nomes));
}
