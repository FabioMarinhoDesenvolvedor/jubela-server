# Jubela E-Commerce - API

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql&logoColor=white)](https://www.postgresql.org/)<br>
Aplicação full-stack de e-commerce desenvolvida com Node.js e PostgreSQL.

O sistema implementa a estrutura de uma loja online com catálogo de produtos, carrinho de compras e fluxo de pedidos, seguindo uma arquitetura moderna de aplicações web com separação clara entre camada de interface e camada de serviços.

## 📌 Status

🚧 Em Desenvolvimento

## 🚀 Stack Tecnológica

- Runtime: Node.js
- Framework: NestJS 10
- ORM: TypeORM 0.3
- Banco de Dados: PostgreSQL
- Autenticação: JWT (Access + Refresh Tokens)
- Integrações: Infinitepay, Cloudinary, GoogleOAuth<br>

## 🗄️ Estrutura do Banco de Dados

### Principais Entidades

- Employee: Funcionários
- User: Usuários
- Product: Produtos cadastrados
- Item: Produtos dos pedidos
- Order: Pedidos
- RefreshTokenEmployee: Tokens de autenticação de funcionários
- RefreshTokenUser: Tokens de autenticação de usuários
- JWTBlacklist: Tokens invalidados

### Relacionamentos
<img src="https://github.com/fabiojsdev/jubela-server/blob/master/images/jbserver%20-%20public.png" width=550 />

## 🛡️ Recursos de Segurança
### Rate Limiting
Limites configurados por tipo de operação:<br>

- auth: 5 requisições/minuto (login)
- refresh: 10 requisições/minuto
- write: 10 requisições/10 segundos (criação/atualização)
- read: 50 requisições/10 segundos (consultas)
- preference: 10 requisições/minuto
- global: 100 requisições/minuto

### CORS

- Configurado para permitir credenciais
- Lista de origens permitidas definida em `main.ts`
- Headers permitidos: `Content-Type`, `Authorization`, `X-Requested-With`

### Cookies Seguros

`httpOnly: true` para tokens de autenticação<br>
`sameSite: 'none'` em produção (cross-domain)<br>
`secure: true` apenas em HTTPS (produção)<br>

## ⚠️ Direitos autorais e uso de código
Este projeto é um **software real desenvolvido pelos autores.**

Todo o código-fonte, estrutura, arquitetura e implementação estão protegidos por **direitos autorais**. Não é permitido copiar, redistribuir, reutilizar ou reproduzir este projeto, total ou parcialmente, sem autorização expressa dos autores.

O uso não autorizado do código ou de qualquer parte deste projeto pode resultar em **responsabilização civil e penal**, conforme a legislação aplicável de direitos autorais e propriedade intelectual.

## 👨‍💻 Autores

[Lucas Fortunato](https://github.com/LucasNasc3000)<br>

[Fábio Marinho](https://github.com/fabiojsdev)
