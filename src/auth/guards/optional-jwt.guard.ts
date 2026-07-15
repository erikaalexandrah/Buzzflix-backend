import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Autenticación opcional por JWT.
 *
 * A diferencia de AuthGuard('jwt'), nunca rechaza la petición: si hay un token
 * válido expone `req.user`; si no hay token (o es inválido/expirado) deja
 * `req.user` sin definir y permite continuar. Útil para endpoints públicos que
 * personalizan la respuesta cuando el usuario está autenticado.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(_err: any, user: any) {
    // No lanzamos si falta el usuario: simplemente queda como anónimo.
    return user || undefined;
  }
}
