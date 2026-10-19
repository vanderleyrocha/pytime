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

/**
 * Onde o motivo aparece: na geração (o cadastro precisa mudar) ou na edição
 * manual (basta mover aulas na grade) — muda a sugestão de como resolver.
 */
type Contexto = "geracao" | "edicao";

function plural(n: number, singular: string, varios: string): string {
  return `${n} ${n === 1 ? singular : varios}`;
}

/**
 * Máximo de pares disjuntos de horários seguidos da turma (só os com aula)
 * em que o professor não está indisponível (cota superior dos pares geminados possíveis).
 */
function paresLivres(
  atribuicao: InstanciaMotor["atribuicoes"][number],
  instancia: InstanciaMotor,
): number {
  const turma = instancia.turmas.find((t) => t.id === atribuicao.turma_id);
  const prof = instancia.professores.find(
    (p) => p.id === atribuicao.professor_id,
  );
  if (!turma) return 0;
  const livre = (slotId: string) =>
    prof?.disponibilidade[slotId] !== "indisponivel";
  const slots = instancia.slots
    .filter(
      (s) =>
        s.turno_id === turma.turno_id &&
        turma.disponibilidade?.[s.id] !== "indisponivel",
    )
    .sort((a, b) => a.dia - b.dia || a.ordem - b.ordem);
  let pares = 0;
  for (let i = 0; i + 1 < slots.length; i++) {
    const [s1, s2] = [slots[i], slots[i + 1]];
    if (s1.dia !== s2.dia || s2.ordem !== s1.ordem + 1) continue;
    if (livre(s1.id) && livre(s2.id)) {
      pares++;
      i++; // pares disjuntos: o segundo horário já foi usado
    }
  }
  return pares;
}

/**
 * Diagnóstico das geminadas na geração, da causa mais certa para a mais
 * provável: carga que não comporta os pares → disponibilidade sem horários
 * seguidos → concorrência com outras aulas (só sugestões).
 */
function explicarGeminadas(
  id: string,
  instancia: InstanciaMotor,
  nomes: Nomes,
  contexto: Contexto,
): string {
  const descricao = descreverAtribuicao(id, instancia, nomes);
  const a = instancia.atribuicoes.find((x) => x.id === id);
  if (contexto === "edicao" || !a) {
    return `Aulas geminadas de ${descricao}: faltam pares de aulas consecutivas. Como resolver: mova as aulas para horários seguidos no mesmo dia.`;
  }
  const pares = plural(a.geminadas, "par", "pares");
  const maximo = Math.floor(a.carga_semanal / 2);
  if (a.geminadas > maximo) {
    return `Aulas geminadas de ${descricao}: ${pares} exigem ${2 * a.geminadas} aulas, mas a carga semanal de ${plural(a.carga_semanal, "aula", "aulas")} comporta no máximo ${plural(maximo, "par", "pares")}. Como resolver: em Atribuições, reduza "Geminadas (pares)" para ${maximo} ou aumente a carga semanal.`;
  }
  const prof = nomes.professores.get(a.professor_id) ?? "o professor";
  const livres = paresLivres(a, instancia);
  if (livres < a.geminadas) {
    return `Aulas geminadas de ${descricao}: são exigidos ${pares}, mas ${prof} só tem ${plural(livres, "par de horários seguidos disponível", "pares de horários seguidos disponíveis")} no turno da turma. Como resolver: libere horários seguidos na disponibilidade de ${prof} ou, em Atribuições, reduza "Geminadas (pares)" para ${livres}.`;
  }
  return `Aulas geminadas de ${descricao}: não sobram horários seguidos para os ${pares} exigidos. Como resolver: confira se ${prof} não tem aulas em outras turmas justamente nos horários seguidos que restam (libere mais horários na disponibilidade ou redistribua essas aulas) e se outras regras obrigatórias não ocupam esses horários; se não der, reduza "Geminadas (pares)" em Atribuições.`;
}

function traduzirMotivo(
  motivo: string,
  instancia: InstanciaMotor,
  nomes: Nomes,
  contexto: Contexto,
): string {
  const [prefixo, ...resto] = motivo.split(":");
  const id = resto.join(":");

  switch (prefixo) {
    case "disponibilidade": {
      const nome = nomes.professores.get(id) ?? `um professor removido (${id})`;
      return `Disponibilidade de ${nome}: os horários indisponíveis conflitam com as aulas atribuídas. Como resolver: libere mais horários na disponibilidade do professor ou reduza a carga dele.`;
    }
    case "disponibilidade_disciplina": {
      const nome =
        nomes.disciplinas.get(id) ?? `uma disciplina removida (${id})`;
      return `Disponibilidade da disciplina ${nome}: os horários indisponíveis não comportam as aulas atribuídas. Como resolver: libere mais horários na disponibilidade da disciplina (Disciplinas), reduza a carga dela ou desative a regra "${CATALOGO_REGRAS.disponibilidade_disciplina.rotulo}" em Regras.`;
    }
    case "geminadas":
      return explicarGeminadas(id, instancia, nomes, contexto);
    case "recurso": {
      const nome = nomes.recursos.get(id) ?? `um recurso removido (${id})`;
      return `Recurso ${nome}: a capacidade não comporta as aulas que o usam nos mesmos horários. Como resolver: aumente a capacidade do recurso ou retire-o de algumas atribuições.`;
    }
    case "nao_mesmo_dia": {
      const p = instancia.regras.find((r) => r.id === id)?.parametros ?? {};
      const a = nomes.disciplinas.get(String(p.disciplina_a)) ?? "?";
      const b = nomes.disciplinas.get(String(p.disciplina_b)) ?? "?";
      return `Regra "${CATALOGO_REGRAS.nao_mesmo_dia.rotulo}" (${a} e ${b}): não é possível manter as duas disciplinas em dias diferentes. Como resolver: desative a regra ou torne-a preferencial (não obrigatória) em Regras.`;
    }
    case "ultimo_horario": {
      const p = instancia.regras.find((r) => r.id === id)?.parametros ?? {};
      const d = nomes.disciplinas.get(String(p.disciplina_id)) ?? "?";
      return `Regra "${CATALOGO_REGRAS.ultimo_horario.rotulo}" (${d}): não é possível evitar o último horário do dia. Como resolver: desative a regra ou torne-a preferencial (não obrigatória) em Regras.`;
    }
    case "aulas_juntas": {
      const turma = nomes.turmas.get(id) ?? `uma turma removida (${id})`;
      return `Regra "${CATALOGO_REGRAS.aulas_juntas.rotulo}" (${turma}): não é possível manter juntas as aulas de cada disciplina no mesmo dia. Como resolver: desative a regra ou torne-a preferencial (não obrigatória) em Regras.`;
    }
    case "disciplina_sincronizada": {
      const p = instancia.regras.find((r) => r.id === id)?.parametros ?? {};
      const d = nomes.disciplinas.get(String(p.disciplina_id)) ?? "?";
      return `Regra "${CATALOGO_REGRAS.disciplina_sincronizada.rotulo}" (${d}): não é possível pôr a disciplina nos mesmos horários em todas as turmas — confira se a carga é igual em todas, se os professores estão disponíveis nesses horários e se as turmas não têm horários sem aula diferentes. Como resolver: iguale a carga, libere esses horários na disponibilidade dos professores ou desative a regra em Regras.`;
    }
    case "estrutural": {
      const detalhe = traduzirEstrutural(resto, instancia, nomes);
      if (detalhe) return detalhe;
      const texto = id.trim();
      return texto.charAt(0).toUpperCase() + texto.slice(1);
    }
    case "instancia":
      return substituirIds(id, nomes.todos);
    default:
      return substituirIds(motivo, nomes.todos);
  }
}

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function descreverSlot(id: string, instancia: InstanciaMotor): string {
  const s = instancia.slots.find((x) => x.id === id);
  return s
    ? `${DIAS[s.dia] ?? `dia ${s.dia}`} ${s.ordem + 1}º horário`
    : "horário removido";
}

/**
 * Motivos estruturais do avaliador (`estrutural:<tipo>:<id>[:<slot>]`,
 * `pytime_engine.avaliador`). Devolve null para o formato antigo do solver
 * (`estrutural: <frase>`), tratado por quem chama.
 */
function traduzirEstrutural(
  partes: string[],
  instancia: InstanciaMotor,
  nomes: Nomes,
): string | null {
  const [tipo, id, slot] = partes;
  const quando = slot ? descreverSlot(slot, instancia) : "";
  const turma = () => nomes.turmas.get(id) ?? "turma removida";
  switch (tipo) {
    case "professor_duplo": {
      const prof = nomes.professores.get(id) ?? "um professor removido";
      return `${prof} tem duas aulas ao mesmo tempo (${quando}).`;
    }
    case "turma_duplo":
      return `${turma()} tem duas aulas no mesmo horário (${quando}).`;
    case "turma_vazio":
      return `${turma()} ficou sem aula em ${quando}.`;
    case "turma_indisponivel":
      return `${turma()} não tem aula em ${quando} (horário sem aula da turma).`;
    case "fora_do_turno":
      return `${descreverAtribuicao(id, instancia, nomes)}: aula em ${quando}, fora do turno da turma.`;
    case "carga":
      return `${descreverAtribuicao(id, instancia, nomes)}: número de aulas diferente da carga semanal.`;
    case "atribuicao_desconhecida":
      return `Aula de uma atribuição que não existe mais (${id}).`;
    default:
      return null;
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
  return motivos.map((m) => traduzirMotivo(m, instancia, nomes, "geracao"));
}

export type MotivoTraduzido = { texto: string; slotIds: string[] };

/**
 * Como `traduzirNucleo`, para as violações de uma grade editada: devolve
 * também os horários a destacar (o slot dos motivos estruturais).
 */
export function traduzirViolacoes(
  motivos: string[],
  instancia: InstanciaMotor,
): MotivoTraduzido[] {
  const nomes = indexar(instancia);
  return motivos.map((m) => {
    const partes = m.split(":");
    const slot =
      partes[0] === "estrutural" && partes.length >= 4 ? partes[3] : null;
    return {
      texto: traduzirMotivo(m, instancia, nomes, "edicao"),
      slotIds: slot ? [slot] : [],
    };
  });
}
