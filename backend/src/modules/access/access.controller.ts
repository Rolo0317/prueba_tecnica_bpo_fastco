import type { RequestHandler } from 'express';
import { requireAuthUser } from '../../middlewares/authenticate.js';
import type { ValidatedHandler } from '../../middlewares/validate.js';
import type {
  createAreaSchemas,
  createRoleSchemas,
  deleteRoleSchemas,
  listAreasSchemas,
  updateAreaSchemas,
  updateRoleSchemas,
} from './access.schemas.js';
import type { AccessService } from './access.service.js';

export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  listPermissions: RequestHandler = async (_req, res) => {
    res.status(200).json(await this.accessService.listPermissions());
  };

  listRoles: RequestHandler = async (_req, res) => {
    res.status(200).json(await this.accessService.listRoles());
  };

  createRole: ValidatedHandler<typeof createRoleSchemas> = async ({ body }, req, res) => {
    const role = await this.accessService.createRole(body, requireAuthUser(req).id);
    res.status(201).location(`/api/v1/roles/${role.id}`).json(role);
  };

  updateRole: ValidatedHandler<typeof updateRoleSchemas> = async ({ params, body }, req, res) => {
    res
      .status(200)
      .json(await this.accessService.updateRole(params.id, body, requireAuthUser(req).id));
  };

  deleteRole: ValidatedHandler<typeof deleteRoleSchemas> = async ({ params }, req, res) => {
    await this.accessService.deleteRole(params.id, requireAuthUser(req).id);
    res.status(204).end();
  };

  listAreas: ValidatedHandler<typeof listAreasSchemas> = async ({ query }, _req, res) => {
    res.status(200).json(await this.accessService.listAreas(query.includeInactive));
  };

  createArea: ValidatedHandler<typeof createAreaSchemas> = async ({ body }, _req, res) => {
    const area = await this.accessService.createArea(body);
    res.status(201).location(`/api/v1/areas/${area.id}`).json(area);
  };

  updateArea: ValidatedHandler<typeof updateAreaSchemas> = async ({ params, body }, _req, res) => {
    res.status(200).json(await this.accessService.updateArea(params.id, body));
  };
}
