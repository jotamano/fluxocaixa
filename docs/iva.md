# IVA — como é tratado

A app trata o IVA como uma propriedade **por entidade** (cliente, fatura,
subscrição). A regra geral é simples:

> **O valor "principal" mostrado em qualquer página é sempre o total
> com IVA — i.e. o valor que o cliente vai pagar.** Quando há IVA,
> mostra-se também o subtotal abaixo.

## Modelo de dados

Cada uma das três tabelas user-facing tem **dois campos**:

| Coluna | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `has_iva` | `boolean` | `true` | Se aplica IVA a este registo |
| `iva_percentage` | `numeric` | `23` | Percentagem (0 a 100) |

Aplicado em:
- `clients` — define o default para faturas e subscrições deste cliente.
- `invoices` — congelado na fatura (snapshot no momento da emissão).
- `subscriptions` — usado para calcular o valor com IVA mostrado e para
  carimbar nas faturas geradas pelo cron.

Migration: `supabase/migrations/20260420100000_add_iva_fields.sql`.

## Helpers

`src/lib/data.ts`:

- `getEffectiveIvaPercentage(source)` — devolve `0` se `has_iva = false`,
  caso contrário `iva_percentage` (defensivo: trata nulls como 0).
- `getInvoiceItemsTotal(items)` — soma das linhas (subtotal sem IVA).
- `getInvoiceIvaAmount(items, source)` — IVA aplicado ao subtotal.
- `getInvoiceTotalWithIva(items, source)` — **subtotal + IVA**, é o que
  se mostra como total. Usado em todas as listas de faturas.
- `getAmountWithIva(amount, source)` — para subscrições e qualquer outro
  caso que tenha um valor escalar (não uma lista de linhas).

Toda a aritmética é arredondada a 2 casas decimais (away-from-zero) para
ser consistente com o que o `formatCurrency` mostra em pt-PT.

## Defaults e propagação

1. **Criar cliente:** toggle ligado, 23% por defeito.
2. **Criar fatura/subscrição:** copia `has_iva` e `iva_percentage` do
   cliente selecionado. O utilizador pode alterar para esta fatura/
   subscrição em particular sem afetar o cliente.
3. **Editar cliente:** **não** propaga para faturas/subscrições já
   existentes (estas são snapshots do momento da emissão / criação).
   Só apanha as próximas.
4. **Cron diário (`generate_subscription_invoices`):** usa o
   `iva_percentage` da subscrição na altura da emissão. Se a subscrição
   tinha 23% e mudaste para 6%, a próxima fatura sai a 6% (e as faturas
   antigas ficam intactas).

## Onde aparece "+ IVA" vs total final

Quase em todo o lado mostramos só o total com IVA. Os sítios que ainda
mostram o breakdown em texto pequeno (`X € + IVA Y%`):

- Cartão de subscrição em `/subscricoes`.
- Cartão de subscrição no detalhe do cliente.
- Detalhe de subscrição (`/subscricoes/:id`).
- Detalhe de fatura (`/faturas/:id`) — sempre mostra "Subtotal + IVA =
  Total" porque é o documento fiscal.
- PDF da fatura (`src/lib/pdf.ts`) — sempre tem subtotal, IVA e total
  separados.
- Extracto/conta-corrente (`src/lib/statement.ts`) — usa total com IVA
  porque é o que o cliente vê na conta-corrente.

## "Sem IVA"

Quando `has_iva = false`:
- O `getEffectiveIvaPercentage` devolve `0`.
- `getAmountWithIva` e `getInvoiceTotalWithIva` devolvem o subtotal
  inalterado.
- Em listas mostra-se uma badge `Sem IVA` ao lado do nome do cliente.
- No PDF não aparece linha de IVA.

Útil para clientes em **isenção** (regimes pequenos, países sem IVA,
ONGs com isenção específica, etc.).

## Edge cases

- **IVA = 0% mas `has_iva = true`:** o sistema trata como `Sem IVA`
  efetivo (porque a função `getEffectiveIvaPercentage` exige `> 0`).
  No PDF a linha de IVA mostra-se com 0,00 € — útil para evidenciar a
  isenção sem desligar o toggle.
- **Mudança retroactiva:** alterar o IVA de uma fatura **paga** está
  bloqueado pelo "fiscal lock" (a fatura passou a documento fiscal
  quando recebeu o primeiro pagamento). Se for mesmo necessário, abre
  uma nota de crédito (não automatizado — fazes manualmente uma nova
  fatura com sinal negativo).
- **Cliente sem IVA, fatura com IVA:** permitido. Útil para emitir
  pontualmente uma fatura com IVA a um cliente normalmente isento.

## Histórico (porque é assim)

Antes da PR #54 a app misturava sítios que mostravam o subtotal com
sítios que mostravam o total com IVA — o utilizador tinha de adivinhar
em cada listagem qual estava a ler. A PR #54 normalizou tudo para
"total com IVA" como referência única; o subtotal só aparece como
breakdown explicativo. A PR #55 adicionou o snapshot de IVA nas faturas
geradas automaticamente pelo cron e nas geradas em conjunto com a
criação de uma subscrição (antes apanhavam o default de 23% mesmo
quando a subscrição estava configurada para 0% / 6%).
