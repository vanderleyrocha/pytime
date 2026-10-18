# PyTime — Fase 3: Pós-geração — Design

Data: 2026-10-18
Status: **aprovado** em 18/10/2026 (decisões da §9 respondidas pelo usuário)

3A (edição manual): implementada no PR vanderleyrocha/pytime#4 — falta
merge, migrations/envs de produção e a medição do p95 em produção
(`docs/deploy.md`, "Primeira subida da Fase 3A").

Spec master: `2026-08-30-pytime-design.md` (§6 "Edição manual", "Cenários" e
"Portal do professor" são a base desta fase)
Pré-requisitos: Fase 2 concluída; motor com `avaliar()` /
`AvaliadorPreparado` e processo `validador` no Fly (`POST /avaliar`, no ar
desde 18/10/2026); integração com o escolajba na `master` (carga em
`/importar` e exportação `quadro_horarios`, `docs/carga` e `docs/exportacao`).

## 1. Objetivo e decisões da fase

Transformar a grade gerada em horário oficial da escola: ajustar à mão com
validação pelo próprio motor, manter versões, escolher a oficial, exportar e
entregar a cada professor o seu horário.

Decisões já tomadas (vinculantes):

- **Validação só pelo motor** (spec master §6, revisão de 17/10): nenhuma regra
  do catálogo é reimplementada em TypeScript. O app chama o `validador` via
  Server Action; o navegador nunca fala com ele nem vê `VALIDADOR_TOKEN`.
- **Infra mantida**: Vercel (app), Supabase Cloud (banco/auth/realtime), Fly
  (worker + validador). Migração para VPS fica fora da fase.
- **Entrega em subfases**, um PR por subfase, cada uma utilizável sozinha:
  - **3A — Edição manual e cenário oficial** (§3–§5);
  - **3B — Comparação de cenários e exportações** (§6);
  - **3C — Portal do professor e notificações** (§7);
  - backlog herdado da Fase 2C entra na subfase cujo código ele toca (§8).

## 2. Princípios

- **A grade de um cenário é avaliada contra o snapshot da geração**
  (`geracoes.instancia`), não contra os cadastros atuais. Assim a avaliação é
  estável, o hash da instância é o mesmo em toda edição (cache do validador
  acerta) e editar não exige que nada mais tenha mudado. Se os cadastros
  mudaram depois da geração, a UI avisa (§4.5); reconciliar é gerar de novo.
  Isso inclui reimportar um pacote de carga do escolajba (`/importar`), que
  atualiza cadastros em modo "mesclar".
- **Matriz cheia preservada por construção**: a edição é sempre uma **troca de
  duas aulas da mesma turma** (ou mover para um horário e trazer a aula de lá).
  Nunca existe horário vazio nem duplicado na turma, então a violação
  estrutural possível numa edição é `professor_duplo` (ou `carga`, se o
  snapshot estiver inconsistente) — as demais vêm das regras do catálogo.
- **Custo exibido = custo avaliado**: todo número de custo que a UI mostra vem
  de uma `Avaliacao` (exata), nunca de `Resultado.custo_total` do solver, que
  superestima em soluções `viavel` (8822 × 5972 medido em 80 turmas).
- **Escrita privilegiada no servidor**: `cenarios`/`aulas_alocadas` continuam
  sem GRANT de escrita para `authenticated`. Gravações passam por Server
  Action que confere o papel do usuário, revalida com o motor e grava com o
  cliente `service_role` através de RPC transacional.

## 3. Modelo de dados (3A)

Migration nova `…_fase3a_edicao.sql`:

- **`cenarios`** ganha:
  - `nome text not null default 'Gerado'` (editável; duplicatas recebem
    "Cópia de …");
  - `origem text not null default 'gerado' check (origem in ('gerado',
    'duplicado'))` e `cenario_base_id uuid null` (FK composta de tenant para
    `cenarios`);
  - `versao int not null default 1` — trava otimista: toda gravação informa a
    versão lida e falha se outra pessoa salvou antes;
  - `avaliacao jsonb null` + `avaliado_em timestamptz null` — última
    `Avaliacao` do motor para a grade gravada (custos por regra, violações);
  - `excecoes jsonb not null default '[]'` — violações hard aceitas com
    "forçar": `[{motivo, forcado_por, forcado_em}]`;
  - `atualizado_em`, `atualizado_por`.
- **Um oficial por unidade**: índice único parcial
  `cenarios (unidade_id) where oficial`.
- **RPCs `security definer`, executáveis só por `service_role`**:
  - `salvar_grade_cenario(cenario_id, versao_lida, aulas jsonb, avaliacao
    jsonb, excecoes jsonb, usuario uuid)`: em uma transação confere versão,
    substitui as `aulas_alocadas` do cenário, grava avaliação/exceções e
    incrementa `versao`. Erro legível em conflito de versão.
  - `duplicar_cenario(cenario_id, nome, usuario)`: copia cenário + aulas.
  - `marcar_oficial(cenario_id, usuario)`: desmarca o anterior e marca o novo
    na mesma transação.
- **RLS**: leitura segue `minhas_unidades()`; nenhuma policy de escrita nova
  para `authenticated`. Testes pgTAP novos: isolamento entre unidades nas
  colunas novas, unicidade do oficial, RPCs negadas a `authenticated`/`anon`.

## 4. Fluxos e UI (3A)

### 4.1 Avaliação exata ao gerar

O worker, depois de gravar o cenário gerado, roda `AvaliadorPreparado
(instancia).avaliar(grade)` e grava `cenarios.avaliacao`. Custa 1–3 s em 80
turmas, fora do caminho da UI. Integração fora do motor: `solver.py` não muda
(a correção do custo no próprio `resolver` fica no backlog, §8).

### 4.2 Tela do cenário (`/grade/[cenarioId]`)

- Cabeçalho: nome, origem, "Oficial" (selo), custo total avaliado e custo por
  regra, exceções forçadas, versão/última edição.
- Ações (admin/coordenador): **Editar**, **Duplicar**, **Marcar como oficial**,
  **Renomear**.
- Lista de cenários da unidade na página de gerações ganha nome, selo de
  oficial e custo avaliado.

### 4.3 Modo edição

- Visão por turma (a mesma tabela de hoje). Clicar numa aula seleciona;
  clicar noutro horário da **mesma turma** troca as duas. Teclado: setas +
  Enter (acessibilidade).
- As trocas formam um **rascunho no cliente**. A cada troca, Server Action
  `avaliarRascunho(cenarioId, aulas)` chama o validador (não grava) e a UI
  mostra: violações hard traduzidas (`lib/nucleo.ts`, estendida para os
  motivos `estrutural:professor_duplo:<prof>:<slot>` etc., destacando a célula
  do slot), e o **delta de custo** em relação ao gravado, por regra.
- Enquanto o veredito não chega, a troca aparece aplicada com indicador "validando"
  (fallback otimista da spec master).
- **Desfazer/Refazer** sobre a pilha de trocas do rascunho.
- **Salvar**: Server Action `salvarCenario(cenarioId, versao, aulas, forcar)`
  confere papel → chama o validador de novo (nunca confia no veredito do
  cliente) → se houver violação hard e `forcar=false`, recusa com a lista;
  com `forcar=true` grava as violações em `excecoes` → RPC
  `salvar_grade_cenario`. Conflito de versão: mensagem "outra pessoa salvou
  este cenário; recarregue" sem perder o rascunho local.
- Editar o cenário **oficial** exige confirmação explícita ("isto muda o
  horário oficial"); na 3C, salvar o oficial dispara a notificação.

### 4.4 Validador: contrato usado pelo app

`POST {VALIDADOR_URL}/avaliar` com `Authorization: Bearer {VALIDADOR_TOKEN}`,
corpo `{instancia: <geracoes.instancia>, grade: [{atribuicao_id, slot_id}]}`.
Timeout de 10 s na Server Action; falha do validador = mensagem "validação
indisponível, tente de novo" e o salvar fica bloqueado (sem gravar sem
validar). Envs na Vercel: `VALIDADOR_URL`, `VALIDADOR_TOKEN` (server-only).

### 4.5 Cadastros mudaram depois da geração

Ao abrir o cenário, o app compara um hash da instância montada hoje
(`montarInstancia`) com o snapshot da geração. Diferente → aviso "os
cadastros mudaram desde esta geração; ajustes são avaliados com os dados da
época — gere de novo para incorporar as mudanças". Sem reconciliação automática
nesta fase.

## 5. Testes e critério de pronto (3A)

- **Motor**: nada novo (já coberto por `test_avaliador.py`).
- **Worker**: avaliação após geração grava `cenarios.avaliacao` (teste de
  banco; roda com staging, P1).
- **pgTAP**: colunas/índice/RPCs da migration (§3).
- **App (vitest)**: aplicação de trocas e pilha desfazer/refazer (funções
  puras), montagem do corpo para o validador, tradução dos motivos
  estruturais novos, mapeamento de erros do validador.
- **E2E (Playwright)**: abrir cenário → trocar duas aulas → ver veredito →
  salvar → recarregar e ver a troca. Roda contra o staging (P1).
- **Pronto**: suítes verdes no CI, deploy (Vercel + `fly deploy` do worker
  com a avaliação pós-geração), smoke manual com uma escola real, medição do
  p95 da validação no Fly registrada na spec master.

### 4.6 Integração com o escolajba (já na `master`)

A exportação `quadro_horarios` (`/grade/[cenarioId]/quadro-horarios`, JSON ou
CSV) lê as `aulas_alocadas` do cenário, então **um cenário editado na 3A é
exportado com as edições**, sem mudança no exportador. Com o cenário oficial
da 3A, a tela passa a destacar "exportar o oficial" e o arquivo já traz
`origem.oficial`. Cenários com exceções forçadas exportam normalmente, com as
exceções listadas no cabeçalho da tela de grade (não no arquivo: o contrato
`quadro-horarios.schema.json` não muda nesta fase).

## 6. Subfase 3B — Comparação e exportações

- **Comparar** dois cenários da mesma geração (ou de gerações diferentes com
  o mesmo conjunto de turmas): custo total e por regra lado a lado (das
  `avaliacao`), contagem de aulas que mudaram de horário, e grade por turma
  com as células diferentes destacadas.
- **Exportar** o cenário (normalmente o oficial), além da exportação
  `quadro_horarios` do escolajba que já existe:
  - **Excel** (`.xlsx`, gerado no servidor em Route Handler com `exceljs`):
    uma aba por turma, uma por professor e uma geral;
  - **PDF**: página de impressão otimizada (`@media print`, uma turma ou um
    professor por página) com "Imprimir / Salvar como PDF" do navegador
    (decisão P4).
- Testes: geração do xlsx (estrutura das abas) em vitest; E2E de download.

## 7. Subfase 3C — Portal do professor e notificações

- **Vínculo**: migration nova adiciona `perfis.professor_id` (nullable, FK
  composta de tenant para `professores`; a spec da Fase 2 previa a coluna, mas
  ela não foi criada) e amplia `convites.papel` para aceitar `professor`
  (hoje o check só permite `admin`/`coordenador`), com `convites.professor_id`.
  O papel `professor` já existe no enum `papel`. Convite de professor reusa o
  fluxo de convites, escolhendo o professor na criação.
- **Portal**: rota `/meu-horario` — só a grade do professor no cenário
  **oficial** da unidade, mais a lista de unidades se ele atua em mais de uma.
  RLS nova: professor lê só o oficial e só as próprias aulas.
- **Notificação**: quando o oficial muda (marcar outro ou salvar o oficial),
  e-mail para cada professor afetado com o resumo das mudanças das suas aulas.
  Envio assíncrono (tabela de saída processada pelo worker, para não
  depender do tempo da Server Action). Provedor: SMTP do Supabase (decisão
  P5), o mesmo dos convites. O limite de envio do plano gratuito é baixo, então
  o envio é agrupado (um e-mail por professor por mudança) e a fila respeita o
  limite; se não bastar, troca-se o SMTP no painel do Supabase sem mudar
  código.

## 8. Backlog herdado e dívida técnica

Entra na subfase indicada (critério: a subfase já mexe naquele código).

| Item | Origem | Subfase |
|---|---|---|
| Custo inflado do `resolver` em solução `viavel` (corrigir no motor, com benchmark) | revisão 17/10 | 3B (antes da comparação ficar permanente) |
| Ordem das restrições de professor depende de `PYTHONHASHSEED` (`set` em `modelo.py`) | revisão 18/10 | 3B, junto do item acima |
| RPCs transacionais para `salvarGrade` (grade de **turnos**)/`salvarDisponibilidades` | Fase 2C | 3A |
| `(select tenho_papel(...))` nas policies | Fase 2C | 3A (migration nova) |
| Exibir erros de selects hoje descartados | Fase 2C | 3A nas telas tocadas; resto em 3B |
| `ORDENS` derivado da grade (formulário de regras); agrupar matriz por id de turno; bounds no `esquemaGrade` (turnos) | Fase 2C | 3A (tasks independentes da edição) |
| Parâmetros de regra órfãos após excluir disciplina; confirmação no excluir | Fase 2C | 3B |

## 9. Decisões (respondidas em 18/10/2026)

- **P1 — Ambiente de staging: sim.** Projeto Supabase separado
  (`pytime-staging`) com as mesmas migrations, e secret
  `SUPABASE_DB_URL_STAGING` no GitHub para os testes de banco do worker, os
  de RLS e o E2E rodarem no CI. Passo a passo em `docs/deploy.md` (§ Staging).
  É pré-requisito da 3A.
- **P2 — Edição só por troca na mesma turma: sim.**
- **P3 — Rascunho no cliente + salvar explícito: sim.**
- **P4 — PDF pela impressão do navegador: sim.**
- **P5 — E-mail da 3C pelo SMTP do Supabase: sim** (ver limites na §7).
- **P6 — Editam admin e coordenador: sim.**

## 10. Fora de escopo da Fase 3

Reconciliação automática de cenário com cadastros alterados; edição que muda
atribuições (professor/turma/carga); geração parcial ("re-otimizar só esta
turma"); IA (Fase 4); billing (Fase 5); apps móveis; migração para VPS.
