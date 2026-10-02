import { Router } from 'express';
import { requirePermission } from '../../middlewares/authorize.js';
import { withValidation } from '../../middlewares/validate.js';
import type { AccessController } from './access.controller.js';
import {
  createAreaSchemas,
  createRoleSchemas,
  deleteRoleSchemas,
  listAreasSchemas,
  updateAreaSchemas,
  updateRoleSchemas,
} from './access.schemas.js';

/** Catálogo de permisos (para configurar roles). */
export function createPermissionRouter(controller: AccessController): Router {
  const router = Router();
  router.get('/', requirePermission('ROLES_MANAGE'), controller.listPermissions);
  return router;
}

/** Roles: los consulta quien administra usuarios (para asignarlos) o roles. */
export function createRoleRouter(controller: AccessController): Router {
  const router = Router();
  const manageRoles = requirePermission('ROLES_MANAGE');

  router.get('/', requirePermission('USERS_MANAGE', 'ROLES_MANAGE'), controller.listRoles);
  router.post('/', manageRoles, withValidation(createRoleSchemas, controller.createRole));
  router.put('/:id', manageRoles, withValidation(updateRoleSchemas, controller.updateRole));
  router.delete('/:id', manageRoles, withValidation(deleteRoleSchemas, controller.deleteRole));

  return router;
}

/** Áreas: cualquier usuario autenticado las consulta (filtros); solo AREAS_MANAGE las gestiona. */
export function createAreaRouter(controller: AccessController): Router {
  const router = Router();
  const manageAreas = requirePermission('AREAS_MANAGE');

  router.get('/', withValidation(listAreasSchemas, controller.listAreas));
  router.post('/', manageAreas, withValidation(createAreaSchemas, controller.createArea));
  router.patch('/:id', manageAreas, withValidation(updateAreaSchemas, controller.updateArea));

  return router;
}
