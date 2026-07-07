export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message; // Erros padrão geralmente são seguros
  }

  // Retorna mensagem genérica para fora
  return 'Ocorreu um erro inesperado';
}
