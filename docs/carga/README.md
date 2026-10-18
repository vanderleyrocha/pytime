# Modelos de carga de dados do PyTime

Formato padrão para alimentar o banco do PyTime a partir de um sistema de
gestão escolar externo (ex.: [escolajba](https://github.com/vanderleyrocha/escolajba)),
em vez de digitar cadastros à mão.

| Arquivo | Conteúdo |
|---|---|
| `pacote-carga.schema.json` | JSON Schema (draft 2020-12) do **pacote de carga** — contrato vinculante |
| `exemplos/pacote-exemplo.json` | pacote completo e válido (turno integral com 7 tempos, 2 turmas, 9 disciplinas, 6 professores) que o motor resolve com status `otimo` |
| `modelos/*.csv` | os mesmos dados no formato CSV, um arquivo por entidade (servem de modelo de planilha) |

## 1. Princípios

1. **Um pacote = uma unidade (escola) num ano letivo.** O importador grava
   tudo na unidade selecionada pelo usuário no PyTime. O pacote não cria
   redes, unidades, usuários, convites, gerações nem cenários.
2. **Referências por `codigo`, nunca por UUID.** O sistema de origem não
   conhece os UUIDs do PyTime. Cada entidade carrega um `codigo` estável
   (definido pela origem), e as referências entre entidades usam esse código.
   O importador resolve `codigo → uuid`.
3. **O código é estável entre exportações.** Exportar de novo gera os mesmos
   códigos para as mesmas coisas. Assim a reimportação **atualiza** os
   registros (upsert) em vez de duplicá-los.
4. **Carga em modo "mesclar".** Registros do pacote são inseridos ou
   atualizados. Registros que já existem no PyTime e não vêm no pacote **não
   são apagados**. Remoções continuam sendo feitas na interface.
5. **Pacote atômico.** Se qualquer validação da seção 5 falhar, nada é gravado
   e o usuário recebe a lista completa de erros.

## 2. Formatos aceitos

### 2.1 JSON (preferencial para integração sistema a sistema)

Um único arquivo `.json` em UTF-8, validado por `pacote-carga.schema.json`:

```json
{
  "versao": "1.0",
  "origem": { "sistema": "escolajba", "escola_inep": "12011517",
              "ano_letivo": 2027, "gerado_em": "2026-10-18T10:00:00-05:00" },
  "turnos": [...], "horarios": [...], "turmas": [...],
  "disciplinas": [...], "professores": [...], "recursos": [...],
  "disponibilidades": [...], "atribuicoes": [...], "regras": [...]
}
```

`recursos`, `disponibilidades` e `regras` são opcionais. As demais seções são
obrigatórias, mas podem vir vazias quando a origem não tiver esses dados.

### 2.2 CSV (preferencial para planilhas e conferência humana)

Um `.zip` com os arquivos de `modelos/`, sempre com estes nomes:

- **Codificação e separador:** UTF-8 (BOM tolerado) e separador **`;`**, que é
  o padrão do Excel em pt-BR. Aspas duplas seguem a RFC 4180.
- **Cabeçalho:** a 1ª linha é obrigatória e traz exatamente os nomes de campo
  da seção 3. A ordem das colunas é livre.
- **Obrigatoriedade dos arquivos:** `origem.csv` e os arquivos das seções
  obrigatórias precisam estar presentes. Arquivo opcional ausente = lista
  vazia.
- **Valores especiais:**
  - célula vazia = campo ausente, e então vale o default;
  - booleanos são `true`/`false`;
  - listas (`atribuicoes.recursos`) separam códigos com `|`;
  - `regras.parametros` é um objeto JSON escrito dentro da célula.

## 3. Entidades e campos

Convenções:

- `codigo`: 1–64 caracteres em `[A-Za-z0-9._-]`, sem espaços nem acentos.
  É único **dentro da sua entidade**: um professor e uma turma podem ter o
  mesmo código.
- `dia`: **0 = segunda**, 1 = terça, … 4 = sexta, 5 = sábado, 6 = domingo.
- `ordem`: posição do horário no dia dentro do turno (**0 = primeiro horário**).
- `hora`: `HH:MM` (24 h).

Na coluna "Obr.", ✔ marca campo obrigatório. Para os opcionais, a coluna
mostra o default, quando existe.

### turnos → tabela `turnos`
| Campo | Tipo | Obr. | Descrição |
|---|---|---|---|
| `codigo` | código | ✔ | `MANHA`, `TARDE`, `NOITE` ou `INTEGRAL` quando o horário for exportado de volta ao escolajba (ver `docs/exportacao`) |
| `nome` | texto | ✔ | ex.: "Manhã" |

### horarios → tabela `slots`
Grade semanal de cada turno. A chave natural é **(turno, dia, ordem)**, que
precisa ser única.
| Campo | Tipo | Obr. | Descrição |
|---|---|---|---|
| `turno` | código de turno | ✔ | |
| `dia` | 0–6 | ✔ | |
| `ordem` | inteiro ≥ 0 | ✔ | |
| `hora_inicio` | HH:MM | | só exibição |
| `hora_fim` | HH:MM | | só exibição |

### turmas → tabela `turmas`
| Campo | Tipo | Obr. | Descrição |
|---|---|---|---|
| `codigo` | código | ✔ | |
| `nome` | texto | ✔ | ex.: "6º ano A" |
| `turno` | código de turno | ✔ | a turma usa a grade (horários) deste turno |

### disciplinas → tabela `disciplinas`
| Campo | Tipo | Obr. | Descrição |
|---|---|---|---|
| `codigo` | código | ✔ | |
| `nome` | texto | ✔ | |

### professores → tabela `professores`
| Campo | Tipo | Obr. | Descrição |
|---|---|---|---|
| `codigo` | código | ✔ | ex.: matrícula do servidor |
| `nome` | texto | ✔ | |

### recursos → tabela `recursos` (opcional)
Espaços compartilhados (laboratório, quadra) com capacidade por horário.
| Campo | Tipo | Obr. | Descrição |
|---|---|---|---|
| `codigo` | código | ✔ | |
| `nome` | texto | ✔ | |
| `capacidade` | inteiro ≥ 1 | 1 | nº de turmas simultâneas no recurso |

### disponibilidades → tabela `disponibilidades` (opcional)
Só as **exceções**: um horário não listado conta como `disponivel`. A chave
natural é **(professor, turno, dia, ordem)**, e o horário (turno, dia, ordem)
precisa existir em `horarios`.
| Campo | Tipo | Obr. | Descrição |
|---|---|---|---|
| `professor` | código de professor | ✔ | |
| `turno` | código de turno | ✔ | |
| `dia` | 0–6 | ✔ | |
| `ordem` | inteiro ≥ 0 | ✔ | |
| `status` | `disponivel` \| `indisponivel` \| `prefere` \| `evita` | ✔ | `indisponivel` é hard; `prefere`/`evita` são preferências |

### atribuicoes → tabelas `atribuicoes` + `atribuicao_recursos`
"Professor X leciona disciplina Y na turma Z, N aulas por semana." A chave
natural é **(professor, disciplina, turma)**, que precisa ser única.
| Campo | Tipo | Obr. | Descrição |
|---|---|---|---|
| `professor` | código de professor | ✔ | |
| `disciplina` | código de disciplina | ✔ | |
| `turma` | código de turma | ✔ | |
| `carga_semanal` | inteiro ≥ 1 | ✔ | aulas por semana |
| `geminadas` | inteiro ≥ 0 | 0 | nº de **pares** de aulas consecutivas exigidos |
| `recursos` | lista de códigos de recurso | `[]` | recursos que a aula ocupa |

### regras → tabela `regras` (opcional)
| Campo | Tipo | Obr. | Descrição |
|---|---|---|---|
| `codigo` | código | ✔ | identifica a regra para reimportação |
| `tipo` | um dos 10 tipos do catálogo | ✔ | ver tabela abaixo |
| `hard` | booleano | ✔ | precisa respeitar o modo do tipo |
| `peso` | inteiro ≥ 1 | 1 | peso da penalidade (soft) |
| `ativa` | booleano | true | |
| `parametros` | objeto | `{}` | referências **por código** |

| `tipo` | `hard` | `parametros` |
|---|---|---|
| `disponibilidade_professor`, `geminadas`, `recurso_compartilhado` | sempre `true` | `{}` |
| `janelas_professor`, `preferencia_professor`, `compactacao_dias` | sempre `false` | `{}` |
| `distribuicao_disciplina` | sempre `false` | `{"max_por_dia": 2}` |
| `preferencia_disciplina` | sempre `false` | `{"disciplina": "MAT", "ordens": [0,1], "modo": "prefere"}` (`modo`: `evita`\|`prefere`) |
| `ultimo_horario` | `true` ou `false` | `{"disciplina": "EDF"}` |
| `nao_mesmo_dia` | `true` ou `false` | `{"disciplina_a": "HIS", "disciplina_b": "GEO"}` (precisam ser diferentes) |

> Ao gravar, o importador traduz `disciplina` para `disciplina_id` (UUID), e
> `disciplina_a`/`disciplina_b` para os UUIDs correspondentes. É o formato que
> `app/src/lib/validacao/regras.ts` e o motor esperam.

## 4. Ordem de carga

A ordem segue as dependências de chave estrangeira:

```
turnos → horarios → turmas
disciplinas, professores, recursos
→ disponibilidades (professor + horário)
→ atribuicoes (professor + disciplina + turma) → atribuicao_recursos
→ regras (referenciam disciplinas)
```

## 5. Validações do importador

Os erros bloqueiam a carga. Os avisos são exibidos e o usuário pode
prosseguir.

**Erros** (o que o JSON Schema já cobre, mais as checagens cruzadas):

1. O pacote viola o JSON Schema: tipo, campo obrigatório, enum, `hard`
   incompatível com o tipo da regra ou formato de hora.
2. `codigo` duplicado dentro de uma entidade.
3. Chave natural duplicada em `horarios`, `disponibilidades` ou `atribuicoes`.
4. A referência a um código não existe, nem no pacote nem já cadastrada na
   unidade. Isso vale para os turnos de horários e turmas, para
   professor/disciplina/turma/recursos das atribuições, para o horário das
   disponibilidades e para as disciplinas das regras.
5. `2 × geminadas > carga_semanal`.
6. `hora_fim <= hora_inicio`, quando as duas são informadas.
7. `nao_mesmo_dia` com `disciplina_a == disciplina_b`.

**Avisos** (o mesmo diagnóstico que o motor faria na geração):

- **Matriz incompleta:** a soma de `carga_semanal` das atribuições da turma é
  diferente do nº de horários do turno dela. O motor exige igualdade
  (`Instancia.validar_matriz_cheia`).
- A carga semanal do professor passa do nº de horários em que ele está
  disponível.
- Turma sem nenhuma atribuição.
- Recurso exigido por mais aulas simultâneas do que a capacidade comporta.

## 6. Requisito no banco para reimportação

O upsert por código exige guardar o código de origem. A migration do
importador deve adicionar a coluna em `turnos`, `turmas`, `disciplinas`,
`professores`, `recursos` e `regras`:

```sql
alter table <tabela> add column codigo_externo text;
create unique index <tabela>_codigo_externo_unico
  on <tabela> (unidade_id, codigo_externo) where codigo_externo is not null;
```

`slots`, `disponibilidades` e `atribuicoes` usam as chaves naturais da seção
3, que o banco já garante com `unique (turno_id, dia, ordem)`,
`unique (professor_id, slot_id)` e
`unique (professor_id, disciplina_id, turma_id)`.

## 7. Mapeamento a partir do escolajba

Referência para o exportador do lado do escolajba (Laravel/MySQL). Uma
exportação equivale a uma escola (`escolas.id` = INEP) num ano letivo
(`ano`).

| PyTime | Origem no escolajba | Observações |
|---|---|---|
| `origem.escola_inep` | `escolas.id` | o id da escola já é o código INEP |
| `turnos` | valores distintos de `turmas.turno` no ano | 1 → `MANHA`, 2 → `TARDE`, 3 → `NOITE`, 4 → `INTEGRAL` (`Falta::TURNOS`) |
| `horarios` | **não há tabela**: gerar a partir de `Falta::TEMPOS*` | `MANHA` = T1–T4 → `ordem` 0–3; `TARDE` = T5–T7 → `ordem` 0–2; `INTEGRAL` = T1–T7 → `ordem` 0–6; dias 0–4. As horas existem só em `AulaController` (opcional) |
| `turmas` | `turmas` (do `ano`, status ≠ Encerrada) | `codigo` = `TUR-{id}`; `nome` = `nome_abreviado` ou `nome` |
| `disciplinas` | `disciplinas` presentes em `disciplina_serie` do ano | `codigo` = `DIS-{id}` (a tabela não tem código próprio); `nome` = `nome` |
| `professores` | `servidores` com `funcao = 'Professor'` e `ativo` | `codigo` = `SRV-{id}`. **Não** usar `matricula`, que não é única no banco |
| `atribuicoes` | `professor_turma` ⋈ `disciplina_professor` (do `ano`, `turma_id` não nulo) | professor, disciplina e turma vêm do join |
| `atribuicoes.carga_semanal` | `disciplina_serie.ch_semanal` (disciplina × `turmas.serie_id` × ano) | para optativas de itinerário use `Disciplina::ch_semanal(...)`, que lê `rota_unidade` |
| `atribuicoes.geminadas` | não existe | exportar `0` e ajustar no PyTime |
| `recursos` | não existe | omitir e cadastrar no PyTime |
| `disponibilidades` | não existe | omitir e cadastrar no PyTime |
| `regras` | não existe | omitir, ou exportar um conjunto padrão da escola |

Pontos de atenção:

- **Dia da semana.** No `quadro_horarios.dia_semana` do escolajba, 0 é
  **domingo**. No PyTime, 0 é **segunda**. A conversão é
  `dia_pytime = (dia_semana + 6) % 7`.
- **Turno integral.** No escolajba os tempos 1–4 são de manhã e 5–7 à tarde,
  mas a turma integral é uma só. No PyTime ela deve usar **um** turno
  `INTEGRAL` com 7 horários por dia. Não divida em manhã e tarde, senão a
  turma fica em dois turnos.
- **Itinerários/rotas e eletivas.** Atribuições com `rota_turmas_id` ou
  `eletiva_professor_id` (sem `turma_id`) juntam alunos de várias turmas. O
  PyTime v1 ainda não modela esse agrupamento. Exporte essas atribuições à
  parte, para revisão, e não as inclua no pacote. Sem elas a matriz da turma
  fica incompleta, e o importador avisa.
- **Conferência.** `QuadroHorarioController::chCompare` já compara a CH
  prevista com o quadro. Vale rodar essa comparação antes de exportar.
- **Volta ao escolajba.** O horário gerado volta como linhas de
  `quadro_horarios` (`docs/exportacao/README.md`). Essa volta só funciona se
  os códigos `SRV-{id}`, `DIS-{id}` e `TUR-{id}` e os códigos de turno da
  tabela acima forem mantidos.
