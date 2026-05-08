# Auditoria

A página `/auditoria` é o histórico imutável de **tudo** o que cada
membro faz na app. Foi adicionada na **PR #55** com a migration
`supabase/migrations/20260508100000_audit_log.sql`.

## O que é registado

Triggers em todas as tabelas user-owned capturam cada `INSERT`,
`UPDATE`, `DELETE`. Os `UPDATE` que mexem em `deleted_at` são
reclassificados como `SOFT_DELETE` (pôr não-null) ou `RESTORE` (pôr
null) para serem mais legíveis.

Tabelas com auditoria activa:

| Tabela | O que é capturado |
| --- | --- |
| `clients` | criação, edição, soft-delete, restauro, hard-delete |
| `invoices` | idem |
| `invoice_items` | idem (linhas de fatura editadas independentemente) |
| `subscriptions` | idem |
| `subscription_items` | idem |
| `payments` | idem |
| `services` | idem |
| `auth.users` (logicamente) | criação e eliminação de membros |

## Estrutura de cada evento

Tabela `public.audit_log`:

| Coluna | Tipo | O que tem |
| --- | --- | --- |
| `id` | bigserial PK | número sequencial |
| `occurred_at` | `timestamptz` | quando aconteceu (`now()`) |
| `actor_user_id` | `uuid` | `auth.uid()` do membro |
| `actor_email` | `text` | email lido do JWT (claim `email`) |
| `action` | `text` | `INSERT` / `UPDATE` / `DELETE` / `SOFT_DELETE` / `RESTORE` |
| `table_name` | `text` | nome da tabela tocada |
| `row_id` | `text` | id (UUID em string) da linha tocada |
| `before_data` | `jsonb` | snapshot completo antes (null em INSERT) |
| `after_data` | `jsonb` | snapshot completo depois (null em DELETE) |

Quando a alteração é feita por uma função `security definer` (ex.: o
cron `generate_subscription_invoices`), o JWT está vazio — nesse caso
`actor_user_id` e `actor_email` ficam **`NULL`** na tabela. A página
`/auditoria` mostra esses eventos como `sistema` (é apenas um label
de UI, não vai ver a string `'sistema'` na BD).

## Como ler a página

A página tem três secções:

1. **Filtros**
   - **Tipo de registo** — Todos / Clientes / Faturas / Linhas de
     fatura / Subscrições / Linhas de subscrição / Pagamentos /
     Serviços / Membros.
   - **Membro (email)** — pesquisa parcial (`ilike '%texto%'`) sobre
     `actor_email`.
2. **Lista** dos últimos 100 eventos que cumprem os filtros, mais
   recentes primeiro. Cada linha mostra:
   - Badge da acção (cores diferentes para cada tipo).
   - Nome do tipo de registo + resumo (ex.: número da fatura, nome do
     cliente, descrição da linha).
   - Email do membro + timestamp legível.
   - Botão **"Ver detalhe"**.
3. **Diálogo de detalhe** (clica numa linha):
   - **Quando:** data e hora completa.
   - **Quem:** email (ou "sistema").
   - **ID do registo:** UUID da linha.
   - **Antes** e **Depois:** dois blocos JSON formatados, lado a lado.

## Casos comuns

### "Quem alterou o valor desta subscrição?"
Filtro: tipo = Subscrições, sem filtro de membro. Procura a linha
`Edição` correspondente, abre o detalhe, compara `before_data.amount`
com `after_data.amount`. (Adicionalmente, há a tabela
`subscription_price_history` para um histórico mais focado só em preço.)

### "Quem eliminou esta fatura?"
Filtro: tipo = Faturas. Procura a linha **"Movido para o Lixo"** com o
número da fatura no resumo. Mesmo que entretanto a purga automática a
tenha hard-deleted, este evento mantém-se.

### "O que é que o membro X fez ontem?"
Filtro: actor email = `x@empresa.pt`. A lista mostra todas as acções
do membro, ordenadas por data.

### "Houve algo automático esta noite?"
Para encontrar eventos automáticos, deixa o filtro de membro vazio e
procura entradas marcadas como `sistema` na lista (o label aparece
quando o `actor_email` é `NULL`). Vais ver os `INSERT` em `invoices`
e `invoice_items` do cron de subscrições + os `DELETE` em qualquer
tabela do cron de purga aos 90 dias.

Em SQL directo:
```sql
select * from public.audit_log
where actor_email is null
order by occurred_at desc;
```

## O que sobrevive aos 90 dias?

A **tabela `audit_log` não tem retenção**: os eventos ficam para sempre.

Quando o cron `purge_old_trash` apaga em hard-delete uma linha que
estava no Lixo há 90 dias, isso gera **mais um evento** no audit log
(`action = DELETE`) e o `before_data` contém o snapshot da linha que
foi apagada. Daí em diante:

- A linha desaparece da app (`/clientes`, `/faturas`, …) e do `/lixo`.
- **Mas** podes continuar a ver:
  - Que existiu (no histórico).
  - Quando foi criada e por quem (`INSERT`).
  - Como mudou ao longo do tempo (cada `UPDATE`).
  - Quando foi soft-deleted e por quem (`SOFT_DELETE`).
  - Quando foi hard-deleted (`DELETE`, normalmente pelo `sistema`).
  - O JSON completo no momento da eliminação (em `before_data`).

Isto satisfaz o requisito original: "o lixo passa a ser eliminado
automaticamente passado 90 dias para ficar mesmo tudo registado".

## Tamanho e crescimento

Cada `UPDATE` numa fatura grava o JSONB completo do antes e do depois.
Estimativa rápida: uma fatura de 5 linhas com edições normais ocupa
~3-5 KB por evento. Mil faturas com 5 edições cada = ~25 MB.

Para uma utilização normal (alguns clientes, dezenas de faturas por mês)
o crescimento é negligenciável e não há retenção configurada. Se vier a
incomodar, fica como trabalho futuro definir uma política (ex.: arquivar
linhas com mais de 5 anos para ficheiros de S3 / pasta no host).

## RLS e segurança

A tabela `audit_log` tem RLS activo:
- `INSERT` é feito pela função do trigger (que corre `security definer`).
  Ninguém escreve manualmente.
- `SELECT` está aberto a `authenticated` (qualquer membro autenticado).
  Como todos os membros têm permissões totais, todos têm direito a ver
  o audit log completo. Se vier a haver roles, pode-se restringir.

A página da app (`/auditoria`) chama `supabase.from('audit_log').select(...)`
directamente, com paginação simples (`limit(100)`). Não há cursores
nem paginação profunda — a UI assume que os filtros chegam para
encontrar o que se procura.

## Não tem

A página actual **não** suporta:
- Exportar para CSV / PDF.
- Pesquisa pelo conteúdo do JSON (ex.: "todas as edições onde o `amount`
  passou de 350 para 400").
- Reverter um evento ("desfazer esta edição").
- Ver "diff" inline com cores (compara-se manualmente os dois JSONs).

São candidatos óbvios a melhorar num PR futuro.
