# Exportação do horário para o escolajba (`quadro_horarios`)

Fecha o ciclo da integração:

```
escolajba ──pacote de carga (docs/carga)──▶ PyTime ──gera horário──▶ cenário
    ▲                                                                   │
    └──────────── exportação quadro_horarios (este documento) ◀─────────┘
```

Depois de gerar o horário, o PyTime exporta as alocações de **um cenário**
(normalmente o oficial) já no formato da tabela `quadro_horarios` do
escolajba. O escolajba então grava essas linhas num `horario` (versão do
quadro), sem precisar redigitar nada.

| Arquivo | Conteúdo |
|---|---|
| `quadro-horarios.schema.json` | JSON Schema (draft 2020-12) do arquivo exportado — contrato vinculante |
| `exemplos/quadro-horarios-exemplo.json` | exportação real do cenário que o motor gerou para `docs/carga/exemplos/pacote-exemplo.json` (70 aulas → 31 linhas) |
| `exemplos/quadro-horarios-exemplo.csv` | as mesmas linhas em CSV (`;`, UTF-8), com as colunas na ordem da tabela |

## 1. A tabela de destino

`quadro_horarios` (escolajba, `database/migrations/0013_01_01_000000_create_horarios_aulas_tables.php`):

| Coluna | Na exportação |
|---|---|
| `id`, `created_at`, `updated_at` | **não exportadas**, quem cuida delas é o escolajba |
| `horario_id` | **não exportada**: o usuário escolhe o `horario` de destino na importação (seção 4) |
| `servidor_id` | id do professor (`servidores.id`) |
| `disciplina_id` | id da disciplina (`disciplinas.id`) |
| `rota_id`, `unidade_id` | **não exportadas** (não são mais usadas, ficam `null`) |
| `dia_semana` | 0 = domingo, 1 = segunda … 6 = sábado (convenção do escolajba) |
| `turno` | 1 = Manhã, 2 = Tarde, 3 = Noite, 4 = Integral |
| `ordem` | sempre `null`, porque é a ordenação manual de exibição do escolajba |
| `t1_id` … `t7_id` | turma (`turmas.id`) atendida no **tempo i do dia**, ou `null` para tempo livre |
| `t1_status` … `t7_status` | sempre `Aberto` |

Semântica (escolajba, `app/Services/Aulas/TemposAulaService.php`): **cada linha
é professor × disciplina × dia da semana × turno**. A posição da coluna é o
tempo de aula, ou seja, `t3_id = 201` quer dizer que o professor dá essa
disciplina à turma 201 no 3º tempo daquele dia.

Sobre o status: `Encerrado` marca o lançamento de aula já encerrado, um estado
operacional do escolajba. Um horário recém-gerado nunca está encerrado, então
a exportação grava `Aberto` em todos os tempos. Tempo livre fica com
`t{i}_id = null` e status `Aberto`, igual ao que a tela do escolajba grava
quando o usuário escolhe "Livre".

## 2. Conversão das alocações

Para cada aula alocada do cenário (`aulas_alocadas` ⋈ `atribuicoes` ⋈ `slots`),
o exportador aplica as regras abaixo.

### 2.1 Ids do escolajba

O PyTime não guarda ids do escolajba: guarda o `codigo_externo` que veio no
pacote de carga (`docs/carga`, seção 7). O id sai do próprio código:

| Entidade no PyTime | Código | Id no escolajba |
|---|---|---|
| professor | `SRV-{id}` | `servidor_id = {id}` |
| disciplina | `DIS-{id}` | `disciplina_id = {id}` |
| turma | `TUR-{id}` | `t{i}_id = {id}` |

Registro sem código nesse padrão gera **erro**, e a exportação para listando
todos eles. Isso acontece com registros criados à mão no PyTime e que não
existem no escolajba. O exportador nunca inventa um id.

### 2.2 Dia da semana

`dia_semana = (slot.dia + 1) % 7`. O PyTime usa 0 = segunda, então segunda
vira 1 e domingo (6) vira 0.

### 2.3 Turno e tempo

O tempo do escolajba é a **posição absoluta no dia**: manhã = T1–T4, tarde =
T5–T7, integral = T1–T7 (`Falta::TEMPOS_MANHA`/`TEMPOS_TARDE`). O PyTime
numera os horários de cada turno a partir de 0 (`slot.ordem`), por isso o
exportador converte pelo código do turno:

| Código do turno no PyTime | `turno` | Tempos (ordem 0, 1, …) |
|---|---|---|
| `MANHA` | 1 | T1, T2, T3, T4 |
| `TARDE` | 2 | T5, T6, T7 |
| `NOITE` | 3 | T1 … T7 |
| `INTEGRAL` | 4 | T1 … T7 |

`tempo = tempos_do_turno[slot.ordem]`. Uma ordem que passa da lista (por
exemplo, a 5ª aula de `MANHA`) é **erro**, porque não existe coluna para ela.
Um turno com código fora dessa tabela também é erro.

### 2.4 Agrupamento em linhas

As aulas são agrupadas pela chave **(servidor_id, disciplina_id, dia_semana,
turno)**, e cada aula preenche `t{tempo}_id` da sua linha:

```
para cada aula (atribuição a, slot s):
    turno, tempos = TURNOS[s.turno.codigo]
    tempo = tempos[s.ordem]
    chave = (id(a.professor), id(a.disciplina), (s.dia + 1) % 7, turno)
    linha[chave].t{tempo}_id = id(a.turma)
```

O professor tem no máximo uma linha por disciplina, dia e turno. Professor
com duas disciplinas no mesmo dia ocupa duas linhas, e cada uma tem só os
seus tempos preenchidos. É o mesmo formato que o escolajba produz quando o
quadro é digitado à mão.

### 2.5 Conferências antes de gravar o arquivo

O arquivo só é gerado se todas estas checagens passarem:

1. O cenário pertence a uma geração `otimo` ou `viavel`.
2. Todos os códigos se convertem (2.1) e todos os tempos cabem (2.3).
3. Nenhuma célula `t{i}_id` recebe duas aulas. O motor já garante isso dentro
   de um turno.
4. O mesmo professor não aparece em duas linhas de **turnos diferentes** com
   o mesmo dia e tempo. Os turnos do PyTime são grades independentes, então
   um professor alocado em `MANHA` ordem 0 e em `INTEGRAL` ordem 0 colide no
   T1 do escolajba. Essa colisão é **aviso**, e o escolajba também a destaca
   em vermelho na tela do quadro.
5. O nº de tempos preenchidos é igual ao nº de aulas alocadas do cenário.

## 3. Formatos

**JSON** (`quadro-horarios.schema.json`):

```json
{
  "versao": "1.0",
  "origem": { "sistema": "pytime", "cenario_id": "…", "status": "otimo",
              "oficial": true, "escola_inep": "12011517", "ano_letivo": 2027,
              "gerado_em": "2026-10-18T11:00:00-05:00" },
  "quadro_horarios": [
    { "servidor_id": 102, "disciplina_id": 12, "dia_semana": 1, "turno": 4,
      "ordem": null,
      "t1_id": 202, "t1_status": "Aberto", "t2_id": 201, "t2_status": "Aberto",
      "t3_id": 201, "t3_status": "Aberto", "t4_id": null, "t4_status": "Aberto",
      "t5_id": null, "t5_status": "Aberto", "t6_id": null, "t6_status": "Aberto",
      "t7_id": null, "t7_status": "Aberto" }
  ]
}
```

**CSV**: um arquivo com cabeçalho e as colunas na ordem da tabela. Separador
`;`, UTF-8, `null` = célula vazia:

```
servidor_id;disciplina_id;dia_semana;turno;ordem;t1_id;t1_status;…;t7_id;t7_status
102;12;1;4;;202;Aberto;201;Aberto;201;Aberto;;Aberto;;Aberto;;Aberto;;Aberto
```

As linhas saem ordenadas por (dia_semana, turno, servidor_id, disciplina_id).
O JSON carrega os metadados de `origem`. O CSV serve para conferir no Excel ou
para um `LOAD DATA`.

## 4. Importação no escolajba

Referência para quem for implementar o lado do escolajba (comando artisan ou
tela em "Horários"):

1. O usuário cria (ou escolhe) o `horario` de destino: `calendario_id`,
   `descricao`, `tipo_aula`, `data_inicio`, `data_fim`. O arquivo **não**
   escolhe a vigência.
2. Validar o arquivo contra o schema e conferir se cada `servidor_id`,
   `disciplina_id` e `t{i}_id` existe na escola (`EscolaScope`). Para turmas,
   conferir também se são do ano do calendário.
3. Gravar todas as linhas em **uma transação**, com `horario_id` = destino e
   `rota_id`/`unidade_id` = `null`.
4. **Importar sempre num `horario` vazio.** Substituir linhas de um horário
   já usado quebraria o vínculo `aula_dadas.quadro_horario_id` das aulas já
   lançadas. Para trocar o quadro no meio do ano, crie um `horario` novo com a
   vigência nova, que é o mesmo fluxo de hoje.
5. Depois de importar, rodar `QuadroHorarioController::chCompare` por
   professor para conferir a CH prevista contra o quadro.

## 5. Implementação no PyTime (Fase 3)

O exportador pertence ao **app**, como Server Action/rota de download em
`/grade/[cenarioId]`, ou então ao **worker**. Nunca ao `engine/`: o motor não
conhece cenários, banco nem formatos de terceiros (regra 1 do `CLAUDE.md`).
A conversão da seção 2 é uma função pura de (alocações + atribuições + slots
+ códigos externos) → linhas, testável sem banco, no mesmo espírito de
`app/src/lib/instancia.ts`. Ela depende da coluna `codigo_externo` (ver
`docs/carga/README.md`, seção 6).
