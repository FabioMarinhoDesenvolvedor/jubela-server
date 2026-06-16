# Refatoração Backend (jubela-server) — Guia de Sessão

> **Objetivo:** transformar o backend em código com cara de sênior, sem resíduos de IA,
> seguindo **KISS**. Remover código morto/duplicado, garantir funcionalidade, padronizar estilo.

---

## ⚙️ COMO USAR ESTE ARQUIVO (ler no início de TODA sessão)

1. Leia este arquivo inteiro antes de tocar em qualquer código.
2. Abra a seção **PLANO POR FASES**, pegue a **próxima tarefa pendente** (`[ ]`) da fase ativa.
3. Faça **uma fase (ou bloco) por vez**. Não pule fases. Não misture limpeza com fix de bug na mesma alteração.
4. Ao terminar um bloco: marque `[x]`, rode `npm run build` + `npm run lint`, e **atualize este .md**:
   - mude o status da tarefa,
   - anote o que foi feito no **LOG DE SESSÕES** (data + arquivos tocados + decisões),
   - se descobrir algo novo, adicione em **ACHADOS** ou em **DECISÕES**.
5. Só então proponha/aplique a alteração. Prod está ativo → mudanças de schema só via migration.
6. Seja conciso. Não recodar o que já está decidido aqui.

**Regra de ouro:** cada sessão e cada código → atualize este .md antes de encerrar.

---

## 🎯 DECISÕES (fixadas com o dono em 2026-06-16)

- **D1 — Nomenclatura:** métodos públicos PascalCase (`Create`, `FindById`) → **camelCase**. Refactor interno, não muda rotas HTTP.
- **D2 — Bugs:** **corrigir todos**, documentando cada mudança de comportamento no log.
- **D3 — Pagamento:** não há mais gateway. Pagamento = **link de WhatsApp no frontend**. → **Remover todo o módulo de pagamento/checkout** do backend (Infinitepay, MercadoPago, cron de confirmação, estorno, webhooks, emails de pagamento).
- **D4 — Ambiente:** **produção ativa**. Sem mudança de schema arriscada; toda alteração de entidade/coluna passa por migration revisada.
- **D5 — Estilo:** comentários só quando agregam, em PT-BR; **sem emojis em logs**; sem código comentado/morto.

---

## 🔎 ACHADOS (diagnóstico inicial)

**Stack:** NestJS 10, TypeORM 0.3, PostgreSQL, JWT (access+refresh), Cloudinary, SendGrid/nodemailer, Google OAuth, Throttler, cron-job.org.

### Código morto / a remover
- `src/orders/order.controller.ts` — **100% comentado** (nenhuma rota de pedido ativa).
- `src/checkout/checkout.controller.ts` — **100% comentado** (inclui webhooks MercadoPago comentados).
- `src/checkout/` inteiro (service 772 linhas, dtos, `cron-job-org.service.ts`, `config/mercadopago.config.ts`) → remover (D3).
- Blocos comentados: `ValidateRefundEligibility`, `paymentClient.cancel`, sends de email comentados, comentários "você pode/aqui você poderia".
- `RefundOrder` retorna `amount: 0` fixo (incompleto) — sai junto com o módulo.

### Duplicação (DRY)
- Boilerplate de transação (`createQueryRunner/connect/startTransaction/try/commit/catch rollback/finally release`) repetido ~10x.
- Loop "devolver item ao estoque" duplicado 4x: `RefundOrder`, `RefundOrderPartial`, `CancelOrder` (checkout) e `StockRelease` (orders) — com **inconsistência**: uns fazem `findProduct.quantity += x` + `update` (mutação no assignment), outro usa `increment` (correto).
- `order.service`: `FindByPrice*`, `FindByItem*` (Employees/Users) quase idênticos; check `if (!result) throw Internal` é **morto** (`findAndCount` nunca retorna null).
- `StockCheck` (products) duplica o switch de estoque que já existe em `orders.Create`.

### Bugs / correção (D2)
- `products.Create`: valida `if (!createProduct)` mas deveria validar `createdProduct` (variável errada).
- `products.Update`: `for (...) updatesPerformed.push(Object.keys(dto))` empurra o array inteiro a cada iteração — sem sentido.
- `products.StockCheck`: `findOneBy` pode retornar null e o destructuring quebra; param `orderId` nunca usado (tem `eslint-disable`).
- `auth.CreateTokensUser`: `ErrorManagement` (que lança) é chamado **antes** do try de email → email de alerta é inalcançável. Difere de `CreateTokensEmployee`.
- `auth.UpdatePassword`: `logger.log(findResetPassAttemptRegister)` loga hash de token + dados do usuário (PII/leak).
- `checkout.CheckPaymentStatus`: usa `confirmation.id` sem guarda após só avisar quando `!confirmation` (sai com o módulo).
- `main.ts`/README: README diz usar `X-CSRF-Token`, mas está comentado no CORS; reconciliar.

### Novos achados (sessão 2026-06-16)
- **BUG (Fase 5):** `EmailService.RenderTemplate` monta path `process.cwd()/src/templates/*.ejs`, mas os templates vivem em `src/email/templates` → caminho errado, emails provavelmente falham em runtime (dev e dist). Corrigir caminho.
- **Vestigial (Fase 2/3):** `product.module` importa `forwardRef(() => OrdersModule)` mas `ProductsService` não usa `OrdersService`. Após quebrar o circular, vários `forwardRef` viraram desnecessários (orders/products→email).
- **Git:** trabalho no branch `refactor/backend-kiss` (criado a partir de `master`). Mudanças em `product.controller.ts`/`product.service.ts` já estavam no working tree **antes** desta refatoração (não são desta sessão).

### Estilo (de-AI)
- Emojis em logs (✅⚠️🔄❌⏳) em todos os services.
- Comentários óbvios/bilíngues, numerados ("// 1.", "// 2."), placeholders.
- Nomes verbosos: `doesOrderReallyExists`, `doesEmployeeReallyExists`, `doesProductReallyExists`.
- Typos: "Logout criado com suceso", "Verficar", "Daods".
- `ListProducts` com `where: {}` redundante; padrão de retorno `[total, ...rows]` é incomum (avaliar DTO de paginação).

---

## 🗺️ PLANO POR FASES

> Ordem pensada para minimizar risco: primeiro apagar o morto (encolhe a superfície),
> depois DRY, depois estilo, depois renome, por fim bugs vivos e hardening.

### Fase 0 — Baseline & inventário  `[x] CONCLUÍDA (2026-06-16)`
- [x] Build: **verde** (exit 0). Lint: 8009 erros, **todos `prettier/prettier` CRLF** (line-endings Windows) — zero erro real. Normalização CRLF→adiada p/ Fase 6 (diff gigante).
- [x] Controllers ativos: app, auth, employee, product, refresh-token, user. **Comentados (mortos):** `orders`, `checkout`.
- [x] `CheckoutModule` **não importado** no `app.module` → órfão. Kill list confirmada.

### Fase 1 — Remover pagamento/checkout (maior ganho KISS)  `[~] PARCIAL — código feito; schema pendente`
- [x] Excluído `src/checkout/` inteiro (não havia ref em `app.module`). −2624 linhas no total da fase.
- [x] Removidos métodos de pagamento de `EmailService` (`SendOrderStatusEmail`, `PrepareEmailData`, `SendPayment*`, `SendRefund*`, `SendPartialRefund*`, `FormatCurrency`) + templates `.ejs` de pagamento + `email-base`/`email-usage.md` + `interfaces/email-template.ts`.
- [x] Removido `OrdersService.StockRelease` (morto) + imports órfãos.
- [x] Quebrada dep circular email↔orders (`email.module` não importa mais `OrdersModule`/`Order`).
- [ ] **1d (SCHEMA, requer migration revisada — D4):** remover `PaymentConfirmation` (entidade+relação em `Order`), enum `PaymentStatus`, valores de pagamento de `OrderStatus`, `RefundReason` e colunas de refund/cancel/payment de `Order`. **Hoje dormentes** (código não usa, tabela/colunas intactas em prod). NÃO rodar `migration:run` sem revisão do dono.
- [ ] Definir fluxo de pedido sobrevivente (criação + listagem) e reativar só o controller necessário — **decisão pendente com o dono** (orders está 100% comentado; confirmar se o front cria pedido no backend ou só abre WhatsApp).

### Fase 2 — DRY (extrair helpers)  `[~] PARCIAL`
- [x] Tipado `ErrorManagement(...)` como `never` (narrowing nos call sites).
- [x] Unificadas as buscas paginadas de `order.service` em `SearchOrders()` + `RequireUser()`; removidos os checks mortos `if (!result) throw Internal`.
- [ ] Helper de transação (`RunInTransaction`): **adiado** — sem ponto de adoção limpo agora (acopla collaborators a `QueryRunner`; `product.*` tem WIP; `order.Create` pende redesenho). Entra junto da 1ª adoção real. Pré-requisito: migrar `refreshToken.CreateEmployee/CreateUser`, `logs.CreateLog*`, `order.PriceCalculate`, `product.ReplaceImage/UpdateRegularData` de `QueryRunner`→`EntityManager`.
- [ ] Helper de ajuste de estoque (`increment`/`decrement`) — junto da limpeza de `product.service`.

### Fase 3 — De-AI do estilo (sem mudar comportamento)  `[~] PARCIAL`
- [x] `email.service`: removidos comentários placeholder ("Tirar em produção"), debug `logger.log(send)` (despejava resposta SMTP) e typos ("cração", msg stale "orders-status.ejs").
- [x] `refresh-token.service`: `doesEmployeeReallyExists`/`doesUserReallyExists` → `employee`/`user`.
- [x] `auth.service`: typo "suceso" → "sucesso".
- [ ] `product.service`: emojis (✅⚠️ etc.), `doesXReallyExists`, comentários numerados/placeholder ("Você pode...") — **adiado** até a WIP do dono em `product.controller.ts`/`product.service.ts` ser resolvida (evita misturar commits).

### Fase 4 — Padronizar camelCase (D1)  `[ ] pendente`
- [ ] Renomear métodos públicos de services + controllers + call sites (verificado por compilação).

### Fase 5 — Fix de bugs vivos (D2, documentar)  `[ ] pendente`
- [ ] `products.Create` (check de variável errada).
- [ ] `products.Update` (loop de updatesPerformed).
- [ ] `products.StockCheck` (null-safety + remover param/uso).
- [ ] `auth.CreateTokensUser` (email inalcançável).
- [ ] `auth.UpdatePassword` (remover log de PII/token).

### Fase 6 — Hardening & consistência  `[ ] pendente`
- [ ] Reconciliar CORS/CSRF com README.
- [ ] Revisar `synchronize` (segurança em prod).
- [ ] Padrão de retorno de paginação.
- [ ] Build + lint + testes verdes; atualizar README se necessário.

---

## 📝 LOG DE SESSÕES

| Data | Fase/Tarefa | Arquivos tocados | Notas |
|------|-------------|------------------|-------|
| 2026-06-16 | Diagnóstico + plano | (somente leitura) | Criado este guia. Decisões D1–D5 fixadas. Nada alterado em código. |
| 2026-06-16 | Fase 0 + Fase 1 (código) | `src/checkout/*` (del), `email.service.ts`, `email.module.ts`, `email/templates/*` (del 9), `order.service.ts`, `interfaces/email-template.ts` (del) | Branch `refactor/backend-kiss`. Removido checkout órfão + emails/StockRelease mortos + dep circular. −2624 linhas, 21 arquivos. Build verde, testes ok. Schema (PaymentConfirmation/colunas) deixado dormente → Fase 1d (migration revisada). Commit `refactor: remove dead payment/checkout module`. |
| 2026-06-16 | Fase 2 + Fase 3 (parcial) | `utils/error.util.ts`, `orders/order.service.ts`, `email/email.service.ts`, `refresh-tokens/refresh-token.service.ts`, `auth/auth.service.ts` | DRY: `SearchOrders`/`RequireUser` no order.service, `ErrorManagement: never`. De-AI: limpeza email + rename refresh + typo auth. Build verde, testes ok. `product.*` adiado (WIP do dono). Helper de transação adiado (sem adoção limpa). Convenção de commit: **Conventional Commits, curtos e diretos**. |
