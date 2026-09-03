# Fase 2B — Cadastros e Editor de Regras — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todas as telas de cadastro da unidade (turnos + grade de slots, turmas, disciplinas, recursos, professores + disponibilidade, atribuições com aviso de matriz incompleta) e o editor das 10 regras do catálogo — mais o fechamento do backlog herdado da Fase 2A (fluxo de senha do convidado, endurecimento de convites, pgTAP fora do schema `public`).

**Architecture:** Páginas server-component sob o layout interno existente, leituras direto do Supabase sob RLS escopadas pela unidade ativa, mutações via Server Actions com revalidação de papel no servidor. Um helper genérico de CRUD (`lib/cadastros.ts`, com allowlist de tabelas) evita repetir ações por entidade; schemas zod em `lib/validacao/` espelham as regras do banco e do motor e são testados com vitest (TDD). O editor de regras usa um catálogo de metadados por tipo (`lib/validacao/regras.ts`) que dirige o mini-formulário dinâmico.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), React 19 (`useActionState`), shadcn/ui, zod v4, vitest, Supabase (`@supabase/ssr`), pgTAP via `python supabase/tests/rodar_testes.py`.

**Spec:** `docs/superpowers/specs/2026-08-31-fase2-app-design.md` (§5 exceto /geracoes e /grade, que são do plano 2C; §6 parcial). Review final da 2A definiu o backlog herdado (Tasks 1–3 deste plano).

## Global Constraints

- Identificadores, mensagens, rotas e commits **em português**.
- Toda mutação via Server Action **revalida papel no servidor** (`admin|coordenador` para cadastros/regras) além do RLS; leituras sempre escopadas por `unidade_id` da unidade ativa.
- Formulários validados com **zod espelhando as regras do banco e do motor** (ex.: `carga_semanal >= 1`, `capacidade >= 1`, `dia 0–6`, `peso >= 1`).
- Catálogo de regras: **10 tipos** com contrato exato do motor:
  - hard fixa: `disponibilidade_professor`, `geminadas`, `recurso_compartilhado` (sem parâmetros);
  - soft fixa: `janelas_professor` (—), `preferencia_professor` (—), `compactacao_dias` (—), `distribuicao_disciplina` (`max_por_dia` int ≥ 1, default 2);
  - hard/soft alternável: `ultimo_horario` (`disciplina_id`), `nao_mesmo_dia` (`disciplina_a`, `disciplina_b`);
  - soft fixa: `preferencia_disciplina` (`disciplina_id`, `ordens` int[] não-vazia, `modo` `'evita'|'prefere'` default `'evita'`).
- `engine/` **não é tocado** neste plano.
- pgTAP roda via `python supabase/tests/rodar_testes.py` com env `SUPABASE_DB_URL` (ver `.env.example`); migrations com prefixo timestamp do CLI; push com `npx supabase db push` (senha do banco com o usuário — foi rotacionada após a 2A).
- Verificação padrão de toda task de app: `cd app && npm run teste && npm run lint && npm run build`.
- **Execução sequencial** (tasks compartilham `barra-lateral.tsx` e o helper de CRUD) — não paralelizar implementers.
- Trabalho em branch dedicada a partir de `master`; commits pequenos `feat(app): ...` / `fix(app): ...` / `feat(supabase): ...`.
- Segredos nunca comitados.

## Estrutura de arquivos (novos/alterados principais)

```
app/src/
  app/(publico)/auth/confirm/route.ts      # troca token_hash/code por sessão
  app/(publico)/definir-senha/page.tsx + actions.ts
  app/(interno)/turnos/page.tsx + actions.ts + grade-editor.tsx
  app/(interno)/turmas/page.tsx + formulario.tsx
  app/(interno)/disciplinas/page.tsx + formulario.tsx
  app/(interno)/recursos/page.tsx + formulario.tsx
  app/(interno)/professores/page.tsx + formulario.tsx
  app/(interno)/professores/[id]/disponibilidade/page.tsx + actions.ts + matriz.tsx
  app/(interno)/atribuicoes/page.tsx + actions.ts + formulario.tsx
  app/(interno)/regras/page.tsx + actions.ts + formulario.tsx
  lib/cadastros.ts                         # ações genéricas de CRUD (allowlist)
  lib/matriz.ts                            # cálculo do aviso de matriz incompleta
  lib/validacao/cadastros.ts               # schemas zod dos cadastros
  lib/validacao/regras.ts                  # catálogo de metadados + zod por tipo
  components/barra-lateral.tsx             # (modificada por várias tasks)
supabase/migrations/<ts>_pgtap_extensions.sql
app/tests/  validacao-cadastros.test.ts, validacao-regras.test.ts,
            matriz.test.ts, rotas.test.ts (ampliado), disponibilidade.test.ts
```

---

### Task 1: Fluxo de auth do convidado — `/auth/confirm` + `/definir-senha`

Fecha o Important nº 1 do review final da 2A: convite por e-mail cria o usuário no Auth, mas não havia rota de troca de token nem definição de senha — convidado novo ficava sem entrada.

**⚠️ CHECKPOINT COM O USUÁRIO (Step 5):** editar o template de e-mail "Invite user" e a allowlist de Redirect URLs no dashboard do Supabase.

**Files:**
- Create: `app/src/app/(publico)/auth/confirm/route.ts`, `app/src/app/(publico)/definir-senha/page.tsx`, `app/src/app/(publico)/definir-senha/actions.ts`
- Modify: `app/src/lib/rotas.ts` (adicionar prefixos públicos `/auth` e `/definir-senha`)
- Test: `app/tests/rotas.test.ts` (ampliar)

**Interfaces:**
- Consumes: `criarClienteServidor`, `ehCaminhoInterno`/`ehRotaPublica` (2A), `esquemaLogin` (para o mínimo de 8 na senha).
- Produces: rota GET `/auth/confirm?token_hash&type&next` (ou `?code&next`) que estabelece sessão e redireciona; página `/definir-senha?next=...` com action `definirSenha`.

- [ ] **Step 1: Ampliar o teste de rotas e ver falhar**

Acrescentar em `app/tests/rotas.test.ts`, dentro do describe de `ehRotaPublica`:

```ts
  it("libera o fluxo de auth do convidado", () => {
    expect(ehRotaPublica("/auth/confirm")).toBe(true);
    expect(ehRotaPublica("/definir-senha")).toBe(true);
  });
```

Run: `cd app && npm run teste` → Expected: FAIL (`/auth/confirm` → false).

- [ ] **Step 2: Atualizar `rotas.ts` e ver passar**

Em `app/src/lib/rotas.ts`, trocar a lista por:

```ts
const PREFIXOS_PUBLICOS = ["/login", "/cadastro", "/convite", "/auth", "/definir-senha"];
```

Run: `npm run teste` → Expected: PASS.

- [ ] **Step 3: Rota de confirmação**

`app/src/app/(publico)/auth/confirm/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { ehCaminhoInterno } from "@/lib/rotas";

/** Normaliza `next`: aceita caminho interno ou URL absoluta do próprio site. */
function destinoSeguro(bruto: string | null, origem: string): string {
  if (!bruto) return "/painel";
  let caminho = bruto;
  if (bruto.startsWith(origem)) {
    const u = new URL(bruto);
    caminho = u.pathname + u.search;
  }
  return ehCaminhoInterno(caminho) ? caminho : "/painel";
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const codigo = url.searchParams.get("code");
  const destino = destinoSeguro(url.searchParams.get("next"), url.origin);

  const supabase = await criarClienteServidor();

  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({
      type: tipo,
      token_hash: tokenHash,
    });
    if (!error) {
      // Convidado acabou de entrar sem senha: força a definição antes de seguir.
      const alvo =
        tipo === "invite"
          ? `/definir-senha?next=${encodeURIComponent(destino)}`
          : destino;
      return NextResponse.redirect(new URL(alvo, url.origin));
    }
  } else if (codigo) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) {
      return NextResponse.redirect(new URL(destino, url.origin));
    }
  }
  return NextResponse.redirect(
    new URL("/login?erro=link-invalido", url.origin),
  );
}
```

- [ ] **Step 4: Página e action de definir senha**

`app/src/app/(publico)/definir-senha/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { ehCaminhoInterno } from "@/lib/rotas";
import { z } from "zod";

const esquemaSenha = z.object({
  senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

export type EstadoSenha = { erro?: string };

export async function definirSenha(
  _anterior: EstadoSenha,
  formData: FormData,
): Promise<EstadoSenha> {
  const dados = esquemaSenha.safeParse({ senha: formData.get("senha") });
  if (!dados.success) {
    return { erro: dados.error.issues[0].message };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({
    password: dados.data.senha,
  });
  if (error) {
    return { erro: "Não foi possível definir a senha. Tente novamente." };
  }
  const proximo = formData.get("proximo");
  redirect(
    typeof proximo === "string" && ehCaminhoInterno(proximo)
      ? proximo
      : "/painel",
  );
}
```

`app/src/app/(publico)/definir-senha/page.tsx`:

```tsx
"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { definirSenha, type EstadoSenha } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function FormularioSenha() {
  const params = useSearchParams();
  const [estado, acao, pendente] = useActionState<EstadoSenha, FormData>(
    definirSenha,
    {},
  );
  return (
    <form action={acao} className="mx-auto mt-24 flex w-80 flex-col gap-4">
      <h1 className="text-2xl font-bold">Defina sua senha</h1>
      <p className="text-sm text-muted-foreground">
        Você entrou por um convite. Escolha uma senha para os próximos acessos.
      </p>
      <input type="hidden" name="proximo" value={params.get("next") ?? ""} />
      <div>
        <Label htmlFor="senha">Senha (mínimo 8 caracteres)</Label>
        <Input id="senha" name="senha" type="password" required />
      </div>
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar senha"}
      </Button>
    </form>
  );
}

export default function PaginaDefinirSenha() {
  return (
    <Suspense>
      <FormularioSenha />
    </Suspense>
  );
}
```

- [ ] **Step 5: CHECKPOINT — configurar o Supabase Auth (usuário)**

Pedir ao usuário, no dashboard (Authentication):
1. **Email Templates → Invite user**: trocar o link do corpo para
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}`
2. **URL Configuration → Redirect URLs**: garantir `http://localhost:3000/**` na allowlist (e o Site URL `http://localhost:3000`).

- [ ] **Step 6: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS.
Smoke (com o usuário, opcional agora — obrigatório na task final): convidar um e-mail nunca usado → abrir o e-mail → definir senha → cair no aceite do convite.

```bash
git add app/src/app/\(publico\)/auth app/src/app/\(publico\)/definir-senha app/src/lib/rotas.ts app/tests/rotas.test.ts
git commit -m "feat(app): fluxo de sessão e senha para convidados (auth/confirm)"
```

---

### Task 2: Endurecimento de convites (backlog 2A)

**Files:**
- Modify: `app/src/app/(publico)/convite/[token]/page.tsx` (validar UUID antes de consultar), `app/src/app/(publico)/convite/[token]/actions.ts` (validar UUID), `app/src/app/(interno)/convites/actions.ts` (`revogarConvite` revalida papel), `app/src/app/(interno)/convites/page.tsx` (exibir erro do select)

**Interfaces:**
- Consumes: `obterUnidadeAtiva` (2A), zod.
- Produces: nenhum contrato novo (correções internas).

- [ ] **Step 1: Validar UUID do token**

Em `convite/[token]/page.tsx`, logo após `const { token } = await params;`, inserir:

```tsx
import { z } from "zod";
// ...
  if (!z.string().uuid().safeParse(token).success) {
    return <Aviso titulo="Convite inválido" texto="Confira o link recebido." />;
  }
```

Em `convite/[token]/actions.ts`, trocar a validação do token por:

```ts
import { z } from "zod";
// ...
  const token = formData.get("token");
  if (
    typeof token !== "string" ||
    !z.string().uuid().safeParse(token).success
  ) {
    return { erro: "Convite inválido." };
  }
```

- [ ] **Step 2: `revogarConvite` revalida papel**

Em `convites/actions.ts`, no início de `revogarConvite`:

```ts
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel !== "admin") return;
```

- [ ] **Step 3: Exibir erro do select de convites**

Em `convites/page.tsx`, capturar o erro e exibir aviso:

```tsx
  const { data: convites, error } = await supabase
    .from("convites")
    .select("id, email, papel, token, expira_em, aceito_em")
    .eq("unidade_id", perfil.unidade_id)
    .order("criado_em", { ascending: false });
```

e, antes da tabela:

```tsx
      {error && (
        <p className="text-sm text-red-600">
          Não foi possível carregar os convites. Recarregue a página.
        </p>
      )}
```

- [ ] **Step 4: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS.

```bash
git add "app/src/app/(publico)/convite" "app/src/app/(interno)/convites"
git commit -m "fix(app): valida token de convite e revalida papel na revogação"
```

---

### Task 3: Migration — pgTAP fora do schema `public`

Fecha o minor do review final: ~200 funções TAP expostas via PostgREST.

**Files:**
- Create: `supabase/migrations/<timestamp>_pgtap_extensions.sql`

**Interfaces:**
- Consumes: schema aplicado da 2A; runner `supabase/tests/rodar_testes.py`.
- Produces: pgTAP no schema `extensions`; testes continuam achando `plan()` etc. via `search_path`.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/<timestamp>_pgtap_extensions.sql` (timestamp real do CLI):

```sql
-- pgTAP fora do schema exposto pelo PostgREST. O search_path do banco
-- passa a incluir extensions para os testes seguirem chamando plan(),
-- ok(), etc. sem qualificação.
drop extension if exists pgtap;
create extension pgtap with schema extensions;
alter database postgres set search_path to "$user", public, extensions;
```

- [ ] **Step 2: Aplicar e provar que os testes seguem verdes**

```bash
npx supabase db push
python supabase/tests/rodar_testes.py   # SUPABASE_DB_URL no ambiente
```

Expected: 37/37 PASS (0001–0006). Se `plan(integer)` não for encontrado, a conexão do runner precisa de search_path novo — reconectar (o `alter database` só vale para sessões novas).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/*_pgtap_extensions.sql
git commit -m "feat(supabase): move pgTAP para o schema extensions"
```

---

### Task 4: Schemas zod dos cadastros + helper genérico de CRUD

**Files:**
- Create: `app/src/lib/validacao/cadastros.ts`, `app/src/lib/cadastros.ts`, `app/src/components/formulario-cadastro.tsx`
- Test: `app/tests/validacao-cadastros.test.ts`

**Interfaces:**
- Consumes: `criarClienteServidor`, `obterUnidadeAtiva` (2A).
- Produces (Tasks 5–9 consomem):
  - Schemas: `esquemaTurno`, `esquemaTurma`, `esquemaDisciplina`, `esquemaRecurso`, `esquemaProfessor`, `esquemaGrade`, `esquemaAtribuicao` em `@/lib/validacao/cadastros`.
  - `salvarRegistro(tabela: TabelaCadastro, id: string | null, valores: Record<string, unknown>): Promise<EstadoCadastro>` e `excluirRegistro(tabela: TabelaCadastro, id: string): Promise<EstadoCadastro>` em `@/lib/cadastros` (`EstadoCadastro = { erro?: string; sucesso?: boolean }`; `TabelaCadastro = "turnos" | "turmas" | "disciplinas" | "recursos" | "professores"`).
  - Componente `<FormularioCadastro tabela campos registro? textoBotao? />` com `type Campo = { nome: string; rotulo: string; tipo: "texto" | "numero" | "selecao"; opcoes?: { valor: string; rotulo: string }[] }`.

- [ ] **Step 1: Escrever o teste que falha**

`app/tests/validacao-cadastros.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  esquemaAtribuicao,
  esquemaDisciplina,
  esquemaGrade,
  esquemaRecurso,
  esquemaTurma,
  esquemaTurno,
} from "@/lib/validacao/cadastros";

const UUID = "00000000-0000-0000-0000-000000000001";

describe("schemas de cadastro", () => {
  it("turno exige nome", () => {
    expect(esquemaTurno.safeParse({ nome: "Manhã" }).success).toBe(true);
    expect(esquemaTurno.safeParse({ nome: "  " }).success).toBe(false);
  });
  it("turma exige turno válido", () => {
    expect(esquemaTurma.safeParse({ nome: "6º A", turno_id: UUID }).success).toBe(true);
    expect(esquemaTurma.safeParse({ nome: "6º A", turno_id: "x" }).success).toBe(false);
  });
  it("disciplina exige nome", () => {
    expect(esquemaDisciplina.safeParse({ nome: "Matemática" }).success).toBe(true);
  });
  it("recurso coage capacidade e exige >= 1", () => {
    const ok = esquemaRecurso.safeParse({ nome: "Lab", capacidade: "2" });
    expect(ok.success && ok.data.capacidade).toBe(2);
    expect(esquemaRecurso.safeParse({ nome: "Lab", capacidade: 0 }).success).toBe(false);
  });
  it("grade exige dias 0-6, horários e fim > início", () => {
    const base = {
      dias: [0, 1, 2, 3, 4],
      horarios: [{ hora_inicio: "07:00", hora_fim: "07:50" }],
    };
    expect(esquemaGrade.safeParse(base).success).toBe(true);
    expect(esquemaGrade.safeParse({ ...base, dias: [] }).success).toBe(false);
    expect(esquemaGrade.safeParse({ ...base, dias: [7] }).success).toBe(false);
    expect(
      esquemaGrade.safeParse({
        ...base,
        horarios: [{ hora_inicio: "08:00", hora_fim: "07:00" }],
      }).success,
    ).toBe(false);
  });
  it("atribuição espelha o motor (carga >= 1, geminadas >= 0)", () => {
    const base = {
      professor_id: UUID,
      disciplina_id: UUID,
      turma_id: UUID,
      carga_semanal: "4",
      geminadas: "0",
      recurso_ids: [UUID],
    };
    const ok = esquemaAtribuicao.safeParse(base);
    expect(ok.success && ok.data.carga_semanal).toBe(4);
    expect(
      esquemaAtribuicao.safeParse({ ...base, carga_semanal: 0 }).success,
    ).toBe(false);
    expect(
      esquemaAtribuicao.safeParse({ ...base, geminadas: -1 }).success,
    ).toBe(false);
  });
});
```

Run: `cd app && npm run teste` → Expected: FAIL (`Cannot find module '@/lib/validacao/cadastros'`).

- [ ] **Step 2: Implementar os schemas e ver passar**

`app/src/lib/validacao/cadastros.ts`:

```ts
import { z } from "zod";

const nomeObrigatorio = z.string().trim().min(1, "Informe o nome");

export const esquemaTurno = z.object({ nome: nomeObrigatorio });

export const esquemaTurma = z.object({
  nome: nomeObrigatorio,
  turno_id: z.string().uuid("Escolha o turno"),
});

export const esquemaDisciplina = z.object({ nome: nomeObrigatorio });

export const esquemaRecurso = z.object({
  nome: nomeObrigatorio,
  capacidade: z.coerce.number().int().min(1, "Capacidade mínima é 1"),
});

export const esquemaProfessor = z.object({ nome: nomeObrigatorio });

const horaValida = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Hora no formato HH:MM");

export const esquemaGrade = z
  .object({
    dias: z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, "Escolha ao menos um dia"),
    horarios: z
      .array(z.object({ hora_inicio: horaValida, hora_fim: horaValida }))
      .min(1, "Adicione ao menos um horário"),
  })
  .refine(
    (g) => g.horarios.every((h) => h.hora_fim > h.hora_inicio),
    { message: "Hora final deve ser maior que a inicial" },
  );

export const esquemaAtribuicao = z.object({
  professor_id: z.string().uuid("Escolha o professor"),
  disciplina_id: z.string().uuid("Escolha a disciplina"),
  turma_id: z.string().uuid("Escolha a turma"),
  carga_semanal: z.coerce.number().int().min(1, "Carga semanal mínima é 1"),
  geminadas: z.coerce.number().int().min(0, "Geminadas não pode ser negativo"),
  recurso_ids: z.array(z.string().uuid()).default([]),
});
```

Run: `npm run teste` → Expected: PASS.

- [ ] **Step 3: Helper genérico de CRUD (Server Actions)**

`app/src/lib/cadastros.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { ZodType } from "zod";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  esquemaDisciplina,
  esquemaProfessor,
  esquemaRecurso,
  esquemaTurma,
  esquemaTurno,
} from "@/lib/validacao/cadastros";

// Allowlist: o cliente escolhe a tabela, então só tabelas de cadastro
// simples entram aqui (o RLS é a última linha de defesa).
const ESQUEMAS: Record<string, ZodType> = {
  turnos: esquemaTurno,
  turmas: esquemaTurma,
  disciplinas: esquemaDisciplina,
  recursos: esquemaRecurso,
  professores: esquemaProfessor,
};

export type TabelaCadastro =
  | "turnos"
  | "turmas"
  | "disciplinas"
  | "recursos"
  | "professores";

export type EstadoCadastro = { erro?: string; sucesso?: boolean };

async function exigirGestor() {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") return null;
  return perfil;
}

export async function salvarRegistro(
  tabela: TabelaCadastro,
  id: string | null,
  valores: Record<string, unknown>,
): Promise<EstadoCadastro> {
  const esquema = ESQUEMAS[tabela];
  if (!esquema) return { erro: "Cadastro desconhecido." };
  const perfil = await exigirGestor();
  if (!perfil) return { erro: "Apenas gestores editam cadastros." };
  const dados = esquema.safeParse(valores);
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const linha = { ...(dados.data as object), unidade_id: perfil.unidade_id };
  const { error } = id
    ? await supabase
        .from(tabela)
        .update(linha)
        .eq("id", id)
        .eq("unidade_id", perfil.unidade_id)
    : await supabase.from(tabela).insert(linha);
  if (error) return { erro: "Não foi possível salvar. Tente novamente." };
  revalidatePath(`/${tabela}`);
  return { sucesso: true };
}

export async function excluirRegistro(
  tabela: TabelaCadastro,
  id: string,
): Promise<EstadoCadastro> {
  if (!ESQUEMAS[tabela]) return { erro: "Cadastro desconhecido." };
  const perfil = await exigirGestor();
  if (!perfil) return { erro: "Apenas gestores editam cadastros." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from(tabela)
    .delete()
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id);
  if (error) {
    return {
      erro: "Não foi possível excluir — verifique se o registro está em uso.",
    };
  }
  revalidatePath(`/${tabela}`);
  return { sucesso: true };
}
```

- [ ] **Step 4: Dialog genérico de cadastro**

`app/src/components/formulario-cadastro.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  salvarRegistro,
  excluirRegistro,
  type EstadoCadastro,
  type TabelaCadastro,
} from "@/lib/cadastros";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type Campo = {
  nome: string;
  rotulo: string;
  tipo: "texto" | "numero" | "selecao";
  opcoes?: { valor: string; rotulo: string }[];
};

export function FormularioCadastro({
  tabela,
  campos,
  registro,
  textoBotao,
}: {
  tabela: TabelaCadastro;
  campos: Campo[];
  registro?: Record<string, unknown> & { id: string };
  textoBotao?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();

  function enviar(formData: FormData) {
    const valores: Record<string, unknown> = {};
    for (const c of campos) valores[c.nome] = formData.get(c.nome);
    iniciar(async () => {
      const r: EstadoCadastro = await salvarRegistro(
        tabela,
        registro?.id ?? null,
        valores,
      );
      if (r.erro) setErro(r.erro);
      else {
        setErro(undefined);
        setAberto(false);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant={registro ? "outline" : "default"} size="sm">
          {textoBotao ?? (registro ? "Editar" : "Adicionar")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{registro ? "Editar" : "Adicionar"}</DialogTitle>
        <form action={enviar} className="flex flex-col gap-4">
          {campos.map((c) => (
            <div key={c.nome}>
              <Label htmlFor={c.nome}>{c.rotulo}</Label>
              {c.tipo === "selecao" ? (
                <select
                  id={c.nome}
                  name={c.nome}
                  defaultValue={String(registro?.[c.nome] ?? "")}
                  className="block h-9 w-full rounded-md border px-2 text-sm"
                  required
                >
                  <option value="" disabled>
                    Escolha...
                  </option>
                  {(c.opcoes ?? []).map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={c.nome}
                  name={c.nome}
                  type={c.tipo === "numero" ? "number" : "text"}
                  defaultValue={String(registro?.[c.nome] ?? "")}
                  required
                />
              )}
            </div>
          ))}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BotaoExcluir({
  tabela,
  id,
}: {
  tabela: TabelaCadastro;
  id: string;
}) {
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="destructive"
        size="sm"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await excluirRegistro(tabela, id);
            setErro(r.erro);
          })
        }
      >
        Excluir
      </Button>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </span>
  );
}
```

- [ ] **Step 5: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS.

```bash
git add app/src/lib/validacao/cadastros.ts app/src/lib/cadastros.ts app/src/components/formulario-cadastro.tsx app/tests/validacao-cadastros.test.ts
git commit -m "feat(app): schemas de cadastro e CRUD genérico com revalidação de papel"
```

---

### Task 5: /turnos — CRUD + editor da grade de slots

**Files:**
- Create: `app/src/app/(interno)/turnos/page.tsx`, `app/src/app/(interno)/turnos/actions.ts`, `app/src/app/(interno)/turnos/grade-editor.tsx`
- Modify: `app/src/components/barra-lateral.tsx` (link "Turnos" após "Painel")

**Interfaces:**
- Consumes: `FormularioCadastro`/`BotaoExcluir` (T4), `esquemaGrade`, `obterUnidadeAtiva`, `criarClienteServidor`.
- Produces: action `salvarGrade(turnoId: string, dados: { dias: number[]; horarios: { hora_inicio: string; hora_fim: string }[] }): Promise<EstadoCadastro>` — regenera os slots do turno (`ordem` = índice do horário).

- [ ] **Step 1: Action da grade**

`app/src/app/(interno)/turnos/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { esquemaGrade } from "@/lib/validacao/cadastros";
import type { EstadoCadastro } from "@/lib/cadastros";

export async function salvarGrade(
  turnoId: string,
  dados: unknown,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam a grade." };
  }
  const grade = esquemaGrade.safeParse(dados);
  if (!grade.success) return { erro: grade.error.issues[0].message };

  const supabase = await criarClienteServidor();
  // Substitui a grade inteira do turno (disponibilidades dos slots
  // antigos caem em cascata — avisado na UI antes de salvar).
  const { error: erroApagar } = await supabase
    .from("slots")
    .delete()
    .eq("turno_id", turnoId)
    .eq("unidade_id", perfil.unidade_id);
  if (erroApagar) return { erro: "Não foi possível regravar a grade." };

  const linhas = grade.data.dias.flatMap((dia) =>
    grade.data.horarios.map((h, ordem) => ({
      unidade_id: perfil.unidade_id,
      turno_id: turnoId,
      dia,
      ordem,
      hora_inicio: h.hora_inicio,
      hora_fim: h.hora_fim,
    })),
  );
  const { error } = await supabase.from("slots").insert(linhas);
  if (error) return { erro: "Não foi possível salvar a grade." };
  revalidatePath("/turnos");
  return { sucesso: true };
}
```

- [ ] **Step 2: Editor client-side**

`app/src/app/(interno)/turnos/grade-editor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { salvarGrade } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type Horario = { hora_inicio: string; hora_fim: string };

export function GradeEditor({
  turnoId,
  diasIniciais,
  horariosIniciais,
}: {
  turnoId: string;
  diasIniciais: number[];
  horariosIniciais: Horario[];
}) {
  const [dias, setDias] = useState<number[]>(
    diasIniciais.length ? diasIniciais : [0, 1, 2, 3, 4],
  );
  const [horarios, setHorarios] = useState<Horario[]>(
    horariosIniciais.length
      ? horariosIniciais
      : [{ hora_inicio: "07:00", hora_fim: "07:50" }],
  );
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState(false);
  const [pendente, iniciar] = useTransition();

  function alternarDia(d: number) {
    setDias((atual) =>
      atual.includes(d) ? atual.filter((x) => x !== d) : [...atual, d].sort(),
    );
  }

  function mudarHorario(i: number, campo: keyof Horario, valor: string) {
    setHorarios((hs) =>
      hs.map((h, j) => (j === i ? { ...h, [campo]: valor } : h)),
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex gap-3 text-sm">
        {DIAS.map((rotulo, d) => (
          <label key={d} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={dias.includes(d)}
              onChange={() => alternarDia(d)}
            />
            {rotulo}
          </label>
        ))}
      </div>
      {horarios.map((h, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-14">{i + 1}º</span>
          <Input
            type="time"
            className="w-32"
            value={h.hora_inicio}
            onChange={(e) => mudarHorario(i, "hora_inicio", e.target.value)}
          />
          <span>às</span>
          <Input
            type="time"
            className="w-32"
            value={h.hora_fim}
            onChange={(e) => mudarHorario(i, "hora_fim", e.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHorarios((hs) => hs.filter((_, j) => j !== i))}
          >
            Remover
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setHorarios((hs) => [
              ...hs,
              { hora_inicio: "", hora_fim: "" },
            ])
          }
        >
          Adicionar horário
        </Button>
        <Button
          size="sm"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setOk(false);
              const r = await salvarGrade(turnoId, { dias, horarios });
              setErro(r.erro);
              setOk(!!r.sucesso);
            })
          }
        >
          {pendente ? "Salvando..." : "Salvar grade"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Salvar substitui a grade e apaga as disponibilidades já marcadas
          nesses slots.
        </span>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {ok && <p className="text-sm text-green-700">Grade salva.</p>}
    </div>
  );
}
```

- [ ] **Step 3: Página**

`app/src/app/(interno)/turnos/page.tsx`:

```tsx
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
```

- [ ] **Step 4: Link na sidebar**

Em `app/src/components/barra-lateral.tsx`, dentro do `<nav>`, logo após o link Painel:

```tsx
        <Link href="/turnos">Turnos</Link>
```

- [ ] **Step 5: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS.
Smoke manual: criar turno, salvar grade seg–sex com 4 horários → 20 slots; painel não quebra.

```bash
git add "app/src/app/(interno)/turnos" app/src/components/barra-lateral.tsx
git commit -m "feat(app): turnos com editor da grade de slots"
```

---

### Task 6: CRUDs simples — /disciplinas, /recursos, /turmas

**Files:**
- Create: `app/src/app/(interno)/disciplinas/page.tsx`, `app/src/app/(interno)/recursos/page.tsx`, `app/src/app/(interno)/turmas/page.tsx`
- Modify: `app/src/components/barra-lateral.tsx` (links Turmas, Disciplinas, Recursos após Turnos)

**Interfaces:**
- Consumes: `FormularioCadastro`, `BotaoExcluir` (T4).
- Produces: páginas de listagem; nenhum contrato novo.

- [ ] **Step 1: /disciplinas**

`app/src/app/(interno)/disciplinas/page.tsx`:

```tsx
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  BotaoExcluir,
  FormularioCadastro,
} from "@/components/formulario-cadastro";

export default async function PaginaDisciplinas() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  const { data: disciplinas } = await supabase
    .from("disciplinas")
    .select("id, nome")
    .eq("unidade_id", perfil.unidade_id)
    .order("nome");

  const campos = [{ nome: "nome", rotulo: "Nome", tipo: "texto" as const }];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Disciplinas</h1>
        <FormularioCadastro tabela="disciplinas" campos={campos} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nome</th>
            <th className="w-48"></th>
          </tr>
        </thead>
        <tbody>
          {(disciplinas ?? []).map((d) => (
            <tr key={d.id} className="border-b">
              <td className="py-2">{d.nome}</td>
              <td className="flex gap-2 py-2">
                <FormularioCadastro
                  tabela="disciplinas"
                  campos={campos}
                  registro={d}
                />
                <BotaoExcluir tabela="disciplinas" id={d.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: /recursos**

`app/src/app/(interno)/recursos/page.tsx` — mesmo formato; conteúdo completo:

```tsx
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  BotaoExcluir,
  FormularioCadastro,
} from "@/components/formulario-cadastro";

export default async function PaginaRecursos() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  const { data: recursos } = await supabase
    .from("recursos")
    .select("id, nome, capacidade")
    .eq("unidade_id", perfil.unidade_id)
    .order("nome");

  const campos = [
    { nome: "nome", rotulo: "Nome", tipo: "texto" as const },
    { nome: "capacidade", rotulo: "Capacidade", tipo: "numero" as const },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recursos</h1>
        <FormularioCadastro tabela="recursos" campos={campos} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nome</th>
            <th>Capacidade</th>
            <th className="w-48"></th>
          </tr>
        </thead>
        <tbody>
          {(recursos ?? []).map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2">{r.nome}</td>
              <td>{r.capacidade}</td>
              <td className="flex gap-2 py-2">
                <FormularioCadastro
                  tabela="recursos"
                  campos={campos}
                  registro={r}
                />
                <BotaoExcluir tabela="recursos" id={r.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: /turmas (com seleção de turno)**

`app/src/app/(interno)/turmas/page.tsx`:

```tsx
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  BotaoExcluir,
  FormularioCadastro,
} from "@/components/formulario-cadastro";

export default async function PaginaTurmas() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  const [{ data: turmas }, { data: turnos }] = await Promise.all([
    supabase
      .from("turmas")
      .select("id, nome, turno_id, turnos(nome)")
      .eq("unidade_id", perfil.unidade_id)
      .order("nome"),
    supabase
      .from("turnos")
      .select("id, nome")
      .eq("unidade_id", perfil.unidade_id)
      .order("nome"),
  ]);

  const campos = [
    { nome: "nome", rotulo: "Nome", tipo: "texto" as const },
    {
      nome: "turno_id",
      rotulo: "Turno",
      tipo: "selecao" as const,
      opcoes: (turnos ?? []).map((t) => ({ valor: t.id, rotulo: t.nome })),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Turmas</h1>
        <FormularioCadastro tabela="turmas" campos={campos} />
      </div>
      {(turnos ?? []).length === 0 && (
        <p className="text-sm text-amber-600">
          Cadastre um turno antes de criar turmas.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nome</th>
            <th>Turno</th>
            <th className="w-48"></th>
          </tr>
        </thead>
        <tbody>
          {(turmas ?? []).map((t) => (
            <tr key={t.id} className="border-b">
              <td className="py-2">{t.nome}</td>
              <td>
                {(t.turnos as unknown as { nome: string } | null)?.nome ?? "—"}
              </td>
              <td className="flex gap-2 py-2">
                <FormularioCadastro
                  tabela="turmas"
                  campos={campos}
                  registro={{ id: t.id, nome: t.nome, turno_id: t.turno_id }}
                />
                <BotaoExcluir tabela="turmas" id={t.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Links na sidebar**

Em `barra-lateral.tsx`, após o link Turnos:

```tsx
        <Link href="/turmas">Turmas</Link>
        <Link href="/disciplinas">Disciplinas</Link>
        <Link href="/recursos">Recursos</Link>
```

- [ ] **Step 5: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS.

```bash
git add "app/src/app/(interno)/disciplinas" "app/src/app/(interno)/recursos" "app/src/app/(interno)/turmas" app/src/components/barra-lateral.tsx
git commit -m "feat(app): CRUDs de disciplinas, recursos e turmas"
```

---

### Task 7: /professores — CRUD

**Files:**
- Create: `app/src/app/(interno)/professores/page.tsx`
- Modify: `app/src/components/barra-lateral.tsx` (link Professores após Disciplinas)

**Interfaces:**
- Consumes: `FormularioCadastro`, `BotaoExcluir` (T4).
- Produces: listagem com link "Disponibilidade" por professor (rota da T8).

- [ ] **Step 1: Página**

`app/src/app/(interno)/professores/page.tsx`:

```tsx
import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  BotaoExcluir,
  FormularioCadastro,
} from "@/components/formulario-cadastro";

export default async function PaginaProfessores() {
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();
  const { data: professores } = await supabase
    .from("professores")
    .select("id, nome")
    .eq("unidade_id", perfil.unidade_id)
    .order("nome");

  const campos = [{ nome: "nome", rotulo: "Nome", tipo: "texto" as const }];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Professores</h1>
        <FormularioCadastro tabela="professores" campos={campos} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nome</th>
            <th className="w-72"></th>
          </tr>
        </thead>
        <tbody>
          {(professores ?? []).map((p) => (
            <tr key={p.id} className="border-b">
              <td className="py-2">{p.nome}</td>
              <td className="flex gap-2 py-2">
                <Link
                  className="inline-flex h-8 items-center rounded-md border px-3 text-sm underline-offset-2 hover:underline"
                  href={`/professores/${p.id}/disponibilidade`}
                >
                  Disponibilidade
                </Link>
                <FormularioCadastro
                  tabela="professores"
                  campos={campos}
                  registro={p}
                />
                <BotaoExcluir tabela="professores" id={p.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Link na sidebar**

Em `barra-lateral.tsx`, após Disciplinas:

```tsx
        <Link href="/professores">Professores</Link>
```

- [ ] **Step 3: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS (o link Disponibilidade dará 404 até a T8 — esperado).

```bash
git add "app/src/app/(interno)/professores" app/src/components/barra-lateral.tsx
git commit -m "feat(app): CRUD de professores"
```

---

### Task 8: Grade de disponibilidade do professor (matriz clicável)

**Files:**
- Create: `app/src/lib/disponibilidade.ts`, `app/src/app/(interno)/professores/[id]/disponibilidade/page.tsx`, `.../disponibilidade/actions.ts`, `.../disponibilidade/matriz.tsx`
- Test: `app/tests/disponibilidade.test.ts`

**Interfaces:**
- Consumes: schema da 2A (`disponibilidades(professor_id, slot_id, status)`; ausência de linha = disponível), `obterUnidadeAtiva`.
- Produces: `type StatusDisponibilidade = "disponivel" | "indisponivel" | "prefere" | "evita"` e `proximoStatus(atual: StatusDisponibilidade): StatusDisponibilidade` em `@/lib/disponibilidade`; action `salvarDisponibilidades(professorId: string, marcacoes: { slot_id: string; status: StatusDisponibilidade }[])` (substitui tudo do professor; só persiste status ≠ disponivel).

- [ ] **Step 1: Escrever o teste que falha**

`app/tests/disponibilidade.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  proximoStatus,
  type StatusDisponibilidade,
} from "@/lib/disponibilidade";

describe("proximoStatus", () => {
  it("cicla disponível → indisponível → prefere → evita → disponível", () => {
    const ciclo: StatusDisponibilidade[] = [
      "disponivel",
      "indisponivel",
      "prefere",
      "evita",
    ];
    for (let i = 0; i < ciclo.length; i++) {
      expect(proximoStatus(ciclo[i])).toBe(ciclo[(i + 1) % ciclo.length]);
    }
  });
});
```

Run: `npm run teste` → Expected: FAIL (`Cannot find module '@/lib/disponibilidade'`).

- [ ] **Step 2: Implementar o helper e ver passar**

`app/src/lib/disponibilidade.ts`:

```ts
export type StatusDisponibilidade =
  | "disponivel"
  | "indisponivel"
  | "prefere"
  | "evita";

const CICLO: StatusDisponibilidade[] = [
  "disponivel",
  "indisponivel",
  "prefere",
  "evita",
];

export function proximoStatus(
  atual: StatusDisponibilidade,
): StatusDisponibilidade {
  return CICLO[(CICLO.indexOf(atual) + 1) % CICLO.length];
}

export const ROTULO_STATUS: Record<StatusDisponibilidade, string> = {
  disponivel: "Disponível",
  indisponivel: "Indisponível",
  prefere: "Prefere",
  evita: "Evita",
};

export const COR_STATUS: Record<StatusDisponibilidade, string> = {
  disponivel: "bg-white",
  indisponivel: "bg-red-200",
  prefere: "bg-green-200",
  evita: "bg-amber-200",
};
```

Run: `npm run teste` → Expected: PASS.

- [ ] **Step 3: Action de salvar**

`app/src/app/(interno)/professores/[id]/disponibilidade/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import type { EstadoCadastro } from "@/lib/cadastros";

const esquemaMarcacoes = z.array(
  z.object({
    slot_id: z.string().uuid(),
    status: z.enum(["indisponivel", "prefere", "evita"]),
  }),
);

export async function salvarDisponibilidades(
  professorId: string,
  marcacoes: unknown,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam a disponibilidade." };
  }
  const dados = esquemaMarcacoes.safeParse(marcacoes);
  if (!dados.success) return { erro: "Marcações inválidas." };

  const supabase = await criarClienteServidor();
  const { error: erroApagar } = await supabase
    .from("disponibilidades")
    .delete()
    .eq("professor_id", professorId)
    .eq("unidade_id", perfil.unidade_id);
  if (erroApagar) return { erro: "Não foi possível salvar." };

  if (dados.data.length > 0) {
    const { error } = await supabase.from("disponibilidades").insert(
      dados.data.map((m) => ({
        unidade_id: perfil.unidade_id,
        professor_id: professorId,
        slot_id: m.slot_id,
        status: m.status,
      })),
    );
    if (error) return { erro: "Não foi possível salvar." };
  }
  revalidatePath(`/professores/${professorId}/disponibilidade`);
  return { sucesso: true };
}
```

- [ ] **Step 4: Matriz clicável (client)**

`app/src/app/(interno)/professores/[id]/disponibilidade/matriz.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import {
  COR_STATUS,
  ROTULO_STATUS,
  proximoStatus,
  type StatusDisponibilidade,
} from "@/lib/disponibilidade";
import { salvarDisponibilidades } from "./actions";
import { Button } from "@/components/ui/button";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export type SlotMatriz = {
  id: string;
  dia: number;
  ordem: number;
  turno_nome: string;
};

export function MatrizDisponibilidade({
  professorId,
  slots,
  iniciais,
}: {
  professorId: string;
  slots: SlotMatriz[];
  iniciais: Record<string, StatusDisponibilidade>;
}) {
  const [status, setStatus] =
    useState<Record<string, StatusDisponibilidade>>(iniciais);
  const [pintando, setPintando] = useState<StatusDisponibilidade | null>(null);
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState(false);
  const [pendente, iniciar] = useTransition();

  const turnos = useMemo(
    () => [...new Set(slots.map((s) => s.turno_nome))],
    [slots],
  );

  function statusDe(id: string): StatusDisponibilidade {
    return status[id] ?? "disponivel";
  }

  function aplicar(id: string, novo: StatusDisponibilidade) {
    setStatus((s) => ({ ...s, [id]: novo }));
  }

  function salvar() {
    iniciar(async () => {
      setOk(false);
      const marcacoes = Object.entries(status)
        .filter(([, st]) => st !== "disponivel")
        .map(([slot_id, st]) => ({ slot_id, status: st }));
      const r = await salvarDisponibilidades(professorId, marcacoes);
      setErro(r.erro);
      setOk(!!r.sucesso);
    });
  }

  return (
    <div
      className="flex flex-col gap-6 select-none"
      onMouseUp={() => setPintando(null)}
      onMouseLeave={() => setPintando(null)}
    >
      {turnos.map((turno) => {
        const doTurno = slots.filter((s) => s.turno_nome === turno);
        const dias = [...new Set(doTurno.map((s) => s.dia))].sort();
        const ordens = [...new Set(doTurno.map((s) => s.ordem))].sort(
          (a, b) => a - b,
        );
        return (
          <div key={turno}>
            <h2 className="mb-2 text-lg font-semibold">{turno}</h2>
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
                      const slot = doTurno.find(
                        (s) => s.dia === d && s.ordem === o,
                      );
                      if (!slot) {
                        return <td key={d} className="border bg-gray-100" />;
                      }
                      const atual = statusDe(slot.id);
                      return (
                        <td
                          key={d}
                          title={ROTULO_STATUS[atual]}
                          className={`border px-4 py-2 cursor-pointer ${COR_STATUS[atual]}`}
                          onMouseDown={() => {
                            const novo = proximoStatus(atual);
                            aplicar(slot.id, novo);
                            setPintando(novo);
                          }}
                          onMouseEnter={() => {
                            if (pintando) aplicar(slot.id, pintando);
                          }}
                        >
                          {ROTULO_STATUS[atual][0]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar disponibilidade"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Clique cicla Disponível → Indisponível → Prefere → Evita; arraste
          para pintar vários slots.
        </span>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {ok && <p className="text-sm text-green-700">Disponibilidade salva.</p>}
    </div>
  );
}
```

- [ ] **Step 5: Página**

`app/src/app/(interno)/professores/[id]/disponibilidade/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import type { StatusDisponibilidade } from "@/lib/disponibilidade";
import { MatrizDisponibilidade, type SlotMatriz } from "./matriz";

export default async function PaginaDisponibilidade({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();

  const { data: professor } = await supabase
    .from("professores")
    .select("id, nome")
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id)
    .maybeSingle();
  if (!professor) notFound();

  const [{ data: slots }, { data: marcadas }] = await Promise.all([
    supabase
      .from("slots")
      .select("id, dia, ordem, turnos(nome)")
      .eq("unidade_id", perfil.unidade_id),
    supabase
      .from("disponibilidades")
      .select("slot_id, status")
      .eq("professor_id", id),
  ]);

  const slotsMatriz: SlotMatriz[] = (slots ?? []).map((s) => ({
    id: s.id,
    dia: s.dia,
    ordem: s.ordem,
    turno_nome:
      (s.turnos as unknown as { nome: string } | null)?.nome ?? "Turno",
  }));
  const iniciais = Object.fromEntries(
    (marcadas ?? []).map((m) => [m.slot_id, m.status as StatusDisponibilidade]),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">
        Disponibilidade — {professor.nome}
      </h1>
      {slotsMatriz.length === 0 ? (
        <p className="text-sm text-amber-600">
          Nenhum slot cadastrado. Monte a grade em Turnos primeiro.
        </p>
      ) : (
        <MatrizDisponibilidade
          professorId={professor.id}
          slots={slotsMatriz}
          iniciais={iniciais}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS.
Smoke manual: pintar células (clique e arrasto), salvar, recarregar → estados persistem.

```bash
git add "app/src/app/(interno)/professores" app/src/lib/disponibilidade.ts app/tests/disponibilidade.test.ts
git commit -m "feat(app): grade de disponibilidade do professor com pintura por arrasto"
```

---

### Task 9: /atribuicoes — tabela, filtros, recursos N:N e aviso de matriz incompleta

**Files:**
- Create: `app/src/lib/matriz.ts`, `app/src/app/(interno)/atribuicoes/page.tsx`, `app/src/app/(interno)/atribuicoes/actions.ts`, `app/src/app/(interno)/atribuicoes/formulario.tsx`
- Modify: `app/src/components/barra-lateral.tsx` (link Atribuições após Recursos)
- Test: `app/tests/matriz.test.ts`

**Interfaces:**
- Consumes: `esquemaAtribuicao` (T4), `obterUnidadeAtiva`, `criarClienteServidor`.
- Produces:
  - `calcularPendencias(turmas: { id: string; nome: string; turno_id: string }[], slotsPorTurno: Record<string, number>, cargaPorTurma: Record<string, number>): PendenciaMatriz[]` com `PendenciaMatriz = { turma_id: string; turma_nome: string; esperado: number; atual: number }` (só turmas com `atual !== esperado`) — o plano 2C reutiliza na pré-validação do "Gerar".
  - Actions `salvarAtribuicao(id: string | null, valores: unknown): Promise<EstadoCadastro>` e `excluirAtribuicao(id: string)`.

- [ ] **Step 1: Escrever o teste que falha**

`app/tests/matriz.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calcularPendencias } from "@/lib/matriz";

const turmas = [
  { id: "t1", nome: "6º A", turno_id: "manha" },
  { id: "t2", nome: "6º B", turno_id: "manha" },
];

describe("calcularPendencias", () => {
  it("aponta turma com carga menor que os slots do turno", () => {
    const pendencias = calcularPendencias(
      turmas,
      { manha: 20 },
      { t1: 18, t2: 20 },
    );
    expect(pendencias).toEqual([
      { turma_id: "t1", turma_nome: "6º A", esperado: 20, atual: 18 },
    ]);
  });
  it("aponta excesso e turma sem nenhuma atribuição", () => {
    const pendencias = calcularPendencias(
      turmas,
      { manha: 20 },
      { t1: 22 },
    );
    expect(pendencias).toHaveLength(2);
    expect(pendencias[0]).toMatchObject({ turma_id: "t1", atual: 22 });
    expect(pendencias[1]).toMatchObject({ turma_id: "t2", atual: 0 });
  });
  it("matriz cheia não gera pendência", () => {
    expect(
      calcularPendencias(turmas, { manha: 20 }, { t1: 20, t2: 20 }),
    ).toEqual([]);
  });
});
```

Run: `npm run teste` → Expected: FAIL (`Cannot find module '@/lib/matriz'`).

- [ ] **Step 2: Implementar e ver passar**

`app/src/lib/matriz.ts`:

```ts
export type PendenciaMatriz = {
  turma_id: string;
  turma_nome: string;
  esperado: number;
  atual: number;
};

/** Espelha Instancia.validar_matriz_cheia() do motor: carga total da turma
 *  deve igualar o nº de slots do turno dela. */
export function calcularPendencias(
  turmas: { id: string; nome: string; turno_id: string }[],
  slotsPorTurno: Record<string, number>,
  cargaPorTurma: Record<string, number>,
): PendenciaMatriz[] {
  return turmas
    .map((t) => ({
      turma_id: t.id,
      turma_nome: t.nome,
      esperado: slotsPorTurno[t.turno_id] ?? 0,
      atual: cargaPorTurma[t.id] ?? 0,
    }))
    .filter((p) => p.atual !== p.esperado);
}
```

Run: `npm run teste` → Expected: PASS.

- [ ] **Step 3: Actions**

`app/src/app/(interno)/atribuicoes/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { esquemaAtribuicao } from "@/lib/validacao/cadastros";
import type { EstadoCadastro } from "@/lib/cadastros";

export async function salvarAtribuicao(
  id: string | null,
  valores: unknown,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam atribuições." };
  }
  const dados = esquemaAtribuicao.safeParse(valores);
  if (!dados.success) return { erro: dados.error.issues[0].message };
  const { recurso_ids, ...atribuicao } = dados.data;

  const supabase = await criarClienteServidor();
  let atribuicaoId = id;
  if (id) {
    const { error } = await supabase
      .from("atribuicoes")
      .update(atribuicao)
      .eq("id", id)
      .eq("unidade_id", perfil.unidade_id);
    if (error) return { erro: mensagemErro(error.code) };
  } else {
    const { data, error } = await supabase
      .from("atribuicoes")
      .insert({ ...atribuicao, unidade_id: perfil.unidade_id })
      .select("id")
      .single();
    if (error || !data) return { erro: mensagemErro(error?.code) };
    atribuicaoId = data.id;
  }

  const { error: erroLimpar } = await supabase
    .from("atribuicao_recursos")
    .delete()
    .eq("atribuicao_id", atribuicaoId!);
  if (erroLimpar) return { erro: "Não foi possível salvar os recursos." };
  if (recurso_ids.length > 0) {
    const { error } = await supabase.from("atribuicao_recursos").insert(
      recurso_ids.map((recurso_id) => ({
        atribuicao_id: atribuicaoId!,
        recurso_id,
      })),
    );
    if (error) return { erro: "Não foi possível salvar os recursos." };
  }
  revalidatePath("/atribuicoes");
  return { sucesso: true };
}

function mensagemErro(codigo?: string): string {
  if (codigo === "23505") {
    return "Já existe atribuição deste professor/disciplina/turma.";
  }
  return "Não foi possível salvar. Tente novamente.";
}

export async function excluirAtribuicao(id: string): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam atribuições." };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("atribuicoes")
    .delete()
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id);
  if (error) return { erro: "Não foi possível excluir." };
  revalidatePath("/atribuicoes");
  return { sucesso: true };
}
```

- [ ] **Step 4: Formulário (client)**

`app/src/app/(interno)/atribuicoes/formulario.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { excluirAtribuicao, salvarAtribuicao } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type Opcao = { valor: string; rotulo: string };

export type AtribuicaoExistente = {
  id: string;
  professor_id: string;
  disciplina_id: string;
  turma_id: string;
  carga_semanal: number;
  geminadas: number;
  recurso_ids: string[];
};

export function FormularioAtribuicao({
  professores,
  disciplinas,
  turmas,
  recursos,
  registro,
}: {
  professores: Opcao[];
  disciplinas: Opcao[];
  turmas: Opcao[];
  recursos: Opcao[];
  registro?: AtribuicaoExistente;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();

  function enviar(formData: FormData) {
    iniciar(async () => {
      const r = await salvarAtribuicao(registro?.id ?? null, {
        professor_id: formData.get("professor_id"),
        disciplina_id: formData.get("disciplina_id"),
        turma_id: formData.get("turma_id"),
        carga_semanal: formData.get("carga_semanal"),
        geminadas: formData.get("geminadas"),
        recurso_ids: formData.getAll("recurso_ids"),
      });
      if (r.erro) setErro(r.erro);
      else {
        setErro(undefined);
        setAberto(false);
      }
    });
  }

  const selecoes: {
    nome: "professor_id" | "disciplina_id" | "turma_id";
    rotulo: string;
    opcoes: Opcao[];
  }[] = [
    { nome: "professor_id", rotulo: "Professor", opcoes: professores },
    { nome: "disciplina_id", rotulo: "Disciplina", opcoes: disciplinas },
    { nome: "turma_id", rotulo: "Turma", opcoes: turmas },
  ];

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant={registro ? "outline" : "default"} size="sm">
          {registro ? "Editar" : "Adicionar"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>
          {registro ? "Editar atribuição" : "Nova atribuição"}
        </DialogTitle>
        <form action={enviar} className="flex flex-col gap-4">
          {selecoes.map((s) => (
            <div key={s.nome}>
              <Label htmlFor={s.nome}>{s.rotulo}</Label>
              <select
                id={s.nome}
                name={s.nome}
                defaultValue={registro?.[s.nome] ?? ""}
                className="block h-9 w-full rounded-md border px-2 text-sm"
                required
              >
                <option value="" disabled>
                  Escolha...
                </option>
                {s.opcoes.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="flex gap-4">
            <div>
              <Label htmlFor="carga_semanal">Carga semanal</Label>
              <Input
                id="carga_semanal"
                name="carga_semanal"
                type="number"
                min={1}
                defaultValue={registro?.carga_semanal ?? 1}
                required
              />
            </div>
            <div>
              <Label htmlFor="geminadas">Geminadas (pares)</Label>
              <Input
                id="geminadas"
                name="geminadas"
                type="number"
                min={0}
                defaultValue={registro?.geminadas ?? 0}
                required
              />
            </div>
          </div>
          {recursos.length > 0 && (
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="font-medium">Recursos usados</legend>
              {recursos.map((r) => (
                <label key={r.valor} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="recurso_ids"
                    value={r.valor}
                    defaultChecked={registro?.recurso_ids.includes(r.valor)}
                  />
                  {r.rotulo}
                </label>
              ))}
            </fieldset>
          )}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BotaoExcluirAtribuicao({ id }: { id: string }) {
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="destructive"
        size="sm"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await excluirAtribuicao(id);
            setErro(r.erro);
          })
        }
      >
        Excluir
      </Button>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </span>
  );
}
```

- [ ] **Step 5: Página com filtros e aviso**

`app/src/app/(interno)/atribuicoes/page.tsx`:

```tsx
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import { calcularPendencias } from "@/lib/matriz";
import {
  BotaoExcluirAtribuicao,
  FormularioAtribuicao,
  type AtribuicaoExistente,
} from "./formulario";

export default async function PaginaAtribuicoes({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string; professor?: string }>;
}) {
  const filtros = await searchParams;
  const perfil = (await obterUnidadeAtiva())!;
  const supabase = await criarClienteServidor();

  const [
    { data: professores },
    { data: disciplinas },
    { data: turmas },
    { data: recursos },
    { data: slots },
  ] = await Promise.all([
    supabase.from("professores").select("id, nome")
      .eq("unidade_id", perfil.unidade_id).order("nome"),
    supabase.from("disciplinas").select("id, nome")
      .eq("unidade_id", perfil.unidade_id).order("nome"),
    supabase.from("turmas").select("id, nome, turno_id")
      .eq("unidade_id", perfil.unidade_id).order("nome"),
    supabase.from("recursos").select("id, nome")
      .eq("unidade_id", perfil.unidade_id).order("nome"),
    supabase.from("slots").select("turno_id")
      .eq("unidade_id", perfil.unidade_id),
  ]);

  let consulta = supabase
    .from("atribuicoes")
    .select(
      "id, professor_id, disciplina_id, turma_id, carga_semanal, geminadas, atribuicao_recursos(recurso_id)",
    )
    .eq("unidade_id", perfil.unidade_id);
  if (filtros.turma) consulta = consulta.eq("turma_id", filtros.turma);
  if (filtros.professor) {
    consulta = consulta.eq("professor_id", filtros.professor);
  }
  const { data: atribuicoes } = await consulta;

  const nomes = (lista: { id: string; nome: string }[] | null) =>
    Object.fromEntries((lista ?? []).map((x) => [x.id, x.nome]));
  const nomeProfessor = nomes(professores);
  const nomeDisciplina = nomes(disciplinas);
  const nomeTurma = nomes(turmas);
  const opcoes = (lista: { id: string; nome: string }[] | null) =>
    (lista ?? []).map((x) => ({ valor: x.id, rotulo: x.nome }));

  // Aviso permanente de matriz incompleta (todas as atribuições, sem filtro)
  const { data: todas } = await supabase
    .from("atribuicoes")
    .select("turma_id, carga_semanal")
    .eq("unidade_id", perfil.unidade_id);
  const slotsPorTurno: Record<string, number> = {};
  for (const s of slots ?? []) {
    slotsPorTurno[s.turno_id] = (slotsPorTurno[s.turno_id] ?? 0) + 1;
  }
  const cargaPorTurma: Record<string, number> = {};
  for (const a of todas ?? []) {
    cargaPorTurma[a.turma_id] = (cargaPorTurma[a.turma_id] ?? 0) + a.carga_semanal;
  }
  const pendencias = calcularPendencias(turmas ?? [], slotsPorTurno, cargaPorTurma);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Atribuições</h1>
        <FormularioAtribuicao
          professores={opcoes(professores)}
          disciplinas={opcoes(disciplinas)}
          turmas={opcoes(turmas)}
          recursos={opcoes(recursos)}
        />
      </div>
      {pendencias.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium">Matriz incompleta:</p>
          <ul className="list-inside list-disc">
            {pendencias.map((p) => (
              <li key={p.turma_id}>
                {p.turma_nome}: {p.atual} de {p.esperado} aulas atribuídas
              </li>
            ))}
          </ul>
        </div>
      )}
      <form method="get" className="flex items-end gap-3 text-sm">
        <div>
          <label htmlFor="turma" className="block font-medium">Turma</label>
          <select id="turma" name="turma" defaultValue={filtros.turma ?? ""}
            className="h-9 rounded-md border px-2">
            <option value="">Todas</option>
            {(turmas ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="professor" className="block font-medium">Professor</label>
          <select id="professor" name="professor"
            defaultValue={filtros.professor ?? ""}
            className="h-9 rounded-md border px-2">
            <option value="">Todos</option>
            {(professores ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md border px-3">
          Filtrar
        </button>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Professor</th>
            <th>Disciplina</th>
            <th>Turma</th>
            <th>Carga</th>
            <th>Geminadas</th>
            <th className="w-48"></th>
          </tr>
        </thead>
        <tbody>
          {(atribuicoes ?? []).map((a) => {
            const registro: AtribuicaoExistente = {
              id: a.id,
              professor_id: a.professor_id,
              disciplina_id: a.disciplina_id,
              turma_id: a.turma_id,
              carga_semanal: a.carga_semanal,
              geminadas: a.geminadas,
              recurso_ids: (
                a.atribuicao_recursos as { recurso_id: string }[]
              ).map((r) => r.recurso_id),
            };
            return (
              <tr key={a.id} className="border-b">
                <td className="py-2">{nomeProfessor[a.professor_id]}</td>
                <td>{nomeDisciplina[a.disciplina_id]}</td>
                <td>{nomeTurma[a.turma_id]}</td>
                <td>{a.carga_semanal}</td>
                <td>{a.geminadas}</td>
                <td className="flex gap-2 py-2">
                  <FormularioAtribuicao
                    professores={opcoes(professores)}
                    disciplinas={opcoes(disciplinas)}
                    turmas={opcoes(turmas)}
                    recursos={opcoes(recursos)}
                    registro={registro}
                  />
                  <BotaoExcluirAtribuicao id={a.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Link na sidebar**

Em `barra-lateral.tsx`, após Recursos:

```tsx
        <Link href="/atribuicoes">Atribuições</Link>
```

- [ ] **Step 7: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS.

```bash
git add "app/src/app/(interno)/atribuicoes" app/src/lib/matriz.ts app/tests/matriz.test.ts app/src/components/barra-lateral.tsx
git commit -m "feat(app): atribuições com recursos, filtros e aviso de matriz incompleta"
```

---

### Task 10: Catálogo de metadados + zod das regras

**Files:**
- Create: `app/src/lib/validacao/regras.ts`
- Test: `app/tests/validacao-regras.test.ts`

**Interfaces:**
- Consumes: contrato das regras do motor (Global Constraints).
- Produces (T11 e o plano 2C consomem):
  - `type TipoRegra` (union dos 10 tipos), `type ModoHard = "fixa_hard" | "fixa_soft" | "alternavel"`.
  - `CATALOGO_REGRAS: Record<TipoRegra, { rotulo: string; descricao: string; modo: ModoHard; temParametros: boolean }>`.
  - `esquemaParametros` (zod discriminated union por `tipo`) e `hardPadrao(tipo: TipoRegra): boolean`.

- [ ] **Step 1: Escrever o teste que falha**

`app/tests/validacao-regras.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CATALOGO_REGRAS,
  esquemaParametros,
  hardPadrao,
} from "@/lib/validacao/regras";

const UUID_A = "00000000-0000-0000-0000-00000000000a";
const UUID_B = "00000000-0000-0000-0000-00000000000b";

describe("catálogo de regras", () => {
  it("tem exatamente os 10 tipos do motor", () => {
    expect(Object.keys(CATALOGO_REGRAS).sort()).toEqual([
      "compactacao_dias",
      "disponibilidade_professor",
      "distribuicao_disciplina",
      "geminadas",
      "janelas_professor",
      "nao_mesmo_dia",
      "preferencia_disciplina",
      "preferencia_professor",
      "recurso_compartilhado",
      "ultimo_horario",
    ]);
  });
  it("modos hard/soft espelham o motor", () => {
    expect(CATALOGO_REGRAS.disponibilidade_professor.modo).toBe("fixa_hard");
    expect(CATALOGO_REGRAS.janelas_professor.modo).toBe("fixa_soft");
    expect(CATALOGO_REGRAS.ultimo_horario.modo).toBe("alternavel");
    expect(CATALOGO_REGRAS.nao_mesmo_dia.modo).toBe("alternavel");
    expect(hardPadrao("geminadas")).toBe(true);
    expect(hardPadrao("compactacao_dias")).toBe(false);
  });
  it("valida parâmetros por tipo", () => {
    expect(
      esquemaParametros.safeParse({
        tipo: "distribuicao_disciplina",
        max_por_dia: "2",
      }).success,
    ).toBe(true);
    expect(
      esquemaParametros.safeParse({
        tipo: "distribuicao_disciplina",
        max_por_dia: 0,
      }).success,
    ).toBe(false);
    expect(
      esquemaParametros.safeParse({
        tipo: "preferencia_disciplina",
        disciplina_id: UUID_A,
        ordens: [0, 1],
        modo: "prefere",
      }).success,
    ).toBe(true);
    expect(
      esquemaParametros.safeParse({
        tipo: "preferencia_disciplina",
        disciplina_id: UUID_A,
        ordens: [],
        modo: "evita",
      }).success,
    ).toBe(false);
    expect(
      esquemaParametros.safeParse({
        tipo: "ultimo_horario",
        disciplina_id: UUID_A,
      }).success,
    ).toBe(true);
    expect(
      esquemaParametros.safeParse({
        tipo: "nao_mesmo_dia",
        disciplina_a: UUID_A,
        disciplina_b: UUID_A,
      }).success,
    ).toBe(false);
    expect(
      esquemaParametros.safeParse({
        tipo: "nao_mesmo_dia",
        disciplina_a: UUID_A,
        disciplina_b: UUID_B,
      }).success,
    ).toBe(true);
    expect(esquemaParametros.safeParse({ tipo: "geminadas" }).success).toBe(
      true,
    );
  });
});
```

Run: `npm run teste` → Expected: FAIL (`Cannot find module '@/lib/validacao/regras'`).

- [ ] **Step 2: Implementar e ver passar**

`app/src/lib/validacao/regras.ts`:

```ts
import { z } from "zod";

export type ModoHard = "fixa_hard" | "fixa_soft" | "alternavel";

export type TipoRegra =
  | "disponibilidade_professor"
  | "geminadas"
  | "recurso_compartilhado"
  | "janelas_professor"
  | "distribuicao_disciplina"
  | "preferencia_professor"
  | "preferencia_disciplina"
  | "compactacao_dias"
  | "ultimo_horario"
  | "nao_mesmo_dia";

export const CATALOGO_REGRAS: Record<
  TipoRegra,
  { rotulo: string; descricao: string; modo: ModoHard; temParametros: boolean }
> = {
  disponibilidade_professor: {
    rotulo: "Disponibilidade do professor",
    descricao: "Nunca alocar professor em slot marcado como indisponível.",
    modo: "fixa_hard",
    temParametros: false,
  },
  geminadas: {
    rotulo: "Aulas geminadas",
    descricao: "Exige os pares de aulas consecutivas definidos nas atribuições.",
    modo: "fixa_hard",
    temParametros: false,
  },
  recurso_compartilhado: {
    rotulo: "Recursos compartilhados",
    descricao: "Laboratórios/quadras não excedem a capacidade por slot.",
    modo: "fixa_hard",
    temParametros: false,
  },
  janelas_professor: {
    rotulo: "Janelas do professor",
    descricao: "Minimiza buracos entre a primeira e a última aula do dia.",
    modo: "fixa_soft",
    temParametros: false,
  },
  distribuicao_disciplina: {
    rotulo: "Distribuição da disciplina",
    descricao: "Limita aulas por dia e espalha a disciplina pela semana.",
    modo: "fixa_soft",
    temParametros: true,
  },
  preferencia_professor: {
    rotulo: "Preferências do professor",
    descricao: "Penaliza aulas em slots 'evita' e fora dos 'prefere'.",
    modo: "fixa_soft",
    temParametros: false,
  },
  preferencia_disciplina: {
    rotulo: "Preferência de horário da disciplina",
    descricao: "Disciplina prefere/evita posições do dia (ex.: pesadas cedo).",
    modo: "fixa_soft",
    temParametros: true,
  },
  compactacao_dias: {
    rotulo: "Compactação de dias",
    descricao: "Concentra as aulas do professor em menos dias.",
    modo: "fixa_soft",
    temParametros: false,
  },
  ultimo_horario: {
    rotulo: "Não no último horário",
    descricao: "Disciplina não cai no último horário do dia.",
    modo: "alternavel",
    temParametros: true,
  },
  nao_mesmo_dia: {
    rotulo: "Não no mesmo dia",
    descricao: "Duas disciplinas não caem no mesmo dia da mesma turma.",
    modo: "alternavel",
    temParametros: true,
  },
};

export function hardPadrao(tipo: TipoRegra): boolean {
  return CATALOGO_REGRAS[tipo].modo !== "fixa_soft";
}

const semParametros = (tipo: TipoRegra) => z.object({ tipo: z.literal(tipo) });

export const esquemaParametros = z.discriminatedUnion("tipo", [
  semParametros("disponibilidade_professor"),
  semParametros("geminadas"),
  semParametros("recurso_compartilhado"),
  semParametros("janelas_professor"),
  semParametros("preferencia_professor"),
  semParametros("compactacao_dias"),
  z.object({
    tipo: z.literal("distribuicao_disciplina"),
    max_por_dia: z.coerce
      .number()
      .int()
      .min(1, "Máximo por dia deve ser ao menos 1"),
  }),
  z.object({
    tipo: z.literal("preferencia_disciplina"),
    disciplina_id: z.string().uuid("Escolha a disciplina"),
    ordens: z
      .array(z.coerce.number().int().min(0))
      .min(1, "Escolha ao menos uma posição do dia"),
    modo: z.enum(["evita", "prefere"]),
  }),
  z.object({
    tipo: z.literal("ultimo_horario"),
    disciplina_id: z.string().uuid("Escolha a disciplina"),
  }),
  z.object({
    tipo: z.literal("nao_mesmo_dia"),
    disciplina_a: z.string().uuid("Escolha a primeira disciplina"),
    disciplina_b: z.string().uuid("Escolha a segunda disciplina"),
  }),
]).superRefine((p, ctx) => {
  // refine dentro de membro quebra a detecção do discriminador em algumas
  // versões do zod — a validação cruzada vive na união.
  if (p.tipo === "nao_mesmo_dia" && p.disciplina_a === p.disciplina_b) {
    ctx.addIssue({
      code: "custom",
      message: "Escolha disciplinas diferentes",
    });
  }
});
```

Run: `npm run teste` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/validacao/regras.ts app/tests/validacao-regras.test.ts
git commit -m "feat(app): catálogo de metadados e validação das 10 regras do motor"
```

---

### Task 11: /regras — editor com mini-formulário por tipo

**Files:**
- Create: `app/src/app/(interno)/regras/page.tsx`, `app/src/app/(interno)/regras/actions.ts`, `app/src/app/(interno)/regras/formulario.tsx`
- Modify: `app/src/components/barra-lateral.tsx` (link Regras após Atribuições)

**Interfaces:**
- Consumes: `CATALOGO_REGRAS`, `esquemaParametros`, `hardPadrao` (T10); tabela `regras` (2A: `tipo`, `parametros jsonb`, `hard`, `peso >= 1`, `ativa`).
- Produces: actions `salvarRegra(id: string | null, valores: unknown): Promise<EstadoCadastro>`, `excluirRegra(id: string)`, `alternarAtiva(id: string, ativa: boolean)`.

- [ ] **Step 1: Actions**

`app/src/app/(interno)/regras/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  CATALOGO_REGRAS,
  esquemaParametros,
  hardPadrao,
  type TipoRegra,
} from "@/lib/validacao/regras";
import type { EstadoCadastro } from "@/lib/cadastros";

const esquemaBase = z.object({
  tipo: z.string(),
  hard: z.coerce.boolean(),
  peso: z.coerce.number().int().min(1, "Peso mínimo é 1"),
  ativa: z.coerce.boolean(),
});

export async function salvarRegra(
  id: string | null,
  valores: unknown,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam regras." };
  }
  const base = esquemaBase.safeParse(valores);
  if (!base.success) return { erro: base.error.issues[0].message };
  const tipo = base.data.tipo as TipoRegra;
  const meta = CATALOGO_REGRAS[tipo];
  if (!meta) return { erro: "Tipo de regra desconhecido." };

  const parametros = esquemaParametros.safeParse({
    ...(valores as object),
    tipo,
  });
  if (!parametros.success) {
    return { erro: parametros.error.issues[0].message };
  }
  const { tipo: _descartado, ...paramsSalvos } = parametros.data;

  // hard/soft: os tipos fixos ignoram o formulário; só 'alternavel' escolhe.
  const hard = meta.modo === "alternavel" ? base.data.hard : hardPadrao(tipo);

  const linha = {
    unidade_id: perfil.unidade_id,
    tipo,
    hard,
    peso: base.data.peso,
    ativa: base.data.ativa,
    parametros: paramsSalvos,
  };
  const supabase = await criarClienteServidor();
  const { error } = id
    ? await supabase
        .from("regras")
        .update(linha)
        .eq("id", id)
        .eq("unidade_id", perfil.unidade_id)
    : await supabase.from("regras").insert(linha);
  if (error) return { erro: "Não foi possível salvar a regra." };
  revalidatePath("/regras");
  return { sucesso: true };
}

export async function excluirRegra(id: string): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam regras." };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("regras")
    .delete()
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id);
  if (error) return { erro: "Não foi possível excluir." };
  revalidatePath("/regras");
  return { sucesso: true };
}

export async function alternarAtiva(
  id: string,
  ativa: boolean,
): Promise<EstadoCadastro> {
  const perfil = await obterUnidadeAtiva();
  if (!perfil || perfil.papel === "professor") {
    return { erro: "Apenas gestores editam regras." };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("regras")
    .update({ ativa })
    .eq("id", id)
    .eq("unidade_id", perfil.unidade_id);
  if (error) return { erro: "Não foi possível alterar." };
  revalidatePath("/regras");
  return { sucesso: true };
}
```

- [ ] **Step 2: Formulário dinâmico (client)**

`app/src/app/(interno)/regras/formulario.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  CATALOGO_REGRAS,
  hardPadrao,
  type TipoRegra,
} from "@/lib/validacao/regras";
import { alternarAtiva, excluirRegra, salvarRegra } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type Opcao = { valor: string; rotulo: string };

export type RegraExistente = {
  id: string;
  tipo: TipoRegra;
  hard: boolean;
  peso: number;
  ativa: boolean;
  parametros: Record<string, unknown>;
};

const ORDENS = [0, 1, 2, 3, 4, 5, 6, 7];

export function FormularioRegra({
  disciplinas,
  registro,
}: {
  disciplinas: Opcao[];
  registro?: RegraExistente;
}) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoRegra>(
    registro?.tipo ?? "disponibilidade_professor",
  );
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const meta = CATALOGO_REGRAS[tipo];
  const params = registro?.parametros ?? {};

  function enviar(formData: FormData) {
    iniciar(async () => {
      const r = await salvarRegra(registro?.id ?? null, {
        tipo,
        hard: formData.get("hard") === "true",
        peso: formData.get("peso") ?? 1,
        ativa: formData.get("ativa") === "on",
        max_por_dia: formData.get("max_por_dia") ?? undefined,
        disciplina_id: formData.get("disciplina_id") ?? undefined,
        disciplina_a: formData.get("disciplina_a") ?? undefined,
        disciplina_b: formData.get("disciplina_b") ?? undefined,
        modo: formData.get("modo") ?? undefined,
        ordens: formData.getAll("ordens"),
      });
      if (r.erro) setErro(r.erro);
      else {
        setErro(undefined);
        setAberto(false);
      }
    });
  }

  function SeletorDisciplina({ nome, rotulo, valor }: {
    nome: string; rotulo: string; valor?: unknown;
  }) {
    return (
      <div>
        <Label htmlFor={nome}>{rotulo}</Label>
        <select id={nome} name={nome} required
          defaultValue={typeof valor === "string" ? valor : ""}
          className="block h-9 w-full rounded-md border px-2 text-sm">
          <option value="" disabled>Escolha...</option>
          {disciplinas.map((d) => (
            <option key={d.valor} value={d.valor}>{d.rotulo}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant={registro ? "outline" : "default"} size="sm">
          {registro ? "Editar" : "Adicionar regra"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{registro ? "Editar regra" : "Nova regra"}</DialogTitle>
        <form action={enviar} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="tipo">Tipo</Label>
            <select id="tipo" value={tipo} disabled={!!registro}
              onChange={(e) => setTipo(e.target.value as TipoRegra)}
              className="block h-9 w-full rounded-md border px-2 text-sm">
              {Object.entries(CATALOGO_REGRAS).map(([t, m]) => (
                <option key={t} value={t}>{m.rotulo}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {meta.descricao}
            </p>
          </div>

          {meta.modo === "alternavel" ? (
            <fieldset className="flex gap-4 text-sm">
              <legend className="font-medium">Aplicação</legend>
              <label className="flex items-center gap-1">
                <input type="radio" name="hard" value="true"
                  defaultChecked={registro ? registro.hard : true} />
                Obrigatória (hard)
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="hard" value="false"
                  defaultChecked={registro ? !registro.hard : false} />
                Preferencial (soft)
              </label>
            </fieldset>
          ) : (
            <p className="text-xs text-muted-foreground">
              {hardPadrao(tipo)
                ? "Regra obrigatória (hard) — o motor não permite violá-la."
                : "Regra preferencial (soft) — violações entram no custo."}
            </p>
          )}

          {tipo === "distribuicao_disciplina" && (
            <div>
              <Label htmlFor="max_por_dia">Máximo de aulas por dia</Label>
              <Input id="max_por_dia" name="max_por_dia" type="number" min={1}
                defaultValue={Number(params.max_por_dia ?? 2)} required />
            </div>
          )}
          {tipo === "ultimo_horario" && (
            <SeletorDisciplina nome="disciplina_id" rotulo="Disciplina"
              valor={params.disciplina_id} />
          )}
          {tipo === "preferencia_disciplina" && (
            <>
              <SeletorDisciplina nome="disciplina_id" rotulo="Disciplina"
                valor={params.disciplina_id} />
              <fieldset className="text-sm">
                <legend className="font-medium">Posições do dia</legend>
                <div className="flex flex-wrap gap-3">
                  {ORDENS.map((o) => (
                    <label key={o} className="flex items-center gap-1">
                      <input type="checkbox" name="ordens" value={o}
                        defaultChecked={
                          Array.isArray(params.ordens) &&
                          (params.ordens as number[]).includes(o)
                        } />
                      {o + 1}º
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="flex gap-4 text-sm">
                <legend className="font-medium">Modo</legend>
                <label className="flex items-center gap-1">
                  <input type="radio" name="modo" value="prefere"
                    defaultChecked={params.modo === "prefere"} />
                  Prefere essas posições
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" name="modo" value="evita"
                    defaultChecked={params.modo !== "prefere"} />
                  Evita essas posições
                </label>
              </fieldset>
            </>
          )}
          {tipo === "nao_mesmo_dia" && (
            <>
              <SeletorDisciplina nome="disciplina_a" rotulo="Disciplina A"
                valor={params.disciplina_a} />
              <SeletorDisciplina nome="disciplina_b" rotulo="Disciplina B"
                valor={params.disciplina_b} />
            </>
          )}

          <div className="flex items-end gap-4">
            <div>
              <Label htmlFor="peso">Peso</Label>
              <Input id="peso" name="peso" type="number" min={1}
                defaultValue={registro?.peso ?? 1} required />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" name="ativa"
                defaultChecked={registro ? registro.ativa : true} />
              Ativa
            </label>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AcoesRegra({ regra }: { regra: RegraExistente }) {
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await alternarAtiva(regra.id, !regra.ativa);
            setErro(r.erro);
          })
        }>
        {regra.ativa ? "Desativar" : "Ativar"}
      </Button>
      <Button variant="destructive" size="sm" disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await excluirRegra(regra.id);
            setErro(r.erro);
          })
        }>
        Excluir
      </Button>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </span>
  );
}
```

- [ ] **Step 3: Página**

`app/src/app/(interno)/regras/page.tsx`:

```tsx
import { criarClienteServidor } from "@/lib/supabase/cliente-servidor";
import { obterUnidadeAtiva } from "@/lib/unidade-ativa";
import {
  CATALOGO_REGRAS,
  type TipoRegra,
} from "@/lib/validacao/regras";
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
```

- [ ] **Step 4: Link na sidebar**

Em `barra-lateral.tsx`, após Atribuições:

```tsx
        <Link href="/regras">Regras</Link>
```

- [ ] **Step 5: Validar e commitar**

Run: `npm run teste && npm run lint && npm run build` → PASS.

```bash
git add "app/src/app/(interno)/regras" app/src/components/barra-lateral.tsx
git commit -m "feat(app): editor de regras com formulário dinâmico por tipo"
```

---

### Task 12: Validação final da Fase 2B

**Files:**
- Nenhum novo (correções que surgirem do smoke entram como fix desta task).

**Interfaces:**
- Consumes: tudo acima.
- Produces: fase pronta para merge.

- [ ] **Step 1: Rodar todas as suítes**

```bash
cd app && npm run teste && npm run lint && npm run build
python supabase/tests/rodar_testes.py     # SUPABASE_DB_URL no ambiente; 37/37
cd engine && python -m pytest -q          # 47 passed (intocado)
```

- [ ] **Step 2: Smoke ponta a ponta (com o usuário)**

1. Turnos: criar "Manhã", grade seg–sex com 4 horários → 20 slots.
2. Turmas: "6º A" no turno Manhã. Disciplinas: Matemática, Português, História. Recursos: "Laboratório" capacidade 1.
3. Professores: 3 professores; pintar disponibilidade de um deles (indisponível na segunda, prefere 1º horário).
4. Atribuições: Matemática 8, Português 8, História 4 no 6º A (com o Laboratório em uma) — aviso de matriz incompleta deve aparecer durante o preenchimento e sumir ao fechar 20.
5. Regras: criar "Janelas do professor" (peso 10), "Distribuição da disciplina" (máx. 2/dia), "Não no último horário" (Matemática, hard) e "Não no mesmo dia" (Matemática × História, soft) — resumos corretos na lista; desativar/reativar uma.
6. Convite novo (Task 1): convidar e-mail nunca usado → e-mail → definir senha → aceitar.
7. Como coordenador: consegue editar cadastros; NÃO vê Convites.

- [ ] **Step 3: Commit final (se houver ajustes) e finalização**

Usar a skill `superpowers:finishing-a-development-branch` para integrar a branch ao `master` (suíte completa antes do merge).