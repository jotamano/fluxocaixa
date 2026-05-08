# Membros / funcionários

A página `/membros` permite convidar pessoas para usarem o programa
contigo. Cada membro tem login próprio (email + password), passa
faturas em nome próprio e fica registado em `/auditoria`.

Esta funcionalidade foi adicionada na **PR #55** com a migration
`supabase/migrations/20260508120000_members_management.sql`.

## Modelo de permissões

> **Todos os membros são iguais — todos têm permissões totais.**

Qualquer membro pode:
- Criar / editar / eliminar clientes, faturas, subscrições, pagamentos,
  serviços.
- Restaurar e eliminar definitivamente do Lixo.
- Ver toda a auditoria.
- Convidar novos membros e remover outros membros (excepto a si
  próprio).

Não há roles separados (ex.: `admin` vs `viewer`). Se vier a ser
necessário, fica como trabalho futuro.

A única protecção é "não te eliminas a ti próprio" (defesa contra
ficares fora do programa por engano). Implementação:
`Members.tsx` desactiva o botão `Remover` quando `user.id === m.id`.

## Convidar um membro

1. Vai a **Membros** na sidebar.
2. Clica **"Convidar membro"**.
3. Mete o **email** do colega.
4. A app gera uma **password temporária** de 12 caracteres
   (`crypto.getRandomValues`, mistura letras + dígitos + símbolos).
   Podes editar ou regenerar.
5. Clica **"Criar conta"**.
6. Aparece um diálogo com **email + password**. Copia (botão "Copiar")
   e envia ao colega por canal seguro. **Esta é a única vez que vais
   ver a password.**
7. O colega vai a `https://<host>:8081/login`, autentica-se e pode
   mudar a password depois (Supabase Studio ou via app — se
   adicionarmos esse fluxo).

A criação chama `public.invite_member(p_email, p_password)`, uma RPC
`security definer` que insere directamente em `auth.users` e
`auth.identities` (Supabase GoTrue). O hash da password usa o algoritmo
nativo do GoTrue (`bcrypt`), pelo que serve para login imediato.

A criação **fica registada em `/auditoria`** como `INSERT` na "tabela"
`auth.users`, com o email do convidador como actor.

## Remover um membro

1. Vai a **Membros**.
2. Clica **"Remover"** na linha do colega.
3. Confirma.

Implementação: chama `public.delete_member(p_user_id)`, que apaga as
linhas em `auth.identities` e `auth.users`. As linhas que esse membro
criou (clientes, faturas, …) **ficam intactas**: não há foreign key
obrigatória entre `auth.users` e as tabelas user-facing. O autor fica
indirectamente a partir do log de auditoria.

A remoção também fica em `/auditoria` (`DELETE` em `auth.users`).

## Restrições e validações

- **Email único:** se tentares convidar um email já existente, a RPC
  devolve erro `User already registered` e a UI mostra-o no toast.
- **Password ≥ 6 caracteres:** mínimo do GoTrue. A app gera 12 por
  defeito mas se editares para algo mais curto o submit é bloqueado.
- **Não te podes eliminar:** botão `Remover` desactivado na tua linha.
- **Não podes deixar a app sem membros:** indirectamente garantido pelo
  ponto anterior — pelo menos tu ficas sempre.

## E se perder a password de um membro?

Não há "esqueci-me da password" automatizado nesta versão da app
(self-host). Opções:

1. **Re-emitir password** — a versão actual da app ainda não tem botão
   para isto; pode ser adicionado num PR futuro chamando
   `auth.users.encrypted_password = ...` via outra RPC.
2. **Apagar e voltar a convidar** — solução actual: removes o membro
   em `/membros` e crias outro convite. Perde-se o histórico de "última
   sessão" mas o trabalho que ele fez fica intacto e ligado ao novo
   convite por email (se for o mesmo).
3. **Mudar à mão no Postgres** — para emergências. Connecta-te ao
   container `db` (`docker exec -it <db_container> psql -U postgres`)
   e:
   ```sql
   update auth.users
   set encrypted_password = crypt('nova-password', gen_salt('bf'))
   where email = 'colega@empresa.pt';
   ```
   (Requer a extensão `pgcrypto`, já incluída no Supabase self-host.)

## Auditoria

Cada acção em `/membros` fica em `/auditoria`:
- **Criação** — `INSERT auth.users` com `before = null`, `after = { id,
  email, created_at }`.
- **Eliminação** — `DELETE auth.users` com `before = { id, email,
  created_at }`, `after = null`.

Não logamos a password (em lado nenhum) nem o hash. O `actor_email` é
o email do membro que iniciou a acção, lido do JWT da sessão.

Ver [auditoria.md](./auditoria.md) para mais detalhes.
