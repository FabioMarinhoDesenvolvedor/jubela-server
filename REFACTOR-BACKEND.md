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

### 📌 REGRAS BÁSICAS (antes de iniciar QUALQUER tarefa)
1. Leia `docs/memory/README.md` (índice de memórias do projeto).
2. Consulte as **decisões** relacionadas (seção DECISÕES deste guia + memórias).
3. Consulte os **gotchas** relevantes (achados/bugs já mapeados aqui).
4. **Evite contradizer decisões existentes** — se precisar mudar, registre o porquê.
5. Ao final da sessão, **sugira novas memórias** ao dono.

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

### Fase 4 — Padronizar camelCase (D1)  `[x] CONCLUÍDA`
- [x] Métodos de services/controllers/guards + funções utilitárias (`errorManagement`, `getErrorMessage`) → camelCase. Rotas HTTP inalteradas. Rename via padrões ancorados (`.metodo(` + definições), validado por build.

### Fase 5 — Fix de bugs vivos (D2, documentar)  `[x] CONCLUÍDA`
- [x] `products.create`: validava `createProduct` (não-persistido) → `createdProduct`.
- [x] `products.update`: loop empilhava o array de chaves → `updatesPerformed.push(...campos)` uma vez.
- [x] `products.stockCheck`: null-safety + removido param `orderId` morto e `eslint-disable`.
- [x] `auth.createTokensUser`: e-mail de alerta agora roda antes de `errorManagement` (que lança).
- [x] `auth.updatePassword`: removido `logger.log` do registro de reset (hash/PII).
- [x] **Bonus:** `email.renderTemplate` apontava p/ `src/templates` → `__dirname`; `nest-cli.json` passa a copiar `.ejs` p/ `dist` (e-mail estava quebrado em prod).

### Fase 6 — Hardening & consistência  `[x] CONCLUÍDA`
- [x] Removido scaffolding morto de CSRF (`SkipCsrf`, `SKIP_CSRF_KEY`, restos comentados); README alinhado.
- [x] `app.config`: `Boolean(env)` → `env === 'true'` (evitava synchronize/autoLoadEntities ligarem por engano).
- [x] Lint: `endOfLine: 'auto'` no Prettier → 0 erros (eram ~8000 por CRLF) sem reescrever todos os arquivos.
- [x] **Paginação `[total, ...rows]`:** decidido **manter** — controllers ativos (products/employees/users) e frontend dependem do formato. Mudança ficaria para um redesenho de contrato de API.
- [x] Build + lint + testes verdes.

---

## 🔍 REVISÃO — Cadastro de produtos (2026-06-17, só leitura)

**Fluxo:** `POST /products` (multipart) → `ProductsController.create` (guard `EDIT_PRODUCTS`,
`FilesInterceptor` 1–4 imgs JPEG/PNG ≤5MB) → `ProductsService.create`: valida funcionário do token,
sobe imagens no Cloudinary, transação cria `Product` + `ProductImages` (1ª = `isMain`), retorna o
produto com `images`. **O código do cadastro está completo e correto.** Pontos confirmados:
- DTO (`CreateProductDTO`) bate 1:1 com o payload do front (`price` string decimal, `quantity`/`lowStock`
  via `@Transform(parseInt)`, `sku`/`name`/`category`/`description`). `ValidationPipe` global tem
  `transform:true` → os `@Transform` rodam. `whitelist`+`forbidNonWhitelisted` ok (front não manda campo extra).
- `Product.images` é **`eager:true`** → a listagem pública `GET /products` já retorna a galeria (por isso
  a vitrine e a página de produto do front funcionam mesmo sem `GET /:id`).
- Auth cross-site (Vercel × Render): cookies `httpOnly` + `secure(prod)` + `sameSite:'none'` — corretos.

**O que falta para o cadastro FUNCIONAR em produção (ambiente/dados, não código) — A CONFIRMAR:**
1. **`NODE_ENV=production` no Render** — com `sameSite:'none'` o navegador exige `Secure`; se `NODE_ENV`
   não for `production`, `secure:false` e o cookie de sessão é **descartado** → admin não autentica →
   cadastro falha. *(Suspeito nº1.)*
2. **CORS:** hoje libera só `https://jubela-client.vercel.app` + localhost. Confirmar o **domínio real**
   do front em produção; se for outro, todas as chamadas autenticadas são bloqueadas.
3. **Cloudinary:** variáveis de ambiente configuradas no Render (sem elas o upload falha).
4. **Funcionário com papel `EDIT_PRODUCTS`** existente no banco de produção (o cadastro é restrito a esse
   papel; login admin é via `POST /auth/employee`).

## 🔓 EM ABERTO (próximas sessões / decisão do dono)
- **Fase 1d (schema/migration):** remover `PaymentConfirmation`, colunas de payment/refund/cancel em `Order`, enums `PaymentStatus`/`RefundReason`/valores de pagamento em `OrderStatus`. Hoje dormentes. Requer migration revisada (prod ativo, D4).
- **Fluxo de pedido:** `OrdersController` segue 100% comentado → backend não cria/lista pedidos. Definir se o front cria pedido no backend (reativar controller) ou se ficou só no WhatsApp.
- **Helper de transação (`RunInTransaction`):** introduzir junto da 1ª adoção real, migrando collaborators de `QueryRunner`→`EntityManager`.
- **`product.service` de-AI (Fase 3):** ainda adiado; hoje o arquivo está legível (sem emojis), revisar comentários óbvios numa próxima passada.
- **`GET /products/:id`:** não existe (front contorna achando na lista). Avaliar adicionar por eficiência.
- **Lint:** `test/app.e2e-spec.ts` fora do `tsconfig` do typed-linting → 1 erro de parsing (tooling, não código). Incluir o `test/` no parserOptions ou ajustar o glob do lint.

---

## 📝 LOG DE SESSÕES


| Data | Fase/Tarefa | Arquivos tocados | Notas |
|------|-------------|------------------|-------|
| 2026-06-16 | Diagnóstico + plano | (somente leitura) | Criado este guia. Decisões D1–D5 fixadas. Nada alterado em código. |
| 2026-06-16 | Fase 0 + Fase 1 (código) | `src/checkout/*` (del), `email.service.ts`, `email.module.ts`, `email/templates/*` (del 9), `order.service.ts`, `interfaces/email-template.ts` (del) | Branch `refactor/backend-kiss`. Removido checkout órfão + emails/StockRelease mortos + dep circular. −2624 linhas, 21 arquivos. Build verde, testes ok. Schema (PaymentConfirmation/colunas) deixado dormente → Fase 1d (migration revisada). Commit `refactor: remove dead payment/checkout module`. |
| 2026-06-16 | Fase 2 + Fase 3 (parcial) | `utils/error.util.ts`, `orders/order.service.ts`, `email/email.service.ts`, `refresh-tokens/refresh-token.service.ts`, `auth/auth.service.ts` | DRY: `SearchOrders`/`RequireUser` no order.service, `ErrorManagement: never`. De-AI: limpeza email + rename refresh + typo auth. Build verde, testes ok. `product.*` adiado (WIP do dono). Helper de transação adiado (sem adoção limpa). Convenção de commit: **Conventional Commits, curtos e diretos**. |
| 2026-06-16 | WIP product + Fases 3→6 | `product.*` (WIP do dono commitada), todos os services/controllers (camelCase), `app.config`, `auth.*`, `email.*`, `nest-cli.json`, `main.ts`, `.prettierrc`, `README` | Commitada WIP do dono (fix rota price + busca por categoria). De-AI no product. **Fase 4** camelCase (métodos+utils). **Fase 5** bugs (products/auth + caminho de template e assets de email). **Fase 6** CSRF morto removido, parsing de env seguro, lint 0 erros (endOfLine auto), paginação mantida. Build/lint/testes verdes. Tudo comitado no branch `refactor/backend-kiss` (não pushado). |
| 2026-06-17 | Push do branch + regras básicas | `REFACTOR-BACKEND.md` | Branch `refactor/backend-kiss` **publicado no GitHub** (backup, sem deploy — prod do backend é `master`, intacta). Adicionadas as regras básicas de sessão. |
| 2026-06-17 | **Revisão do cadastro de produtos** (só leitura) | (leitura) | Auditado o fluxo `POST /products`: **código completo e correto** (DTO bate com o front, `images` eager, cookies cross-site ok, `ValidationPipe transform`). Pendências p/ funcionar em prod são de **ambiente/dados** (NODE_ENV=production no Render, CORS do domínio real, env Cloudinary, funcionário com `EDIT_PRODUCTS`) — ver seção REVISÃO. Build verde; lint com 1 erro de tooling (e2e fora do tsconfig). Nada codado. |
