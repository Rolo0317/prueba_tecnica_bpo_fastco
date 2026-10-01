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
import type { UserService } from './user.service.js';

export class UserController {
  constructor(private readonly userService: UserService) {}

  list: ValidatedHandler<typeof listUsersSchemas> = async ({ query }, _req, res) => {
    res.status(200).json(await this.userService.list(query.page, query.pageSize));
  };

  create: ValidatedHandler<typeof createUserSchemas> = async ({ body }, _req, res) => {
    const user = await this.userService.create(body);
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

  listAssignable: RequestHandler = async (_req, res) => {
    res.status(200).json(await this.userService.listAssignable());
  };

  remove: ValidatedHandler<typeof deleteUserSchemas> = async ({ params }, req, res) => {
    res.status(200).json(await this.userService.remove(params.id, requireAuthUser(req).id));
  };

  resetPassword: ValidatedHandler<typeof resetPasswordSchemas> = async (
    { params, body },
    _req,
    res,
  ) => {
    await this.userService.resetPassword(params.id, body.newPassword);
    res.status(204).end();
  };

  changeOwnPassword: ValidatedHandler<typeof changeOwnPasswordSchemas> = async (
    { body },
    req,
    res,
  ) => {
    await this.userService.changeOwnPassword(
      requireAuthUser(req).id,
      body.currentPassword,
      body.newPassword,
    );
    res.status(204).end();
  };
}
