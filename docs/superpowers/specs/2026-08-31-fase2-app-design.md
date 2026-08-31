# PyTime — Fase 2: App SaaS básico — Design

Data: 2026-08-31
Status: aprovado em brainstorming (seções 1–5 aprovadas pelo usuário)
Spec master: `2026-08-30-pytime-design.md` (§5 e §6 são a base desta fase)
Pré-requisito: Fase 1 concluída (`engine/` — pacote `pytime_engine`, contrato
`Instancia`/`Resultado` JSON, 47 testes).

## 1. Objetivo e decisões da fase

Tornar o motor usável de ponta a ponta: cadastros, regras, disparo de geração
com progresso em tempo real e visualização da grade — multi-tenant com RLS.

Decisões tomadas no brainstorming (vinculantes):

- **Onboarding**: auto-cadastro (quem cria conta vira admin de uma unidade
  nova) + convites por e-mail para admin/coordenador.
- **Professores**: apenas cadastro (linhas em `professores`); login/portal do
  professor é Fase 3. O role `professor` existe no enum, sem telas.
- **Supabase**: projeto remoto novo, dedicado, com migrations versionadas no
  repo (`supabase/`). Sem stack local/Docker.
- **Execução do motor**: **worker Python dedicado** (não Vercel Function) —
  o benchmark da Fase 1 mostrou 80 turmas ≈ 265 s de wall-time, acima do teto
  prático da Vercel, e o requisito é garantia de execução (sem morte por
  tempo/memória). O fallback da spec master vira arquitetura principal.
- **Fila**: a própria tabela `geracoes` (claim com `FOR UPDATE SKIP LOCKED`,
  heartbeat, retry). Sem broker adicional.
- **Deploy completo** encerra a fase: app na Vercel, worker no **Fly.io**,
  Supabase remoto.
- **Acesso a dados**: RLS-first + Server Actions (leituras direto do Supabase
  sob RLS; mutações via Server Actions). Sem camada REST própria.

## 2. Arquitetura e layout do repositório

```
pytime/
  app/        # Next.js App Router (TS, shadcn/ui, Tailwind, pt-BR) → Vercel
  engine/     # pytime_engine (Fase 1, intocado)
  worker/     # worker Python: poller da fila + pytime_engine → Fly.io
  supabase/   # migrations SQL + testes de RLS (pgTAP) + seed
```

**Fluxo de geração:** coordenador clica "Gerar" → Server Action pré-valida
(matriz cheia, referências), monta o JSON da `Instancia` a partir do banco e
insere `geracoes(status='pendente')` → worker reivindica o job via RPC com
`FOR UPDATE SKIP LOCKED` (nunca duplica), marca `executando`, roda
`resolver()` com callback de progresso gravando `progresso` (custo corrente,
tempo) na linha → UI acompanha via Supabase Realtime → ao concluir, o worker
grava `resultado`, cria `cenarios` + `aulas_alocadas` e o app mostra a grade.
Inviável → `nucleo_conflito` gravado no job.

**Garantias do job:** persistido em `geracoes`; heartbeat do worker a cada
~15 s; job `executando` com heartbeat parado > 2 min volta a `pendente`
(retry automático); na 3ª falha vira `erro` com detalhe. Worker sem teto de
tempo/memória da plataforma serverless.

## 3. Modelo de dados (Postgres/Supabase)

Ids UUID; nomes de tabelas/colunas em português. Todas as tabelas de domínio
carregam `unidade_id`.

- **Tenancy**: `redes` (opcional, sem UI na v1), `unidades`, `perfis`
  (user_id ↔ unidade_id ↔ role `admin|coordenador|professor`;
  `professor_id` nullable para o vínculo da Fase 3), `convites` (email,
  role, unidade_id, token, expira_em, aceito_em).
- **Estrutura**: `turnos`; `slots` (turno_id, dia 0–6, ordem, hora_inicio,
  hora_fim) — a "grade horária" materializada por linha; `turmas`,
  `disciplinas`, `professores`, `disponibilidades` (professor × slot:
  disponivel/indisponivel/prefere/evita), `recursos`.
- **Atribuição**: `atribuicoes` (professor × disciplina × turma,
  carga_semanal ≥ 1, geminadas), `atribuicao_recursos` (N:N).
- **Regras**: `regras` (tipo — um dos 9 tipos do catálogo do motor,
  parametros JSONB, hard, peso, ativa).
- **Geração**: `geracoes` (status `pendente → executando → concluida` |
  `inviavel` | `erro`; instancia JSONB, resultado JSONB, progresso JSONB,
  nucleo_conflito, tentativas, heartbeat_em, budget_segundos),
  `cenarios` (geracao_id, oficial bool), `aulas_alocadas`
  (cenario × atribuicao × slot).

**RLS**: habilitado em todas as tabelas. Função `minhas_unidades()`
(SECURITY DEFINER sobre `perfis`/`auth.uid()`) alimenta as policies: SELECT
para membros da unidade; escrita de cadastros/regras/gerações só
admin/coordenador; `perfis`/`convites` só admin. O worker usa `service_role`
(bypassa RLS) e é o único que escreve `resultado`/`cenarios`/`aulas_alocadas`.
**Testes de RLS obrigatórios** (pgTAP via `supabase test db`): isolamento
entre unidades em toda tabela; roles sem permissão bloqueadas.

Validação pesada (matriz cheia, referências) permanece no motor; o app
pré-valida o barato antes de enfileirar e exibe os erros do motor.

## 4. Auth, onboarding e convites

- Supabase Auth e-mail+senha com verificação; sessão via `@supabase/ssr`
  (cookies); middleware protege tudo exceto `/login`, `/cadastro`,
  `/convite/[token]`.
- Auto-cadastro → passo "criar sua escola" → RPC transacional
  `criar_unidade_com_admin` (cria `unidades` + `perfis` admin).
- Convites: admin informa e-mail + role (admin|coordenador) → `convites` com
  token e validade de 7 dias → e-mail via Supabase Auth apontando
  `/convite/[token]` → RPC `aceitar_convite` valida e cria o perfil.
  Convites pendentes revogáveis. Usuário pode ter perfis em várias unidades;
  seletor de unidade no topo quando houver mais de uma.

## 5. UI

pt-BR, shadcn/ui + Tailwind, sidebar. Rotas (escopadas à unidade ativa):

| Rota | Conteúdo |
|---|---|
| `/painel` | contagens, última geração, atalho "Gerar horário" |
| `/turnos` | CRUD de turnos + editor da grade de slots (dias × horários) |
| `/turmas`, `/disciplinas`, `/recursos` | CRUDs tabela + dialog |
| `/professores` | CRUD + grade de disponibilidade (matriz slot × dia; célula cicla disponível → indisponível → prefere → evita, pintável com o mouse) |
| `/atribuicoes` | tabela com carga/geminadas, filtros, aviso permanente de matriz incompleta por turma |
| `/regras` | editor: lista + catálogo das 9 regras, mini-formulário por tipo (sem JSON cru), toggle hard/soft onde o motor permite, peso, ativa |
| `/geracoes` | lista + "Gerar horário" (budget 60 s padrão, máx. 600 s); progresso ao vivo via Realtime; inviável → núcleo de conflito em texto direto (tradução por IA é Fase 4) |

Ajuste no motor exigido por esta fase (única mudança em `engine/`): o teto de
`Instancia.budget_segundos` sobe de 240 s (premissa Vercel, agora obsoleta)
para 600 s — mudança de 1 linha + teste.
| `/grade/[cenarioId]` | grade por turma, por professor e geral por turno; somente leitura; custos soft listados |

Formulários validados com zod espelhando as regras do motor. Sem
importação/exportação (Fases 3/4).

## 6. Tratamento de erros e testes

- Job: retry automático (órfão por heartbeat; `tentativas` até 3 → `erro`
  com detalhe); UI oferece "tentar novamente".
- Server Actions revalidam role no servidor além do RLS; nunca confiar no
  cliente.
- Testes: RLS via pgTAP (obrigatório); worker via pytest (claim sem
  duplicação, retry de órfão, montagem da `Instancia` a partir do banco,
  gravação de progresso/resultado/cenário); app via vitest (montagem da
  instância e validações zod). E2E fica para a Fase 3.

## 7. Deploy (critério de pronto da fase)

- Supabase: projeto novo, `supabase db push` das migrations, keys em env.
- Vercel: root directory `app/`, env vars do Supabase.
- Fly.io: `worker/Dockerfile` (contexto na raiz do repo para incluir
  `engine/`), env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, 1 máquina
  pequena sempre ligada.
- `docs/deploy.md` com os três passos reproduzíveis.

## 8. Fora de escopo da Fase 2

Portal/login de professor; edição manual da grade; múltiplos cenários com
comparação; exportação PDF/Excel; importação de planilhas; qualquer IA;
billing; login social; E2E automatizado.
