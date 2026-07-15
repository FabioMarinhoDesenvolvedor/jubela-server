import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { getAllowedOrigins } from 'src/common/allowed-origins';

/**
 * Defesa CSRF para a autenticação por cookie (sameSite: 'none').
 *
 * Verifica o header `Origin` nas requisições que alteram estado
 * (POST/PUT/PATCH/DELETE): se vier de uma origem fora da allowlist, bloqueia.
 *
 * Por que funciona: um ataque CSRF parte sempre de um navegador em outro site,
 * e o navegador anexa obrigatoriamente o `Origin` da página atacante em toda
 * requisição cross-site que muda estado — valor que o atacante não consegue
 * forjar. Requisições sem `Origin` (scripts server-side, curl) não são vetor
 * de CSRF e passam, para não quebrar ferramentas de integração (ex.: import/).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly MUTATING_METHODS = new Set([
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
  ]);

  canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest();

    if (!CsrfGuard.MUTATING_METHODS.has(request.method)) {
      return true;
    }

    const origin = request.headers.origin;

    // Sem Origin: cliente não-navegador — não é vetor de CSRF.
    if (!origin) {
      return true;
    }

    if (getAllowedOrigins().includes(origin)) {
      return true;
    }

    throw new ForbiddenException('Origem não autorizada (CSRF)');
  }
}
