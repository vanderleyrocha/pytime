# PyTime — Geração de Horários Escolares — Design

Data: 2026-08-30
Status: aprovado em brainstorming (seções 1–3 aprovadas pelo usuário)

## 1. Visão

SaaS multi-escola para geração automática de horários de educação básica brasileira
(fundamental/médio, escolas grandes: 30–80+ turmas, múltiplos turnos, professores
circulando entre turnos). Objetivo: gerar os melhores horários no menor tempo
possível, respeitando hard rules (invioláveis), soft rules (otimizadas por peso) e
regras definidas pelo usuário via catálogo parametrizável.

**Decisão de motor:** OR-Tools **CP-SAT** como motor principal (não GA). A pesquisa
de estado da arte (ITC/XHSTT) mostra que GA puro não é competitivo em timetabling;
CP-SAT garante hard rules por construção e otimiza soft rules como objetivo
ponderado, resolvendo instâncias do porte alvo em segundos a poucos minutos.
Referências: survey Tan et al. (ESWA 2021), GOAL solver (ITC 2011), CP-SAT Primer,
arXiv:2408.12032.

## 2. Stack

| Camada | Escolha |
|---|---|
| Front-end | Next.js App Router (TypeScript) + shadcn/ui + Tailwind |
| API | Next.js API routes / Server Actions na Vercel |
| Motor | Python + OR-Tools CP-SAT, Vercel Function (Fluid Compute), job assíncrono |
| Banco/Auth/Realtime | Supabase (Postgres + RLS, Auth, Realtime) |
| IA | Vercel AI Gateway + AI SDK (strings "provider/model") |
| Hospedagem | Vercel (monorepo: app Next.js + function Python) |

Se benchmarks mostrarem instâncias que estouram o limite da Vercel Function, apenas
o worker Python migra (o motor é desacoplado por contrato JSON).

## 3. Decomposição em fases

Cada fase gera sua própria spec detalhada + plano de implementação.

1. **Fase 1 — Motor de otimização** (núcleo; primeira a ser construída)
2. **Fase 2 — App SaaS básico**: Supabase (schema + RLS + Auth), cadastros, editor
   de regras, disparo de geração com progresso em tempo real, visualização da grade
3. **Fase 3 — Pós-geração**: cenários múltiplos com comparação, edição manual com
   validação em tempo real, exportação PDF/Excel, portal do professor com
   notificações
4. **Fase 4 — IA acoplada**: regras em linguagem natural, diagnóstico de
   inviabilidade em português, importação assistida de planilhas, chat de análise
5. **Fase 5 — Comercialização** (futura): Stripe, planos/limites, onboarding

Sem billing na v1 (cadastro livre/convites). Cada unidade gera horário
independente na v1; professor em duas unidades é modelado por blocos de
indisponibilidade. O schema já prevê `rede → unidades` para evolução futura
(otimização coordenada entre unidades fica fora da v1).

## 4. Fase 1 — Motor de otimização

### 4.1 Contrato

Pacote Python puro, desacoplado de Supabase/Vercel: recebe instância JSON, devolve
resultado JSON. Testável isolado, benchmark local, migração de infra sem tocar no
código.

**Entrada:** dias/slots por turno; turmas (com turno); disciplinas; professores com
disponibilidade por slot (disponível/indisponível/prefere/evita); atribuições
(professor × disciplina × turma × carga semanal + nº de aulas geminadas exigidas);
recursos compartilhados (laboratório, quadra, sala de informática) e quais
atribuições os usam; regras ativas do catálogo com parâmetros, flag hard/soft e
peso.

**Saída:** grade completa (aula → slot); custo por soft rule (quais violadas, onde,
quanto); tempo de resolução; status: ótimo / viável / inviável (com núcleo de
conflito).

### 4.2 Modelagem CP-SAT

- Variável booleana `x[aula, slot]` por aula de cada atribuição.
- **Hard constraints:** professor ≤ 1 aula por slot; turma exatamente 1 aula por
  slot (matriz cheia); disponibilidade do professor filtra o domínio; geminadas
  como pares de slots consecutivos no mesmo dia; recurso compartilhado ≤ capacidade
  por slot; carga semanal exata por atribuição.
- **Soft (objetivo ponderado):** janelas do professor; espalhamento da disciplina
  na semana; preferências pedagógicas de slot; compactação de dias do professor.
  Pesos configuráveis por escola.
- Budget de tempo configurável: padrão 60 s, máx. 240 s na Vercel; CP-SAT
  multi-thread; callback de progresso (melhor custo corrente) gravado no Supabase.

### 4.3 Catálogo de regras v1

Cada regra é uma classe com `aplicar(modelo)`; adicionar regra nova não toca o
núcleo. Cada instância de regra é parametrizável, ativável/desativável, hard ou
soft com peso.

Hard: sem conflito professor/turma; carga horária integral; disponibilidade do
professor; geminadas obrigatórias; recursos/salas especiais.
Soft: minimizar janelas; distribuição da disciplina na semana (máx. N aulas/dia,
espalhar pelos dias); preferências de slot (disciplinas pesadas cedo, preferências
do professor); compactar dias do professor.
Extras v1: "disciplina X não no último horário"; "professor X prefere/evita slot
Y"; "aulas de X e Y não no mesmo dia".

### 4.4 Inviabilidade

Sem solução → o motor extrai núcleo de conflito via assumptions do CP-SAT e devolve
a lista mínima de regras/disponibilidades em choque. Insumo do diagnóstico por IA
(Fase 4).

### 4.5 Testes e benchmark

- Teste unitário por regra do catálogo (instância mínima que a exercita).
- Gerador de instâncias sintéticas realistas (20/40/80 turmas).
- Benchmark automatizado de tempo × qualidade, validando execução dentro dos
  limites da Vercel Function.

## 5. Modelo de dados (Supabase)

**Multi-tenancy:** hierarquia `redes → unidades` (rede opcional na v1). Tabelas de
domínio carregam `unidade_id`; RLS restringe cada usuário à(s) sua(s) unidade(s).

**Roles:** admin (gerencia unidade e usuários), coordenador (cadastros, regras,
gerações), professor (visualiza apenas o próprio horário).

**Tabelas principais:**

- `redes`, `unidades`, `perfis` (usuário ↔ unidade ↔ role, sobre Supabase Auth)
- `turnos`, `grades_horarias` (dias × slots por turno, horários início/fim),
  `turmas`, `disciplinas`, `professores`, `disponibilidades` (professor × slot:
  disponível/indisponível/prefere/evita)
- `atribuicoes` (professor × disciplina × turma, carga semanal, nº geminadas),
  `recursos` e vínculo atribuição↔recurso
- `regras` (tipo do catálogo, parâmetros JSONB, hard/soft, peso, ativa)
- `geracoes` (job: status, progresso, instância enviada, resultado, custos soft,
  núcleo de conflito), `cenarios` (horários salvos; um oficial),
  `aulas_alocadas` (cenário × atribuição × slot — grade editável)

## 6. Fluxos

**Geração:** coordenador clica "Gerar" → API monta o JSON da instância a partir do
banco, cria registro em `geracoes`, invoca a Function Python → motor grava
progresso no job → UI acompanha via Supabase Realtime → resultado vira `cenario`
para revisão. Inviável: núcleo de conflito fica no job.

**Edição manual (Fase 3):** mover aula na grade chama validador incremental em
TypeScript no servidor (mesmas regras do catálogo): responde em milissegundos se
viola hard e o impacto nas softs. Persiste só se não violar hard; opção "forçar"
registrada como exceção consciente.

**Cenários (Fase 3):** múltiplas versões salvas, comparação lado a lado, uma
marcada oficial. Exportação PDF/Excel: grade por turma, por professor e geral.
Portal do professor: login próprio, vê só o seu horário, notificado quando o
oficial muda.

**IA (Fase 4):** chamadas via Vercel AI Gateway com AI SDK. Regras em linguagem
natural: saída estruturada no schema do catálogo + confirmação do usuário antes de
salvar. Diagnóstico de inviabilidade: traduz o núcleo de conflito para português
com sugestões de relaxamento. Importação assistida: mapeamento de colunas de
planilhas para o modelo. Chat de análise: resumo executivo e perguntas sobre o
horário.

## 7. Tratamento de erros

- Motor: timeout do budget → devolve melhor solução viável encontrada (status
  "viável"); sem viável no budget → status próprio, sugerindo aumentar budget.
- Job de geração: falha da Function marca `geracoes.status = erro` com detalhe; UI
  oferece re-tentar.
- Edição manual: validação sempre no servidor (nunca confiar no cliente).
- RLS como última linha de defesa de isolamento entre tenants (testes de RLS
  obrigatórios na Fase 2).

## 8. Fora de escopo da v1

Billing/planos; otimização coordenada entre unidades; alocação de sala como
variável (modelo brasileiro: turma tem sala fixa); scheduling por aluno (grade
por turma, não por estudante); apps móveis nativos.
