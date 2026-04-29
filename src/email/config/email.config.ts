import { registerAs } from '@nestjs/config';

export default registerAs('email', () => {
  return {
    user: process.env.BREVO_SMTP_USER,
    password: process.env.BREVO_SMTP_PASS,
    from: process.env.FROM_EMAIL,
  };
});
