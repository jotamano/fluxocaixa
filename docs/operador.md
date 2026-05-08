# Guia do operador

Este ficheiro é para quem mantém o servidor — instalar, atualizar,
correr migrations, debugar problemas. Para o uso da app no dia-a-dia,
ver [funcionalidades.md](./funcionalidades.md).

## Arquitetura

```
                 ┌──────────────────┐
  Browser  ────► │  Vite static     │
   (8081)        │  build (nginx)   │
                 └────────┬─────────┘
                          │ supabase-js
                          ▼
   ┌──────────────────────────────────────────────────┐
   │  Supabase self-host stack (docker-compose)       │
   │                                                  │
   │  ┌──────────┐  ┌────────────┐  ┌───────────────┐ │
   │  │ kong     │  │ postgrest  │  │ gotrue (auth) │ │
   │  └──────────┘  └─────┬──────┘  └─────┬─────────┘ │
   │                      │               │           │
   │                ┌─────┴───────────────┴────────┐  │
   │                │      Postgres + pg_cron      │  │
   │                │  - tabelas: clients, ...     │  │
   │                │  - audit_log + triggers      │  │
   │                │  - generate_*  cron 03:30    │  │
   │                │  - purge_old_trash cron 04:00│  │
   │                └──────────────────────────────┘  │
   └──────────────────────────────────────────────────┘
```

- **Frontend:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui.
- **Backend:** Supabase self-host = Postgres + PostgREST + GoTrue
  (auth) + Storage + Kong (gateway).
- **Não há servidor Node próprio.** A app fala directamente com
  PostgREST e GoTrue. Tudo o que parece "lógica de servidor" está em
  funções SQL (`security definer`).
- **Edge Functions (`supabase/functions/`)** existem (ex.:
  `generate-subscription-invoices`) mas no self-host **offline** os
  jobs equivalentes correm dentro do Postgres via `pg_cron` (ver
  migrations `20260411095000_*` e `20260508110000_*`). As Edge
  Functions ficam como referência e como fallback se for preciso
  correr o job da CLI.

## Layout do repositório

```
.
├─ src/                        # frontend
│  ├─ pages/                   # uma por rota (Dashboard, Invoices, ...)
│  ├─ components/              # UI partilhada (shadcn/ui + custom)
│  ├─ hooks/use-data.ts        # TODOS os queries Supabase + mutations
│  ├─ lib/data.ts              # helpers (IVA, formatação, frequências)
│  ├─ lib/pdf.ts               # geração PDF de faturas
│  ├─ lib/statement.ts         # geração PDF de conta-corrente
│  └─ integrations/supabase/   # client autogerado + types
├─ supabase/
│  ├─ migrations/              # SQL idempotente, ordenado por data
│  └─ functions/               # Edge Functions (Deno)
├─ docker-compose.yml          # stack completa para self-host
├─ scripts/
│  └─ apply-migrations.sh      # runner idempotente
├─ docs/                       # esta pasta
└─ README.md                   # setup inicial e overview
```

## docker-compose

`docker-compose.yml` traz **toda** a stack: db (Postgres com
`pg_cron`), kong, postgrest, gotrue (auth), studio, vite-build.
Tipicamente acedes:

- `http://<host>:8081` — a app.
- `http://<host>:8000` — Kong / PostgREST / GoTrue.
- `http://<host>:54323` — Supabase Studio.

Cada serviço tem o seu container; a base de dados está num volume
nomeado para sobreviver a `docker compose down`.

### Comandos úteis

| Acção | Comando |
| --- | --- |
| Subir tudo | `docker compose up -d` |
| Ver logs do Postgres | `docker compose logs -f db` |
| Reiniciar a app | `docker compose restart vite-build` |
| Entrar no Postgres | `docker exec -it <db_container> psql -U postgres` |

## Aplicar migrations

`scripts/apply-migrations.sh` corre as migrations em
`supabase/migrations/` por ordem alfabética. É **idempotente**:
- Mantém uma tabela `public.schema_migrations` (versão = nome do
  ficheiro).
- Cada ficheiro com versão já registada é saltado.
- O script tem **backfill** para a primeira execução em bases que já
  estavam em produção antes de ele existir.

```bash
# No host onde corre o docker-compose
./scripts/apply-migrations.sh

# Com nome de container específico (ex.: Coolify)
DB_CONTAINER=db-v5xudtj41ezyw-... ./scripts/apply-migrations.sh
```

Para ver o que está aplicado:
```sql
select version, applied_at
from public.schema_migrations
order by version;
```

### Migrations recentes

| Versão | O que faz |
| --- | --- |
| `20260411094000_subscription_price_history.sql` | log de mudanças de preço por subscrição |
| `20260411095000_generate_subscription_invoices_sql.sql` | função SQL + cron 03:30 para emitir faturas das subscrições |
| `20260413120000_soft_delete.sql` | adiciona `deleted_at` + cascata em clientes |
| `20260415100000_cascade_soft_delete.sql` | colunas `deleted_via_*` para restauros precisos |
| `20260417100000_invoice_item_service_id.sql` | linhas de fatura podem ligar a `services` |
| `20260420100000_add_iva_fields.sql` | `has_iva` + `iva_percentage` em clientes/faturas/subscrições |
| `20260508100000_audit_log.sql` | tabela `audit_log` + triggers em todas as tabelas user-owned |
| `20260508110000_purge_old_trash.sql` | função `purge_old_trash` + cron 04:00 |
| `20260508120000_members_management.sql` | RPCs `invite_member` / `delete_member` / `list_members` |

## pg_cron jobs

Para listar os jobs activos:

```sql
select jobid, schedule, command, jobname, active
from cron.job
order by jobname;
```

Jobs configurados:

| jobname | schedule | função |
| --- | --- | --- |
| `reactivate-subscriptions` | `15 3 * * *` | `public.reactivate_paused_subscriptions()` |
| `generate-subscription-invoices` | `30 3 * * *` | `public.generate_subscription_invoices()` |
| `purge-old-trash` | `0 4 * * *` | `public.purge_old_trash()` |

Tudo em UTC. Para correr manualmente:

```sql
select public.generate_subscription_invoices();   -- emite as faturas pendentes
select public.purge_old_trash();                  -- limpa o lixo > 90 dias
```

## Edge Functions

`supabase/functions/generate-subscription-invoices/` é a versão Deno
original. Ficou como referência — no self-host offline, o código que
corre realmente é a função SQL equivalente.

Para invocar a edge function (se tiveres a CLI Supabase):
```bash
supabase functions invoke generate-subscription-invoices
```

## Builds e deploys

### Build local

```bash
npm install
npm run dev      # http://localhost:8080
```

### Build produção

```bash
npm run build    # vite build → dist/
npm run preview  # serve dist/ em localhost:8080
```

O Dockerfile do `vite-build` usa multi-stage para servir o `dist/` num
nginx.

### Coolify

Cada commit em `main` aciona o webhook do Coolify que:
1. Faz `git pull`.
2. Rebuild dos containers que mudaram.
3. Reinicia.

**Nota importante:** mudanças em `supabase/migrations/` **não** são
aplicadas pelo deploy. Tens de correr `./scripts/apply-migrations.sh`
no host depois do deploy. Sem isso, vês erros como "column does not
exist" porque o frontend novo está a falar com um schema antigo.

## Trabalhar offline

Se tens o stack a correr e Internet caiu:
- A app continua a funcionar (frontend + DB são locais).
- Não há dependências externas em runtime — sem Stripe, sem AWS, sem
  emails. Tudo são chamadas locais.
- A geração de PDF é client-side (`jsPDF`) — não precisa de servidor.
- Se quiseres rebuilds offline: precisas das imagens `node`, `nginx`,
  `postgres` e dos containers Supabase em cache local.

## Troubleshooting

### "Tela branca" depois de deploy
Quase sempre é uma coluna nova que o frontend usa mas a BD ainda não
tem. Correr `./scripts/apply-migrations.sh`. Confirma com:
```sql
select * from public.schema_migrations order by version;
```
Se a tela branca é depois de "Nova fatura" ou "Nova subscrição",
verifica também `has_iva` e `iva_percentage` (PR #52). Se for `Members`
ou `Audit`, são as migrations da PR #55.

### "Permission denied" em SELECT/INSERT
Provavelmente RLS. Verifica `pg_policies`:
```sql
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename;
```
Todas as tabelas user-owned têm policies para `authenticated` (todos
os membros). A `audit_log` só permite `INSERT` via trigger.

### Cron não está a correr
1. Verifica que a extensão está instalada:
   `select * from pg_extension where extname = 'pg_cron';`
2. Verifica jobs:
   `select * from cron.job;`
3. Verifica o histórico de execução:
   ```sql
   select * from cron.job_run_details
   order by start_time desc limit 20;
   ```
4. Em `docker-compose.yml`, o serviço `db` tem de ter `pg_cron` no
   `shared_preload_libraries`. Se mudaste recentemente, precisa de
   `docker compose restart db`.

### Auditoria com `actor_email = sistema`
É normal: significa que a alteração veio de um cron ou trigger
`security definer`. Não é um bug.

### Faturas não estão a ser geradas pela subscrição
1. A subscrição está `active`?
2. `next_billing_date <= today`?
3. `deleted_at is null`?
4. Corre manualmente: `select public.generate_subscription_invoices();`
5. Vê em `cron.job_run_details` se há erros.

### "Não consigo eliminar o último membro"
É proteção: a UI desactiva o botão na tua linha. Se mesmo assim
quiseres recuperar acesso após teres ficado sem membros, vai ao
Postgres directamente:
```sql
insert into auth.users (id, email, encrypted_password, ...)
values (gen_random_uuid(), 'tu@empresa.pt',
        crypt('temp123', gen_salt('bf')), ...);
```
(Ver `20260508120000_members_management.sql` para os campos
obrigatórios.)

## Ficheiros importantes para teres por perto

- `supabase/migrations/` — toda a história do schema.
- `src/hooks/use-data.ts` — todos os queries do frontend num só
  ficheiro.
- `src/lib/data.ts` — helpers de IVA, frequências, formatação.
- `docker-compose.yml` — stack do self-host.
- `scripts/apply-migrations.sh` — runner de migrations.
- `README.md` na raíz — setup inicial detalhado.
