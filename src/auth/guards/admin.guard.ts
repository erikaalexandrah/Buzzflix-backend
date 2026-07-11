import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protege rutas que solo puede usar un usuario con role 'admin'.
 * Valida el JWT (igual que AuthGuard('jwt')) y además exige role === 'admin'.
 */
@Injectable()
export class AdminGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return user;
  }
}
