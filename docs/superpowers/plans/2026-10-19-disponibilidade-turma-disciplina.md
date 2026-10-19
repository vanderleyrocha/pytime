# Disponibilidade de turmas e disciplinas — Plano de Implementação

> **Para quem executa:** siga task a task, em ordem. Cada task é TDD (teste
> que falha → implementação mínima → teste passa) e termina em um commit.
> Passos usam checkbox (`- [ ]`). Mudanças em `engine/` passam pelo agente
> `revisor-engine` antes do merge.

**Objetivo:** permitir marcar, por slot, (a) os tempos em que uma **turma não
tem aula** e (b) os tempos em que uma **disciplina não pode / prefere / evita**
acontecer — hoje só o professor tem disponibilidade. Isso elimina o
contorno atual: professores fictícios "Vago 1A"/"Vago 1B" + disciplina
"Horário livre" usados para tapar os tempos em que as turmas 1A e 1B não têm
aula.

**Por que o contorno existe:** o motor exige *matriz cheia* em dois lugares:

- `Instancia.validar_matriz_cheia()` — carga total da turma == nº de slots
  do turno;
- `ContextoModelo._restricoes_estruturais()` — `add_exactly_one` por
  (turma, slot): todo slot do turno da turma recebe exatamente uma aula.

Uma turma com menos tempos que o turno não cabe nesse contrato, então hoje a
única saída é preencher a sobra com aulas falsas. Além de poluir cadastros e
exportações, o "Vago" entra nas regras soft (janelas, compactação,
distribuição) e no núcleo de conflito como se fosse um professor real.

## Decisões de desenho

### D1 — Indisponibilidade de turma é **estrutural**, não regra do catálogo

Uma regra hard `x == 0` não resolve: ela colidiria com o `exactly_one` da
matriz cheia (o slot continuaria exigindo uma aula). O correto é que o slot
**não exista** para a turma: `ContextoModelo._slots_turma[turma]` passa a
excluir os slots marcados como indisponíveis, e nenhuma variável `x[aula,
slot]` é criada para eles. A matriz cheia continua valendo — só que sobre os
*slots disponíveis* da turma.

Isso toca `instancia.py` e `modelo.py`, o que **não** viola a regra 2 do
`CLAUDE.md` (proibido editar o núcleo *para adicionar regra*): aqui muda o
contrato de entrada e a definição estrutural de "slots da turma", que é
responsabilidade do `modelo.py` (SRP). Todas as regras já consultam
`ctx.slots_da_turma(...)` e passam a enxergar a grade reduzida sem mudança
(Open/Closed preservado). Efeito colateral bom: menos variáveis → modelo
menor.

Consequência: não há literal de assumption para isso; conflitos de turma são
pegos na validação barata (`validar_matriz_cheia`), com mensagem legível,
antes do CP-SAT.

### D2 — Status permitidos para turma: só `disponivel | indisponivel`

`prefere`/`evita` para turma não têm semântica clara ("a turma prefere ter
aula às 7h"?). Para não abrir um caminho sem regra que o consuma, a
`Instancia` rejeita `prefere`/`evita` em `Turma.disponibilidade` (validador
pydantic com mensagem em português). Reabre-se se surgir caso real.

### D3 — Disponibilidade de disciplina é **regra do catálogo**

Ex.: Educação Física só quando a quadra está livre; Laboratório nunca no 1º
tempo. É restrição sobre aulas existentes, portanto regra normal:

- `disponibilidade_disciplina` (hard) — `x == 0` nos slots `indisponivel`,
  com `only_enforce_if(ctx.assumption("disponibilidade_disciplina:<id>"))`;
- `preferencia_disciplina_horario` (soft) — custo em slot `evita` e fora dos
  `prefere`, espelhando `preferencia_professor`.

Cada uma = um arquivo em `regras/` + 1 import em `regras/__init__.py`.
`modelo.py`/`solver.py` não mudam por causa delas.

A regra existente `preferencia_disciplina` (por **ordem** no dia, via
parâmetros) continua: é a forma genérica "pesadas cedo" que vale para
qualquer turno; a nova é por **slot** concreto, editada numa matriz.

### D4 — Granularidade da disciplina: por disciplina (global na unidade)

A matriz é `Disciplina.disponibilidade: dict[slot_id, Disponibilidade]`,
igual à do professor. Como slot ids são globais, uma disciplina oferecida em
vários turnos tem uma marcação por slot de cada turno. Disponibilidade por
atribuição (disciplina × turma) fica fora do escopo — anotar no backlog se
pedirem.

### D5 — "Último horário" passa a ser o último **da turma**

`ultimo_horario` usa `max(ordem)` dos slots da turma no dia. Com D1, para a
1A que sai mais cedo isso vira o último tempo *dela*, não o do turno. É a
leitura pedagógica certa ("não deixar X na última aula da turma"); fica
registrado na docstring como comportamento intencional.

## Escopo por camada

| Camada | Muda |
|---|---|
| Motor (`engine/`) | contrato `Turma`/`Disciplina`, `slots_do_turno` da turma, matriz cheia, avaliador, 2 regras novas, gerador do benchmark |
| Banco (`supabase/`) | 2 tabelas + RLS + integridade de tenant, 2 RPCs transacionais, `regras_tipo_check`, carga (`pacote`) |
| App (`app/`) | montagem da `Instancia`, matriz cheia do app, 2 telas de matriz, grade com célula "sem aula", textos do núcleo, importação CSV |
| Worker | nada de código (só passa o JSON); testes de contrato do validador |

## Restrições globais

- Identificadores, mensagens, rotas, docstrings e commits **em português**.
- **Retrocompatibilidade do JSON**: os campos novos têm `default_factory=dict`;
  snapshots antigos em `geracoes.instancia` continuam válidos (a edição
  manual reavalia contra eles).
- Nenhuma regra do catálogo em TypeScript; o app só monta a instância e
  traduz motivos.
- API do CP-SAT em snake_case.
- Benchmark obrigatório (Task 7): D1 toca `modelo.py`.

---

## Parte A — Motor

### Task 1 — Contrato: `Turma.disponibilidade` e `Disciplina.disponibilidade`

Arquivos: `engine/src/pytime_engine/instancia.py`, `engine/tests/test_instancia.py`.

- [ ] Teste: `Turma` e `Disciplina` aceitam `disponibilidade` (default `{}`),
      e uma `Instancia` sem os campos (JSON antigo) continua carregando.
- [ ] Teste: `Turma` com status `prefere`/`evita` levanta `ValidationError`
      com mensagem em português (D2).
- [ ] Teste: `validar_referencias()` acusa slot inexistente e slot de **outro
      turno** na disponibilidade da turma (`Turma 1A: slot 'x' da
      disponibilidade não pertence ao turno da turma.`) e slot inexistente
      na disponibilidade da disciplina.
- [ ] Implementar os campos, o `field_validator` e as checagens.
- [ ] `feat(engine): disponibilidade de turma e disciplina no contrato`

### Task 2 — Slots da turma excluem os indisponíveis (D1)

Arquivos: `instancia.py` (novo `slots_da_turma(turma)` na `Instancia`,
reaproveitado pelo modelo e pelas validações), `modelo.py`,
`engine/tests/test_modelo.py`, `engine/tests/test_solver.py`.

- [ ] Teste: `Instancia.slots_da_turma(turma)` devolve `slots_do_turno` menos
      os `indisponivel`, ordenados por `(dia, ordem)`.
- [ ] Teste: `validar_matriz_cheia()` compara a carga com os slots
      **disponíveis**; mensagem: `Turma 1A: carga total 25 difere do número
      de horários disponíveis da turma (22 de 25 do turno).`
- [ ] Teste: `ContextoModelo` não cria `x[(i, slot)]` para slot indisponível
      da turma (checar chaves de `ctx.x`).
- [ ] Teste de ponta (`resolver`): turma com 2 tempos indisponíveis e carga
      = slots − 2 → `otimo`, e nenhuma `AulaAlocada` nesses slots.
- [ ] Teste: duas turmas do mesmo turno com indisponibilidades diferentes e
      um professor comum → viável e sem choque.
- [ ] Implementar: `ContextoModelo.__init__` usa
      `instancia.slots_da_turma(t)` em vez de `slots_do_turno(t.turno_id)`.
      Nenhuma outra linha do modelo muda (o `exactly_one` por slot já itera
      `_slots_turma`).
- [ ] Atualizar docstring de `ContextoModelo` ("turma tem exatamente 1 aula
      por slot **disponível**").
- [ ] `feat(engine): turma sem aula em slots indisponíveis`

### Task 3 — Regras existentes sob grade reduzida

Arquivos: um teste novo por regra afetada em `tests/test_regras_*.py`
(arquivo da regra correspondente).

Revisão do catálogo (feita no planejamento):

| Regra | Situação |
|---|---|
| `geminadas`, `aulas_juntas` | ok: já checam `ordem + 1`; um tempo indisponível no meio separa blocos (correto) |
| `janelas_professor` | ok: só considera slots das turmas do professor. **Atenção:** um slot que nenhuma turma do professor tem deixa de existir na conta — buraco "natural" não vira janela. Documentar |
| `compactacao_dias`, `distribuicao_disciplina`, `nao_mesmo_dia`, `preferencia_*`, `recurso` | ok: derivam dos slots da turma; dia sem slot disponível some de `dias` |
| `ultimo_horario` | muda de semântica (D5) — teste + docstring |
| `disciplina_sincronizada` | **bug latente**: itera só os slots da turma de referência; se a referência tem um tempo indisponível que outra turma tem, a aula da outra turma nesse tempo fica livre. Corrigir iterando a **união** dos slots das turmas do grupo (`occ_atribuicao` já devolve 0 para slot inexistente) |

- [ ] Teste `ultimo_horario`: turma que termina mais cedo na sexta → regra
      age no último tempo **dela**.
- [ ] Teste `disciplina_sincronizada` (hard): referência sem o 5º tempo,
      outra turma com → disciplina não pode ir ao 5º tempo da outra turma.
      Falha antes da correção; corrigir em `sincronizada.py`.
- [ ] Teste `janelas_professor`: professor da 1A (que sai no 4º tempo) não
      paga janela pelo 5º tempo inexistente.
- [ ] Atualizar docstrings (limitações) de `ultimo_horario`, `janelas`,
      `sincronizada`.
- [ ] `fix(engine): regras respeitam slots indisponíveis da turma`

### Task 4 — Avaliador (edição manual)

Arquivos: `avaliador.py`, `engine/tests/test_avaliador.py`.

- [ ] Teste: grade com aula num slot indisponível da turma →
      `violacoes_hard == ["estrutural:turma_indisponivel:<turma>:<slot>"]`
      (hoje cairia em `KeyError` em `_ocupados_da_grade`).
- [ ] Teste: grade válida de turma com tempos vagos avalia normalmente (nº
      de aulas = carga, não = slots do turno).
- [ ] Implementar em `_violacoes_estruturais` usando
      `instancia.slots_da_turma(...)` no lugar de `slots_do_turno`.
- [ ] Documentar o novo motivo em `resultado.py` (docstring dos motivos).
- [ ] `feat(engine): avaliador acusa aula em horário sem aula da turma`

### Task 5 — Regra `disponibilidade_disciplina` (hard) — skill `nova-regra`

Arquivos: `regras/disponibilidade_disciplina.py`, `regras/__init__.py`,
`tests/test_regras_disponibilidade_disciplina.py`.

- [ ] Testes: aula nunca cai em slot `indisponivel` da disciplina; regra
      inativa → pode cair; conflito (carga > slots livres da disciplina na
      turma) → `inviavel` com `disponibilidade_disciplina:<id>` no núcleo.
- [ ] Implementar (classe com docstring + limitações), registrar.
- [ ] Incluir no `gerador.py` padrão (`RegraConfig(id="disp_disc", tipo=
      "disponibilidade_disciplina", hard=True)`), sem marcações por padrão.
- [ ] `feat(engine): regra disponibilidade_disciplina`

### Task 6 — Regra `preferencia_disciplina_horario` (soft)

Arquivos: `regras/preferencia_slot.py` (junto das outras preferências) ou
arquivo próprio, `tests/test_regras_preferencia_disciplina_horario.py`.

- [ ] Testes: custo em `evita`; custo fora de `prefere` quando há algum
      `prefere`; ocorrências localizadas com `aulas_em(..., "turma")`.
- [ ] Implementar espelhando `RegraPreferenciaProfessor`.
- [ ] `feat(engine): regra preferencia_disciplina_horario`

### Task 7 — Gerador + benchmark

Arquivos: `gerador.py`, `bench/benchmark.py`, registro de medições.

- [ ] `gerador` ganha opção para marcar N turmas com tempos indisponíveis
      (ex.: últimos tempos de sexta), ajustando a carga — teste do gerador.
- [ ] Rodar `python bench/benchmark.py` (20/40/80) **sem** a opção e comparar
      com a última medição registrada (sem regressão; overshoot ~10% no 80 é
      conhecido). Rodar também **com** a opção e registrar.
- [ ] `docs(engine): benchmark com disponibilidade de turma`
- [ ] Despachar `revisor-engine` sobre o diff de `engine/` da Parte A.

---

## Parte B — Banco (Supabase)

### Task 8 — Migração

Arquivo: `supabase/migrations/2026102xxxxxxx_disponibilidade_turma_disciplina.sql`;
testes pgTAP em `supabase/tests/00xx_disponibilidade_turma_disciplina.test.sql`.

- [ ] Tabela `turma_slots_sem_aula (id, unidade_id, turma_id, slot_id,
      unique (turma_id, slot_id))` — só guarda os indisponíveis (D2; ausência
      = disponível). FKs com `on delete cascade`.
- [ ] Tabela `disponibilidades_disciplina (id, unidade_id, disciplina_id,
      slot_id, status disponibilidade_status, unique (disciplina_id,
      slot_id))`.
- [ ] RLS no mesmo padrão de `disponibilidades` (select por
      `minhas_unidades()`, escrita `(select tenho_papel(...))` admin/
      coordenador) e constraints de mesmo tenant como em
      `20260831212000_integridade_tenant.sql`.
- [ ] Check de que o slot da turma pertence ao turno da turma (trigger ou
      checagem na RPC — a RPC é o único caminho de escrita do app).
- [ ] RPCs transacionais `salvar_sem_aula_turma(p_turma, p_slots uuid[])` e
      `salvar_disponibilidades_disciplina(p_disciplina, p_marcacoes jsonb)`,
      no molde de `salvar_disponibilidades`.
- [ ] `regras_tipo_check` += `'disponibilidade_disciplina',
      'preferencia_disciplina_horario'`.
- [ ] Carga (`importar` / RPC de pacote em `20261018000000_carga_codigo_externo.sql`):
      aceitar `turmas_sem_aula` e `disponibilidades_disciplina` no pacote.
- [ ] pgTAP: RLS (professor não escreve, outra unidade não lê), tenant,
      RPCs, cascata ao regravar a grade do turno.
- [ ] `feat(db): disponibilidade de turma e disciplina`

---

## Parte C — App

### Task 9 — Montagem da instância e matriz cheia do app

Arquivos: `app/src/lib/instancia.ts`, `app/src/lib/supabase/ler-todas.ts`,
`app/src/lib/matriz.ts`, `app/src/app/(interno)/geracoes/actions.ts`, testes
vitest.

- [ ] Teste: `montarInstancia` preenche `turmas[].disponibilidade` (slots sem
      aula → `"indisponivel"`) e `disciplinas[].disponibilidade`.
- [ ] Teste: `calcularPendencias` usa slots **disponíveis** da turma
      (espelho de `validar_matriz_cheia`) e a mensagem diz "X de Y horários".
- [ ] Mesma correção em `lib/carga/validacao.ts` (linha da "carga total").
- [ ] `feat(app): instância com disponibilidade de turma e disciplina`

### Task 10 — Telas de matriz

Arquivos: `app/src/app/(interno)/turmas/[id]/horarios/` e
`app/src/app/(interno)/disciplinas/[id]/disponibilidade/`, reaproveitando
`professores/[id]/disponibilidade/matriz.tsx` e `lib/disponibilidade.ts`.

- [ ] Extrair a matriz do professor para um componente genérico
      (`MatrizDisponibilidade` com `ciclo` configurável).
- [ ] Turma: ciclo de 2 estados (`Tem aula` / `Sem aula`), mostrando ao vivo
      "carga atribuída N de M horários disponíveis".
- [ ] Disciplina: ciclo de 4 estados, como o professor; seletor de turno
      quando a disciplina aparece em mais de um.
- [ ] Links nas listas de turmas/disciplinas; Server Actions chamando as RPCs
      da Task 8.
- [ ] Regras: as duas regras novas no catálogo de `regras/formulario.tsx` e
      `lib/validacao/regras.ts`.
- [ ] `feat(app): matrizes de horários da turma e da disciplina`

### Task 11 — Grade, edição manual e núcleo

Arquivos: `app/src/app/(interno)/grade/[cenarioId]/…`, `lib/edicao/*`,
`lib/nucleo.ts`.

- [ ] Grade da turma: slot indisponível renderizado como célula "—" (sem
      aula), não arrastável e não alvo de troca. A edição continua sendo
      troca de duas aulas da mesma turma, então a matriz cheia (sobre os
      slots disponíveis) segue garantida por construção.
- [ ] Grade do professor: sem mudança (o tempo só não tem aula).
- [ ] `nucleo.ts`: textos para `disponibilidade_disciplina:<id>` e
      `estrutural:turma_indisponivel:…`; o diagnóstico de geminadas
      (linha ~77) passa a descontar também os tempos sem aula da turma.
- [ ] `feat(app): grade e núcleo com horários sem aula`

### Task 12 — Importação CSV

Arquivos: `lib/carga/csv.ts`, `pacote.ts`, `validacao.ts`, `arquivos.ts`,
`importar/*`.

- [ ] Arquivos opcionais `turmas_sem_aula.csv` (turma, dia, horário) e
      `disponibilidades_disciplina.csv` (disciplina, dia, horário, status),
      no formato do CSV de disponibilidade de professor.
- [ ] Validação e mensagens em português; testes vitest.
- [ ] `feat(app): importação de horários sem aula e disponibilidade de disciplina`

### Task 13 — E2E e migração dos dados reais

- [ ] Playwright (staging): marcar sem aula na turma, gerar, conferir célula
      vazia; marcar disciplina indisponível, gerar, conferir ausência.
- [ ] Roteiro de limpeza da unidade real (manual, depois do deploy):
      1. em cada turma 1A/1B, marcar como "Sem aula" os slots hoje ocupados
         por "Horário livre" (a última geração oficial diz quais são);
      2. excluir as atribuições "Horário livre", os professores "Vago 1A"/
         "Vago 1B" e a disciplina "Horário livre";
      3. gerar de novo e comparar com o cenário oficial anterior.
      Opcional: script SQL de conversão automática (atribuição de professor
      "Vago*" → slots sem aula), executado só após conferência.
- [ ] Exportação (3B/escolajba): registrar no spec da Fase 3 que célula sem
      aula vira vazio no arquivo exportado.
- [ ] `docs: disponibilidade de turma e disciplina`

---

## Ordem de entrega e riscos

1. **Parte A** pode ser mergeada sozinha (campos opcionais, retrocompatível).
2. **Parte B** antes da C; a C depende das RPCs.
3. Riscos:
   - snapshots antigos de `geracoes.instancia`: cobertos pelos defaults;
   - turma com **dia inteiro** sem aula: `distribuicao_disciplina` usa
     `len(dias)` só de dias com slot — teste explícito na Task 3;
   - `disciplina_sincronizada` entre turmas com tempos diferentes pode ficar
     inviável na versão hard — mensagem do núcleo já sugere desativar; citar
     "tempos sem aula diferentes entre as turmas" no texto.

---

## Execução (19/10/2026)

Tasks 1–12 implementadas na branch `claude/nice-bell-1o7bdc`; Task 13
pendente (ver abaixo).

**Benchmark** (`bench/benchmark.py`, seed 7, budget 60 s, VM compartilhada;
master × branch rodados em sequência na mesma máquina):

| turmas | master: status / custo / tempo | branch | branch `--sem-aula 0.25` |
|---|---|---|---|
| 20 | viavel / 471 / 60,4 s | viavel / 462 / 60,4 s | viavel / 452 / 60,5 s (495 aulas) |
| 40 | viavel / 1137 / 60,8 s | viavel / 1146 / 60,9 s | viavel / 1052 / 60,7 s (990 aulas) |
| 80 | viavel / 8786 / 61,6 s | viavel / 5648 / 61,7 s | viavel / 5761 / 61,6 s (1980 aulas) |

Sem regressão de tempo; a variação de custo é ruído de soluções `viavel`
(sem prova de ótimo) — o modelo sem marcações é idêntico ao da master.

**Testes de banco:** os 14 arquivos pgTAP (incluindo `0013` e `0014`, novos)
passam num Postgres 16 local com uma emulação mínima do Supabase (roles
`anon`/`authenticated`/`service_role`, `auth.uid()`/`auth.jwt()`, pgTAP em
`extensions`). Worker: 19 testes passando contra o mesmo banco local.

**Desvios do plano:**

- Task 3: `janelas_professor` só ganhou a limitação na docstring, sem teste
  — fixar em teste um comportamento que é limitação não protege nada.
- Task 5: a regra `disponibilidade_disciplina` não entrou nas regras padrão
  do `gerador` (sem marcações de disciplina ela não restringe nada).
- Task 12: além do CSV, o JSON Schema (`docs/carga/pacote-carga.schema.json`)
  e a RPC `importar_pacote_carga` (migração `20261019000100`) ganharam as
  seções; disponibilidade de disciplina e horário sem aula importados não
  apagam marcações existentes (modo "mesclar", como as disponibilidades).
- Snapshot: `impressaoInstancia` trata `disponibilidade` ausente (gerações
  antigas) como vazia, senão toda geração antiga acusaria "cadastros
  mudaram".

**Pendente (Task 13):** E2E Playwright no staging (exige as envs do staging
e um validador local) e a limpeza dos dados reais (roteiro acima: marcar os
horários sem aula da 1A/1B, apagar "Vago 1A"/"Vago 1B"/"Horário livre",
gerar de novo e comparar). Aplicar as migrações `20261019000000` e
`20261019000100` antes do deploy do app; o motor do worker/validador precisa
ser publicado junto (o app passa a mandar `disponibilidade` em turmas e
disciplinas, que o motor antigo ignora — sem quebra, mas sem efeito).
