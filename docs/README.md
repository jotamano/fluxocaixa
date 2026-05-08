# Documentação

Esta pasta contém a documentação da app de faturação. Está dividida por
público-alvo:

## Para quem usa a app no dia-a-dia

- [Funcionalidades por página](./funcionalidades.md) — passeio guiado:
  Dashboard, Clientes, Faturas, Subscrições, Pagamentos, Calendário,
  Serviços, Membros, Auditoria, Lixo. Inclui o que cada página faz, os
  estados e os atalhos.
- [IVA — como é tratado](./iva.md) — regras de cálculo, valor com IVA
  vs subtotal, comportamento por cliente, comportamento ao editar.
- [Membros / funcionários](./membros.md) — convidar, revogar, password
  inicial, modelo de permissões.
- [Auditoria](./auditoria.md) — o que fica registado, como ler o
  detalhe, filtros, retenção.
- [Lixo e auto-eliminação aos 90 dias](./lixo-90-dias.md) — como
  funciona o soft-delete, restaurar, purga automática, o que fica no
  histórico depois.

## Para quem mantém / opera o servidor

- [Guia do operador](./operador.md) — arquitetura, docker-compose,
  Coolify, aplicar migrations, pg_cron jobs, edge functions, troubleshooting.

## Notas rápidas

- A app é em **português** e fala apenas com a base de dados local
  (Supabase self-host: PostgREST + GoTrue + Postgres). Funciona offline
  depois das imagens estarem puxadas.
- Numeração fiscal: **`FT YYYY/NNN`** (ano/número sequencial), atribuída
  na primeira gravação de cada fatura.
- Recorrência das subscrições: **diário às 03:30 UTC** o `pg_cron`
  chama `generate_subscription_invoices()` e cria as faturas em aberto.
- Limpeza do lixo: **diário às 04:00 UTC** o `pg_cron` chama
  `purge_old_trash()` e apaga em hard-delete tudo o que está no Lixo
  há mais de 90 dias. O histórico fica em `/auditoria` para sempre.
- Para ver migrations aplicadas vs pendentes:
  `select * from public.schema_migrations order by version;`.
