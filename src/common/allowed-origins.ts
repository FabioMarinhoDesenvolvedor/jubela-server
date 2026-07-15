// Allowlist de origens usada tanto pelo CORS (main.ts) quanto pela defesa
// CSRF (CsrfGuard) — fonte única para os dois não divergirem.
export function getAllowedOrigins(): string[] {
  return [
    'https://jubelabrasil.com.br',
    'https://www.jubelabrasil.com.br',
    'https://jubela-client.vercel.app',
    ...(process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ];
}
