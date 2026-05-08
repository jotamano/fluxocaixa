# Lixo e auto-eliminação aos 90 dias

A app usa **soft-delete** em vez de hard-delete por defeito. Quando
eliminas um cliente / fatura / subscrição / pagamento, a linha não
desaparece da base de dados — passa a estar marcada com `deleted_at`,
fica escondida da app principal e aparece em **`/lixo`**.

A partir da **PR #55**, há também uma **purga automática aos 90 dias**
que faz hard-delete a tudo o que está no Lixo há mais tempo. O
histórico de `/auditoria` sobrevive (ver [auditoria.md](./auditoria.md)).

## Soft-delete: como funciona

Migrations:
- `20260413120000_soft_delete.sql` — adiciona `deleted_at` a `clients`,
  `invoices`, `subscriptions`, `payments` e cria triggers de cascata.
- `20260415100000_cascade_soft_delete.sql` — adiciona
  `deleted_via_invoice_id` em `payments` e `deleted_via_subscription_id`
  em `invoices` para restauros precisos.

Cada uma das quatro tabelas tem:
- Coluna `deleted_at timestamptz` — `NULL` significa "ativo".
- Índice parcial `where deleted_at is null` — para que as listas
  principais ("clientes ativos", "faturas ativas") usem o índice e não
  a tabela inteira.

A app filtra `deleted_at is null` em todas as queries de `/clientes`,
`/faturas`, `/subscricoes`, `/pagamentos`, `/calendario`, etc. Os
queries de `/lixo` filtram o oposto (`deleted_at is not null`).

## Cascata ao eliminar

Quando soft-deletes um:

- **Cliente** — todas as faturas, subscrições e pagamentos do cliente
  recebem o **mesmo `deleted_at`**. (Trigger `cascade_soft_delete_client`.)
- **Fatura** — pagamentos da fatura são soft-deleted e ficam com
  `deleted_via_invoice_id = invoice.id`.
- **Subscrição** — faturas em aberto (não pagas) ligadas à subscrição
  são soft-deleted e ficam com `deleted_via_subscription_id =
  subscription.id`. Faturas pagas ficam intactas.
- **Pagamento** — só o pagamento. A fatura passa de `paid` para
  `partially_paid` ou `pending` consoante o saldo restante.

Vantagem deste design: o **restauro é cirúrgico**. Quando restauras o
cliente, só voltas a activar as filhas que foram cascatadas como parte
desse delete (mesmo timestamp ou mesmo `deleted_via_*`). As que o
utilizador já tinha apagado antes ficam no Lixo.

## A página `/lixo`

Quatro tabs:

- **Clientes** — nome + empresa/email + data de eliminação + "purga em
  N dias".
- **Faturas** — número + cliente + total **com IVA**.
- **Subscrições** — nome + cliente + valor (com IVA) + frequência.
- **Pagamentos** — valor + data + fatura associada (id curto).

Cada item tem dois botões:

- **Restaurar** (`RotateCcw`) — repõe o `deleted_at = null` da linha
  e, se for um cliente, restaura também as filhas cascatadas.
- **Eliminar definitivamente** (`Trash2`) — confirma e faz `DELETE` real
  na BD. **Irreversível**, mas o `audit_log` guarda o snapshot antes
  do `DELETE` para o caso de auditoria.

## Auto-purga aos 90 dias

Migration: `supabase/migrations/20260508110000_purge_old_trash.sql`.

Função SQL:
```sql
create or replace function public.purge_old_trash() returns integer ...
```

O que faz, dentro de uma transacção:
1. `delete from public.payments      where deleted_at < now() - interval '90 days';`
2. `delete from public.invoice_items where invoice_id in (select id from public.invoices where deleted_at < now() - interval '90 days');`
3. `delete from public.invoices      where deleted_at < now() - interval '90 days';`
4. `delete from public.subscription_items where subscription_id in (select id from public.subscriptions where deleted_at < now() - interval '90 days');`
5. `delete from public.subscriptions where deleted_at < now() - interval '90 days';`
6. `delete from public.clients       where deleted_at < now() - interval '90 days';`
7. Devolve o número total de linhas apagadas.

A ordem é importante para respeitar foreign keys (filhos antes de pais).

### Schedule via `pg_cron`

```sql
select cron.schedule(
  'purge-old-trash',
  '0 4 * * *',
  $cron$ select public.purge_old_trash(); $cron$
);
```

**Diariamente às 04:00 UTC** (cerca das 05:00 em Portugal continental
no inverno e 05:00 no verão CEST). Foi escolhido depois do cron de
geração de faturas das subscrições (03:30 UTC) para os snapshots dos
soft-deletes desse dia já estarem na auditoria antes de qualquer purga.

### Para correr manualmente

Útil em testes ou se quiseres limpar imediatamente:

```bash
docker exec -it <db_container> \
  psql -U postgres -c "select public.purge_old_trash();"
```

A função devolve o número de linhas apagadas.

### Para mudar a janela (ex.: 30 ou 365 dias)

Editar a migration e a constante na UI:
- SQL: `supabase/migrations/20260508110000_purge_old_trash.sql` —
  trocar `90 days` em todas as ocorrências.
- TS:  `src/pages/Trash.tsx` — `const TRASH_RETENTION_DAYS = 90;`.
- Documentação: este ficheiro.

Voltar a aplicar as migrations (`./scripts/apply-migrations.sh`).

## "Purga em N dias" no `/lixo`

Cada item no Lixo mostra `purga em N dias`. O cálculo está em
`daysUntilAutoPurge` (`src/pages/Trash.tsx`):

```ts
const purgeAt = deleted_at + 90 dias;
const days = Math.ceil((purgeAt - now) / 1 dia);
```

Casos:
- `days >= 2` — `purga em N dias`.
- `days === 1` — `purga em 1 dia`.
- `days <= 0` — `purga prevista no próximo ciclo` (cron ainda não
  correu hoje, mas vai correr às 04:00 UTC).

## O que sobrevive

A linha em si **desaparece** depois da purga, mas em `/auditoria`
ficas com:

- O `INSERT` original — quando foi criado, por quem.
- Cada `UPDATE` — alterações ao longo da vida.
- O `SOFT_DELETE` — quando foi para o Lixo, por quem.
- O `DELETE` final — feito pelo `sistema` (cron) com timestamp e o
  snapshot completo da linha em `before_data`.

Isto cumpre o requisito original do utilizador:

> "o lixo passa a ser eliminado automaticamente passado 90 dias para
> ficar mesmo tudo registado".

A linha desaparece da BD operacional ao fim de 90 dias, mas o
histórico fica para sempre.
