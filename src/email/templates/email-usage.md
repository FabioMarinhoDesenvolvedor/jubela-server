# Como usar os templates no EmailService

## Instalação

```bash
npm install ejs nodemailer
npm install -D @types/ejs @types/nodemailer
```

## Estrutura de pastas

```
src/
  email/
    templates/
      email-base.ejs
      email-payment-approved.ejs
      email-payment-reminder.ejs
      email-payment-urgent.ejs
      email-order-canceled.ejs
      email-refund.ejs
      email-partial-refund.ejs
    email.service.ts
```

## email.service.ts

```typescript
import * as ejs from 'ejs';
import * as path from 'path';
import * as nodemailer from 'nodemailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  private templatesDir = path.join(__dirname, 'templates');

  private baseData(customerName: string) {
    return {
      storeName: process.env.STORE_NAME,
      storeUrl: process.env.STORE_URL,
      customerName,
      subject: '',        // sobrescrito por cada método
      title: '',
      subtitle: '',
      icon: '',
      bodyContent: '',
    };
  }

  private async render(template: string, data: object): Promise<string> {
    return ejs.renderFile(
      path.join(this.templatesDir, `${template}.ejs`),
      data,
      { views: [this.templatesDir] }, // permite o include('email-base')
    );
  }

  private async send(to: string, subject: string, html: string) {
    await this.transporter.sendMail({
      from: `"${process.env.STORE_NAME}" <${process.env.SMTP_FROM}>`,
      to,
      subject,
      html,
    });
  }

  // ── Pagamento aprovado ──────────────────────────────────────────
  async SendPaymentApprovedEmail(order: Order, isAdmin: boolean) {
    const to = isAdmin ? process.env.ADMIN_EMAIL : order.user.email;
    const subject = `Pedido #${order.id} confirmado`;

    const html = await this.render('email-payment-approved', {
      ...this.baseData(isAdmin ? 'Administrador' : order.user.name),
      subject,
      order,
      checkoutUrl: null,
    });

    await this.send(to, subject, html);
  }

  // ── Lembrete (10min) ────────────────────────────────────────────
  async SendPaymentReminderEmail(order: Order) {
    const subject = `Seu pedido #${order.id} aguarda pagamento`;

    const html = await this.render('email-payment-reminder', {
      ...this.baseData(order.user.name),
      subject,
      order,
      checkoutUrl: order.checkoutUrl, // salve a URL ao criar o checkout
    });

    await this.send(order.user.email, subject, html);
  }

  // ── Urgente (30min) ─────────────────────────────────────────────
  async SendPaymentUrgentReminderEmail(order: Order) {
    const subject = `⚠️ Pedido #${order.id} será cancelado em breve`;

    const html = await this.render('email-payment-urgent', {
      ...this.baseData(order.user.name),
      subject,
      order,
      checkoutUrl: order.checkoutUrl,
    });

    await this.send(order.user.email, subject, html);
  }

  // ── Cancelado (60min) ───────────────────────────────────────────
  async SendOrderCanceledEmail(order: Order) {
    const subject = `Pedido #${order.id} cancelado`;

    const html = await this.render('email-order-canceled', {
      ...this.baseData(order.user.name),
      subject,
      order,
    });

    await this.send(order.user.email, subject, html);
  }

  // ── Estorno total ───────────────────────────────────────────────
  async SendRefundProcessedEmail(order: Order, isAdmin: boolean) {
    const to = isAdmin ? process.env.ADMIN_EMAIL : order.user.email;
    const subject = `Estorno do pedido #${order.id} confirmado`;

    const html = await this.render('email-refund', {
      ...this.baseData(isAdmin ? 'Administrador' : order.user.name),
      subject,
      order,
      refundAmount: order.totalAmount,
      refundReason: order.refundReason,
    });

    await this.send(to, subject, html);
  }

  // ── Estorno parcial ─────────────────────────────────────────────
  async SendPartialRefundEmail(
    order: Order,
    refundAmount: number,
    isAdmin: boolean,
    details: { productName: string; quantity: number; amount: number }[],
  ) {
    const to = isAdmin ? process.env.ADMIN_EMAIL : order.user.email;
    const subject = `Estorno parcial do pedido #${order.id} confirmado`;

    const html = await this.render('email-partial-refund', {
      ...this.baseData(isAdmin ? 'Administrador' : order.user.name),
      subject,
      order,
      refundAmount,
      details,
    });

    await this.send(to, subject, html);
  }
}
```

## Variáveis de ambiente necessárias

```env
STORE_NAME=Minha Loja
STORE_URL=https://minhaloja.com.br
ADMIN_EMAIL=admin@minhaloja.com.br
SMTP_HOST=smtp.seuservidor.com
SMTP_PORT=465
SMTP_USER=no-reply@minhaloja.com.br
SMTP_PASS=sua-senha
SMTP_FROM=no-reply@minhaloja.com.br
```
