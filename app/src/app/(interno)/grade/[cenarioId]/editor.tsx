"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { deltaCusto, type Avaliacao } from "@/lib/edicao/avaliacao";
import { MENSAGEM_CONFLITO } from "@/lib/edicao/acoes";
import { reaplicarTrocas, vizinho, type Direcao } from "@/lib/edicao/grade";
import {
  alterado,
  desfazer,
  novoRascunho,
  refazer,
  trocar,
  type Aula,
  type Rascunho,
} from "@/lib/edicao/trocas";
import type { MotivoTraduzido } from "@/lib/nucleo";
import { avaliarRascunho, salvarCenario } from "./actions";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const TECLAS: Record<string, Direcao> = {
  ArrowUp: "cima",
  ArrowDown: "baixo",
  ArrowLeft: "esquerda",
  ArrowRight: "direita",
};

type Slot = { id: string; dia: number; ordem: number; turno_id: string };
type Turma = { id: string; nome: string; turno_id: string };

export type PropsEditor = {
  cenarioId: string;
  versao: number;
  oficial: boolean;
  aulas: Aula[];
  avaliacaoBase: Avaliacao | null;
  turmas: Turma[];
  slots: Slot[];
  turmaInicial: string;
  turmaDaAtribuicao: Record<string, string>;
  /** Horários sem aula por turma (snapshot da geração): não entram em troca. */
  semAula: Record<string, string[]>;
  rotulos: Record<string, { disciplina: string; professor: string }>;
  rotulosRegra: Record<string, string>;
};

/**
 * Edição manual: troca de aulas dentro da turma, com veredito do motor a
 * cada troca (sem gravar) e salvar explícito, que revalida no servidor.
 */
export function Editor(p: PropsEditor) {
  const router = useRouter();
  const [rascunho, setRascunho] = useState<Rascunho>(() =>
    novoRascunho(p.aulas),
  );
  const [turmaId, setTurmaId] = useState(p.turmaInicial);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null);
  const [violacoes, setViolacoes] = useState<MotivoTraduzido[]>([]);
  const [validando, setValidando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [conflito, setConflito] = useState(false);
  const [salvando, iniciarSalvar] = useTransition();
  const pedido = useRef(0);

  // Conflito de versão: depois do router.refresh() chega a versão salva por
  // outra pessoa; reaplica as trocas do rascunho sobre ela (ajuste de estado
  // durante o render, comparando com a versão do render anterior).
  const [versaoBase, setVersaoBase] = useState(p.versao);
  if (p.versao !== versaoBase) {
    setVersaoBase(p.versao);
    const r = reaplicarTrocas(p.aulas, rascunho.feitas, p.turmaDaAtribuicao);
    setRascunho(r.rascunho);
    setConflito(false);
    setErro(null);
    setValidando(true);
    setAviso(
      r.descartadas.length
        ? `${r.descartadas.length} troca(s) não cabiam mais na versão nova e foram descartadas.`
        : "Suas trocas foram reaplicadas sobre a versão salva por outra pessoa.",
    );
  }

  const slotsDoTurno = useMemo(() => {
    const turno = p.turmas.find((t) => t.id === turmaId)?.turno_id;
    return p.slots.filter((s) => s.turno_id === turno);
  }, [p.slots, p.turmas, turmaId]);
  // horários em que a turma tem aula: só eles entram em troca
  const slotsDaTurma = useMemo(() => {
    const sem = new Set(p.semAula[turmaId] ?? []);
    return slotsDoTurno.filter((s) => !sem.has(s.id));
  }, [slotsDoTurno, p.semAula, turmaId]);
  const dias = [...new Set(slotsDoTurno.map((s) => s.dia))].sort(
    (a, b) => a - b,
  );
  const ordens = [...new Set(slotsDoTurno.map((s) => s.ordem))].sort(
    (a, b) => a - b,
  );
  const aulaNoSlot = useMemo(() => {
    const m = new Map<string, Aula>();
    for (const a of rascunho.aulas) {
      if (p.turmaDaAtribuicao[a.atribuicao_id] === turmaId) m.set(a.slot_id, a);
    }
    return m;
  }, [rascunho.aulas, p.turmaDaAtribuicao, turmaId]);
  const mudou = alterado(rascunho, p.aulas);

  // Valores exibidos: sem trocas, vale o que está gravado.
  const emValidacao = mudou && validando;
  const violacoesVisiveis = mudou ? violacoes : [];
  const destacados = new Set(violacoesVisiveis.flatMap((v) => v.slotIds));
  const delta =
    mudou && !emValidacao && avaliacao
      ? deltaCusto(p.avaliacaoBase, avaliacao)
      : null;

  // Veredito do motor a cada mudança (debounce; respostas antigas são ignoradas).
  useEffect(() => {
    if (!mudou) return;
    const meu = ++pedido.current;
    const t = setTimeout(async () => {
      const r = await avaliarRascunho(p.cenarioId, rascunho.aulas);
      if (meu !== pedido.current) return;
      setValidando(false);
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      setAvaliacao(r.dados!.avaliacao);
      setViolacoes(r.violacoes ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [rascunho.aulas, mudou, p.cenarioId]);

  // Não perder o rascunho fechando a aba sem querer.
  useEffect(() => {
    if (!mudou) return;
    const segurar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [mudou]);

  const aplicar = useCallback(
    (f: (r: Rascunho) => Rascunho) => {
      let proximo: Rascunho;
      try {
        proximo = f(rascunho);
      } catch (e) {
        setErro((e as Error).message);
        return;
      }
      if (proximo === rascunho) return;
      setRascunho(proximo);
      setErro(null);
      setValidando(true);
    },
    [rascunho],
  );

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      aplicar((r) =>
        e.shiftKey
          ? refazer(r, p.turmaDaAtribuicao)
          : desfazer(r, p.turmaDaAtribuicao),
      );
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, [aplicar, p.turmaDaAtribuicao]);

  const clicar = (slotId: string) => {
    if (!aulaNoSlot.has(slotId)) return;
    if (!selecionado) {
      setSelecionado(slotId);
      return;
    }
    if (selecionado !== slotId) {
      const troca = { slotA: selecionado, slotB: slotId, turmaId };
      aplicar((r) => trocar(r, troca, p.turmaDaAtribuicao));
    }
    setSelecionado(null);
  };

  const teclado = (e: React.KeyboardEvent, slotId: string) => {
    const direcao = TECLAS[e.key];
    if (direcao) {
      e.preventDefault();
      const alvo = vizinho(slotsDaTurma, slotId, direcao);
      setFoco(alvo);
      document.getElementById(`celula-${alvo}`)?.focus();
    } else if (e.key === "Escape") {
      setSelecionado(null);
    }
  };

  const salvar = (forcar: boolean) =>
    iniciarSalvar(async () => {
      if (
        p.oficial &&
        !forcar &&
        !confirm(
          "Este é o horário oficial. Salvar muda o horário oficial da escola. Continuar?",
        )
      ) {
        return;
      }
      const r = await salvarCenario(
        p.cenarioId,
        versaoBase,
        rascunho.aulas,
        forcar,
      );
      if (r.erro === MENSAGEM_CONFLITO) {
        setConflito(true);
        setErro(r.erro);
        return;
      }
      if (r.erro && r.violacoes?.length && !forcar) {
        setViolacoes(r.violacoes);
        const lista = r.violacoes.map((v) => `• ${v.texto}`).join("\n");
        if (
          confirm(
            `A grade viola regras obrigatórias:\n\n${lista}\n\nSalvar mesmo assim?`,
          )
        ) {
          salvar(true);
        }
        return;
      }
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      router.push(`/grade/${p.cenarioId}?visao=turma&alvo=${turmaId}`);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label>
            Turma{" "}
            <select
              className="rounded border px-2 py-1"
              value={turmaId}
              onChange={(e) => {
                setTurmaId(e.target.value);
                setSelecionado(null);
              }}
            >
              {p.turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
          <button
            className="underline disabled:opacity-40"
            disabled={rascunho.feitas.length === 0}
            onClick={() => aplicar((r) => desfazer(r, p.turmaDaAtribuicao))}
          >
            Desfazer
          </button>
          <button
            className="underline disabled:opacity-40"
            disabled={rascunho.desfeitas.length === 0}
            onClick={() => aplicar((r) => refazer(r, p.turmaDaAtribuicao))}
          >
            Refazer
          </button>
          <span className="text-muted-foreground">
            Clique numa aula e depois em outro horário da turma para trocar
            (setas + Enter pelo teclado).
          </span>
        </div>

        <table className="border text-sm">
          <thead>
            <tr>
              <th className="border px-2 py-1"></th>
              {dias.map((d) => (
                <th key={d} className="border px-2 py-1">
                  {DIAS[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordens.map((o) => (
              <tr key={o}>
                <td className="border px-2 py-1 font-medium">{o + 1}º</td>
                {dias.map((d) => {
                  const slot = slotsDaTurma.find(
                    (s) => s.dia === d && s.ordem === o,
                  );
                  if (!slot) {
                    const semAula = slotsDoTurno.some(
                      (s) => s.dia === d && s.ordem === o,
                    );
                    return semAula ? (
                      <td
                        key={d}
                        title="Horário sem aula da turma"
                        className="border bg-gray-100 px-3 py-2 text-center text-xs text-muted-foreground"
                      >
                        sem aula
                      </td>
                    ) : (
                      <td key={d} className="border" />
                    );
                  }
                  const aula = aulaNoSlot.get(slot.id);
                  const rotulo = aula
                    ? p.rotulos[aula.atribuicao_id]
                    : undefined;
                  const marcado = selecionado === slot.id;
                  const focavel =
                    foco === slot.id ||
                    (!foco && o === ordens[0] && d === dias[0]);
                  return (
                    <td key={d} className="border p-0">
                      <button
                        id={`celula-${slot.id}`}
                        type="button"
                        aria-pressed={marcado}
                        tabIndex={focavel ? 0 : -1}
                        onClick={() => clicar(slot.id)}
                        onKeyDown={(e) => teclado(e, slot.id)}
                        onFocus={() => setFoco(slot.id)}
                        className={[
                          "h-full w-full px-3 py-2 text-center",
                          marcado ? "bg-blue-100 ring-2 ring-blue-600" : "",
                          destacados.has(slot.id) ? "bg-red-100" : "",
                        ].join(" ")}
                      >
                        {rotulo ? (
                          <>
                            <div className="font-medium">
                              {rotulo.disciplina}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {rotulo.professor}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            disabled={!mudou || salvando || emValidacao}
            onClick={() => salvar(false)}
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <a className="text-sm underline" href={`/grade/${p.cenarioId}`}>
            Sair sem salvar
          </a>
          {conflito && (
            <button
              className="text-sm underline"
              onClick={() => router.refresh()}
            >
              Carregar a versão nova e reaplicar minhas trocas
            </button>
          )}
        </div>
      </div>

      <aside
        className="flex min-w-72 flex-col gap-3 text-sm"
        aria-label="Veredito do motor"
        aria-live="polite"
      >
        <h2 className="font-semibold">Veredito do motor</h2>
        {!mudou && (
          <p className="text-muted-foreground">Nenhuma troca ainda.</p>
        )}
        {emValidacao && <p className="text-muted-foreground">Validando…</p>}
        {erro && (
          <p role="alert" className="text-red-700">
            {erro}
          </p>
        )}
        {aviso && <p className="text-amber-700">{aviso}</p>}
        {mudou && !emValidacao && !erro && violacoesVisiveis.length === 0 && (
          <p className="text-green-700">Nenhuma regra obrigatória violada.</p>
        )}
        {violacoesVisiveis.length > 0 && (
          <div className="text-red-700">
            <p>Regras obrigatórias violadas:</p>
            <ul className="list-inside list-disc">
              {violacoesVisiveis.map((v, i) => (
                <li key={i}>{v.texto}</li>
              ))}
            </ul>
          </div>
        )}
        {delta && avaliacao && (
          <div>
            <p>
              Custo: {avaliacao.custo_total} ({delta.total > 0 ? "+" : ""}
              {delta.total})
            </p>
            <ul className="list-inside list-disc">
              {delta.porRegra.map((r) => (
                <li key={r.regra_id}>
                  {p.rotulosRegra[r.tipo] ?? r.tipo}: {r.delta > 0 ? "+" : ""}
                  {r.delta}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
