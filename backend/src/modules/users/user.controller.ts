import type { RequestHandler } from 'express';
import { requireAuthUser } from '../../middlewares/authenticate.js';
import type { ValidatedHandler } from '../../middlewares/validate.js';
import type {
  changeOwnPasswordSchemas,
  createUserSchemas,
  deleteUserSchemas,
  listUsersSchemas,
  resetPasswordSchemas,
  setUserStatusSchemas,
  updateUserSchemas,
} from './user.schemas.js';
import type { LoginResult } from '../auth/auth.types.js';
import type { UserService } from './user.service.js';

/** Emite una sesión nueva (la anterior queda invalidada al cambiar la contraseña). */
export type SessionIssuer = (userId: number) => Promise<LoginResult>;

export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly issueSession: SessionIssuer,
  ) {}

  list: ValidatedHandler<typeof listUsersSchemas> = async ({ query }, _req, res) => {
    res.status(200).json(await this.userService.list(query.page, query.pageSize));
  };

  create: ValidatedHandler<typeof createUserSchemas> = async ({ body }, req, res) => {
    const user = await this.userService.create(body, requireAuthUser(req).id);
    res.status(201).location(`/api/v1/users/${user.id}`).json(user);
  };

  update: ValidatedHandler<typeof updateUserSchemas> = async ({ params, body }, req, res) => {
    res.status(200).json(await this.userService.update(params.id, body, requireAuthUser(req).id));
  };

  setStatus: ValidatedHandler<typeof setUserStatusSchemas> = async ({ params, body }, req, res) => {
    const user = await this.userService.setActive(
      params.id,
      body.isActive,
      requireAuthUser(req).id,
    );
    res.status(200).json(user);
  };

  listAssignable: RequestHandler = async (req, res) => {
    res.status(200).json(await this.userService.listAssignable(requireAuthUser(req).id));
  };

  /** Usuario autenticado con su rol, área y permisos vigentes. */
  me: RequestHandler = (req, res) => {
    res.status(200).json(requireAuthUser(req));
  };

  remove: ValidatedHandler<typeof deleteUserSchemas> = async ({ params }, req, res) => {
    res.status(200).json(await this.userService.remove(params.id, requireAuthUser(req).id));
  };

  resetPassword: ValidatedHandler<typeof resetPasswordSchemas> = async (
    { params, body },
    req,
    res,
  ) => {
    await this.userService.resetPassword(params.id, body.newPassword, requireAuthUser(req).id);
    res.status(204).end();
  };

  changeOwnPassword: ValidatedHandler<typeof changeOwnPasswordSchemas> = async (
    { body },
    req,
    res,
  ) => {
    const userId = requireAuthUser(req).id;
    await this.userService.changeOwnPassword(userId, body.currentPassword, body.newPassword);
    // Las demás sesiones de este usuario quedan cerradas; esta continúa con un token nuevo.
    res.status(200).json(await this.issueSession(userId));
  };
}
