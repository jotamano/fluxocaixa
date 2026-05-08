# Funcionalidades por página

Esta página descreve o que cada zona da app faz, com referências a
ficheiros do código e às migrations relevantes para quem queira ir mais
fundo.

A barra lateral (sidebar) tem todas as zonas pela ordem em que aparecem:
**Dashboard · Clientes · Faturas · Pagamentos · Subscrições · Calendário
· Serviços · Membros · Auditoria · Lixo**, mais o atalho **Nova Fatura**
ao fundo.

---

## 1. Dashboard (`/`)

Visão geral do negócio. Lê os mesmos dados que o resto da app — não há
agregados pré-calculados, tudo é derivado em tempo real a partir das
queries (TanStack Query / `src/hooks/use-data.ts`).

**Filtros temporais (canto superior direito):** Este mês · Trimestre ·
Este ano · Tudo. Tudo o que aparece em baixo respeita o filtro escolhido
(receita, faturas recentes, top clientes, gráfico mensal).

**Cartões de topo:**
- **Receita Total** — soma dos pagamentos recebidos no período.
- **Em Dívida** — total das faturas pendentes/vencidas/parciais menos o
  que já foi pago. O valor já inclui IVA (ver [iva.md](./iva.md)).
- **Clientes Ativos** — número de clientes não eliminados.
- **Receita Recorrente (MRR)** — soma das subscrições ativas
  normalizadas para 30 dias (uma anual de 1200€ entra como ~100€/mês).

**Banner de aviso amarelo:** aparece se houver faturas pendentes ou
vencidas. Clica numa para ir direto à fatura.

**Gráficos:** receita mensal (recharts) + top 5 clientes por receita
recebida no período. Se o período não tem dados, ambos mostram empty
state em vez de eixos vazios.

**Listas em baixo:** as 5 faturas mais recentes do período (links para
detalhe) e todas as subscrições ativas com o próximo dia de faturação.

---

## 2. Clientes (`/clientes`)

Grelha de cartões com pesquisa por nome ou empresa.

**Cada cartão mostra:** iniciais + nome + empresa + email + telefone +
**badge de IVA** (`IVA 23%` ou `Sem IVA`) + 3 contadores: total faturado,
nº de faturas, nº de subscrições ativas. O total faturado inclui IVA
quando aplicável.

**Botão "Novo Cliente":** abre um diálogo com:
- Nome, Email, Empresa, Telefone, NIF (opcionais excepto nome)
- Toggle **"Tem IVA"** (default: ligado, 23%)
- Percentagem de IVA — só aparece se o toggle estiver ligado

O cliente fica imediatamente disponível em qualquer outra página
(faturas, subscrições, etc.).

### Detalhe do cliente (`/clientes/:id`)

Clicar num cartão abre uma página com:

- **Header:** empresa em destaque + contactos + badge IVA. Botões:
  - **Nova fatura** — atalho para `/faturas/nova?clientId=…` (cliente já
    pré-selecionado, IVA copiado).
  - **Editar** — diálogo com os mesmos campos da criação.
  - **Extrato** — gera **PDF de conta-corrente** (ver
    `src/lib/statement.ts`) com saldo, faturas, pagamentos.
  - **Eliminar** — confirma e move para o Lixo. Cascata: todas as
    faturas/subscrições/pagamentos do cliente também vão para o Lixo
    com o mesmo timestamp (ver [lixo-90-dias.md](./lixo-90-dias.md)).
- **Cartões de KPI:** total faturado, total pago, em dívida, subscrições
  ativas. Todos os valores já incluem IVA quando aplicável.
- **Faturas do cliente:** lista cronológica com estado e total.
- **Histórico de Atividades:** timeline com criação do cliente, faturas
  emitidas e pagamentos recebidos.
- **Pagamentos:** lista com método e data.
- **Subscrições:** lista com nome, frequência e valor (já com IVA).

> **NIF** é opcional mas obrigatório para emissão fiscal a empresas.
> Não há validação automática contra a AT.

---

## 3. Faturas (`/faturas`)

Tabela com pesquisa, filtro por estado (Todas · Pagas · Pendentes ·
Vencidas · Parciais · Rascunhos) e filtros de data (de / até). Cada
linha tem o número da fatura, cliente, data de emissão, vencimento,
estado e total **com IVA**, mais um botão para **exportar PDF**
diretamente da lista.

### Estados das faturas

| Estado | Significado |
| --- | --- |
| `draft` | Rascunho, ainda não emitida |
| `pending` | Emitida, dentro do prazo de pagamento |
| `partially_paid` | Tem pelo menos um pagamento mas falta saldar |
| `paid` | Saldada por pagamentos |
| `overdue` | Não saldada e `due_date < hoje` |

A transição `pending → overdue` é calculada na UI a partir das datas
(não há um cron a fazer update — é apenas a lógica do `StatusBadge`).

### Nova fatura (`/faturas/nova`)

Diálogo grande com:

1. **Cliente** — picker. Se vier `clientId` no querystring (ex.: vindo
   do detalhe do cliente), já vem selecionado. Pode-se criar um cliente
   "rápido" sem sair (`QuickCreateClientDialog`).
2. **Número** — pré-preenchido com o próximo `FT YYYY/NNN` (calculado
   pela função SQL `next_invoice_number`). Pode ser editado.
3. **Datas:** emissão (default = hoje) e vencimento (default = hoje + 30
   dias).
4. **Estado inicial** — normalmente `draft` ou `pending`.
5. **Notas** — campo livre que aparece no PDF.
6. **IVA:** toggle + percentagem, pré-preenchidos com os valores do
   cliente. Pode-se desligar/alterar caso a caso. Ver [iva.md](./iva.md).
7. **Linhas (`invoice_items`):** descrição, quantidade, preço unitário,
   serviço opcional, datas opcionais (período prestado),
   **drag-and-drop** para reordenar. Botão "Adicionar linha".

> **Linhas com período** (ex.: "30/04/2026 – 30/04/2027") permitem que a
> app **infira a frequência** correspondente quando depois transformas
> a linha numa subscrição (`inferFrequencyFromRange`).

### Detalhe da fatura (`/faturas/:id`)

- Header com número, cliente, estado, total **com IVA** + breakdown
  (subtotal + IVA% = total) quando há IVA.
- Acções: editar, exportar PDF, registar pagamento, **duplicar** (cria
  cópia em rascunho), **promover linha em subscrição** (a partir de uma
  linha avulsa, cria-se uma subscrição recorrente), eliminar (vai para
  o Lixo, e os pagamentos da fatura vão atrás — ver
  `deleted_via_invoice_id` em
  `supabase/migrations/20260415100000_cascade_soft_delete.sql`).
- Ligação a subscrições: se a fatura foi gerada por uma subscrição (ou
  o utilizador a ligou manualmente), mostra "Subscrições associadas".
- **Bloqueio fiscal:** quando uma fatura tem pagamentos, não se pode
  reduzir o total nem mudar campos críticos (defesa contra alterações
  retroactivas em documentos fiscais — ver triggers em
  `20260411090000_auth_and_rls.sql` / lógica em `useUpdateInvoice`).

---

## 4. Pagamentos (`/pagamentos`)

Tem três zonas:

1. **Cartões de topo:** Dívida Total · Total Recebido · Clientes em Dia
   · Faturas Pendentes.
2. **Tabela de Dívidas por Cliente:** cada linha mostra o cliente,
   total faturado (com IVA), total pago, **dívida atual** e estado
   (`Em dia / Pendente / Em atraso`). Clica numa linha para ir ao
   detalhe do cliente.
3. **Pagamentos Recentes:** lista cronológica de todos os pagamentos
   já registados.

### Registar pagamento

Botão **"Registar Pagamento"** abre `PaymentDialog`:
- Cliente (filtra as faturas)
- Fatura (lista as não saldadas)
- Valor (default = saldo da fatura)
- Data (default = hoje)
- **Método:** Transferência · MB WAY · Numerário · Cartão
- Notas opcionais

Ao guardar, a fatura passa a `partially_paid` ou `paid` consoante o
saldo restante.

### Repartir pagamento

Botão **"Repartir"** abre `SplitPaymentDialog`. Útil quando o cliente
paga vários valores de uma vez (transferência única para 3 faturas,
por exemplo). Recebes:
- Cliente (filtra faturas)
- Valor total recebido
- Método e data

A app aloca o valor pelas faturas pendentes/vencidas do cliente, da
mais antiga para a mais recente, criando um pagamento por fatura. Se
sobrar valor, podes deixar pendente como crédito a próxima fatura.

### Detalhe de pagamento (`/pagamentos/:id`)

Mostra cliente, fatura associada, método, valor, notas. Permite editar
ou eliminar (vai para o Lixo; restaurar repõe o pagamento).

---

## 5. Subscrições (`/subscricoes`)

Cada subscrição é um contrato recorrente (ex.: "Gestão SEO mensal de
350€"). A app emite faturas automaticamente todos os dias às 03:30 UTC
(ver [operador.md](./operador.md) para alterar o horário).

**Lista:** pesquisa + filtro por estado (Todas · Ativas · Pausadas ·
Canceladas). Cada cartão mostra:
- Nome + cliente
- Estado (Ativa / Pausada / Cancelada)
- **Valor:** com IVA na linha principal, breakdown abaixo (`X € + IVA Y%`)
- Próx. faturação (ou "Pausada até DD/MM/YYYY")
- Faturado em YYYY (ano corrente)
- Última fatura
- Botões: Editar · Pausar/Reactivar · Eliminar

**Métricas no topo:** MRR total (soma das subscrições ativas
normalizadas para 30 dias), nº de subscrições por estado.

### Frequências suportadas

`weekly` (7d) · `biweekly` (14d) · `monthly` (30d) · `bimonthly` (60d)
· `quarterly` (90d) · `semiannual` (180d) · `yearly` (365d) · `biannual`
(730d).

Os números entre parênteses são a média aproximada usada para inferir
frequência a partir de um período (`inferFrequencyFromRange` em
`src/lib/data.ts`).

### Nova subscrição

Diálogo com:
- Cliente (com **pre-fill do IVA do cliente**; pode-se alterar)
- Nome do serviço (livre, ou via `QuickCreateServiceDialog`)
- Frequência
- **Valor recorrente** (sem IVA) e percentagem de IVA
- Data da primeira faturação (`next_billing_date`)
- **Setup fee** opcional — cobrado **só na primeira fatura**
- Toggle **"Gerar fatura agora"** — quando ligado, cria também a
  primeira fatura imediatamente (pré-seleciona estado `pending`)

> **Pro-rata:** se a subscrição arranca a meio do período (e
> `prorate_first_invoice` está ligado), o primeiro item recorrente é
> escalado por `dias_restantes / dias_no_período`. Configurável em
> `subscription_items`.

> **Add-ons:** linhas adicionais de tipo `addon` que viajam com a
> faturação recorrente. Só são criadas em SQL ou via "promover linha
> em subscrição" a partir do detalhe da fatura.

### Editar subscrição (sincronização)

Quando se altera o valor, a app **sincroniza** com as faturas em aberto
(`pending`, `overdue`, `partially_paid`) que estão ligadas à subscrição
— ou seja, atualiza os `invoice_items` para refletir o novo valor.

**Faturas pagas (`paid`) não são alteradas** — são documentos fiscais
e ficam intocadas. Próximas faturas geradas pelo cron usam sempre o
último valor da subscrição.

A toast notification reporta exatamente quantas faturas foram
sincronizadas (0, 1 ou N).

### Pausar / Reactivar

Pausar abre `PauseSubscriptionDialog`:
- Data até quando pausa (`paused_until`, opcional)
- O que fazer com faturas pendentes da subscrição: deixar / cancelar /
  marcar como pagas

Há um cron diário às **03:15 UTC** que reactiva subscrições cuja
`paused_until` chegou.

### Detalhe da subscrição (`/subscricoes/:id`)

Mostra:
- Toda a info do cartão + histórico de **faturas geradas pela
  subscrição** + total faturado no ano + última fatura.
- **Histórico de preço:** sempre que o valor muda, é registado em
  `subscription_price_history` (trigger em
  `20260411094000_subscription_price_history.sql`). A página mostra a
  linha temporal: data, preço antigo, preço novo, quem mudou.

---

## 6. Calendário (`/calendario`)

Vista mensal e em lista de:
- **Faturas pendentes** (amarelo) e **vencidas** (vermelho) com
  vencimento dentro do mês.
- **Subscrições** (azul) que vão emitir fatura nesse mês — a app
  expande recorrências semanais/quinzenais para cada dia do mês.

**Filtros (chips):** podes esconder cada categoria. Os totais no topo
do mês ("Faturação prevista este mês") respeitam os filtros.

**Vista Mês:** grelha 7×6 com pílulas por dia (até 3 visíveis, restantes
em "+N mais"). Em mobile vê-se pontos coloridos. Cada pílula é
clickable e leva para a fatura/subscrição.

**Vista Lista:** mesma informação organizada por dia do mês, mais
prática para impressão.

Atalho **"Hoje"** volta ao mês atual e seleciona o dia de hoje.

---

## 7. Serviços (`/servicos`)

Catálogo de serviços oferecidos. Cada serviço tem nome e **preço base**;
podem ser ativados / desativados. Servem para:
- Pré-preencher linhas de fatura.
- Pré-preencher o nome e valor de novas subscrições.

Linhas de fatura podem ter `service_id` opcional (`invoice_items.service_id`,
adicionado por `20260417100000_invoice_item_service_id.sql`) para
agregar relatórios de receita por serviço — útil para perceber se a
"gestão de redes" rende mais que o "design web".

Eliminar um serviço só o esconde da lista de criação; faturas antigas
mantêm a referência.

---

## 8. Membros (`/membros`)

Página para convidar funcionários/colaboradores. Detalhe completo em
[membros.md](./membros.md). Resumo:

- Lista todos os membros com email, criado em, última sessão.
- Botão **"Convidar membro"** cria a conta diretamente em `auth.users`
  + `auth.identities`. A password é gerada do lado do cliente
  (cripto seguro, 12 caracteres) e mostrada **uma única vez**.
- Botão **"Remover"** apaga a conta. Faturas e pagamentos criados pelo
  membro permanecem (têm `actor_user_id` no audit log, não FK
  obrigatória noutras tabelas). Não te podes eliminar a ti próprio.
- **Permissões:** todos os membros são iguais — qualquer um pode
  criar/editar/eliminar tudo, e qualquer um pode convidar/remover
  outros membros. Se quiseres roles separados (admin / só leitura),
  vamos precisar de implementar (ainda não está feito).

---

## 9. Auditoria (`/auditoria`)

Página para ver "quem fez o quê e quando". Detalhe completo em
[auditoria.md](./auditoria.md). Resumo:

- Mostra os últimos 100 eventos por defeito.
- **Filtros:** tipo de registo (todos / clientes / faturas / linhas /
  subscrições / pagamentos / serviços / membros) e email do membro
  (pesquisa parcial).
- Cada linha mostra: badge da acção (Criação / Edição / Eliminação
  definitiva / Movido para o Lixo / Restauro), tipo de registo, resumo
  (ex.: número da fatura, nome do cliente), email do membro,
  timestamp.
- Clica para ver **detalhe**: ID do registo + JSON antes / JSON depois.
- Os eventos ficam para sempre, mesmo depois das linhas serem
  apagadas pela purga automática aos 90 dias.

---

## 10. Lixo (`/lixo`)

Caixote do lixo. Detalhe completo em [lixo-90-dias.md](./lixo-90-dias.md).
Resumo:

- Tabs por tipo: Clientes · Faturas · Subscrições · Pagamentos.
- Cada item mostra título, subtítulo (cliente/valor/data), data de
  eliminação e **"purga em N dias"** (90 - dias_eliminado).
- **Restaurar** — mete a linha de volta na app. Em cliente, restaura
  também o que foi apagado em cascata.
- **Eliminar definitivamente** — hard-delete imediato. Irreversível,
  mas o evento fica em `/auditoria`.
- Se não fizeres nada, ao fim de 90 dias o `pg_cron` apaga
  automaticamente. O histórico fica em `/auditoria` para sempre.

---

## Componentes globais

### Sidebar (`AppSidebar`)
- Colapsa em desktop (clica na seta), abre como `Sheet` em mobile.
- Botão **"Nova Fatura"** sempre acessível ao fundo.
- Mostra email do utilizador autenticado e o **build ID** (primeiros 7
  caracteres do `SOURCE_COMMIT`) para confirmares que estás a ver o
  bundle mais recente.
- Botão **Sair** que termina a sessão Supabase.

### Pesquisa global
Existe `GlobalSearch` (componente em `src/components/GlobalSearch.tsx`)
que pesquisa em clientes, faturas, subscrições, pagamentos e serviços
ao mesmo tempo. Útil para saltar rapidamente para uma fatura quando se
sabe só o número.

### Login (`/login`)
Email + password contra `auth.users` (Supabase GoTrue self-host). A
guarda `AuthGuard` redireciona para `/login` qualquer rota não
autenticada.
