import sql from 'mssql';
import type { ProcedureParameter, ProcedureRunner } from '../../database/procedure-executor.js';
import {
  parsePermissions,
  type AccessRepository,
  type Area,
  type AreaInput,
  type PermissionInfo,
  type Role,
  type RoleInput,
} from './access.types.js';

interface PermissionRow {
  Code: string;
  Name: string;
  Description: string;
  GroupName: string;
}

interface RoleRow {
  RoleId: number;
  Code: string | null;
  Name: string;
  Description: string | null;
  IsLocked: boolean;
  Permissions: string;
  UsersCount: number;
}

interface AreaRow {
  AreaId: number;
  Name: string;
  Description: string | null;
  IsActive: boolean;
  CreatedAt: Date;
  UsersCount: number;
  OpenTasksCount: number;
}

const toRole = (row: RoleRow): Role => ({
  id: row.RoleId,
  code: row.Code,
  name: row.Name,
  description: row.Description,
  isLocked: row.IsLocked,
  permissions: parsePermissions(row.Permissions),
  usersCount: row.UsersCount,
});

const toArea = (row: AreaRow): Area => ({
  id: row.AreaId,
  name: row.Name,
  description: row.Description,
  isActive: row.IsActive,
  createdAt: row.CreatedAt.toISOString(),
  usersCount: row.UsersCount,
  openTasksCount: row.OpenTasksCount,
});

const roleInputs = (input: RoleInput, actorId: number): Record<string, ProcedureParameter> => ({
  Name: { type: sql.NVarChar(100), value: input.name },
  Description: { type: sql.NVarChar(400), value: input.description },
  Permissions: { type: sql.VarChar(1000), value: input.permissions.join(',') },
  ActorId: { type: sql.Int, value: actorId },
});

export class SqlAccessRepository implements AccessRepository {
  constructor(private readonly db: ProcedureRunner) {}

  async listPermissions(): Promise<PermissionInfo[]> {
    const { rows } = await this.db.execute<PermissionRow>('dbo.usp_Permissions_List');
    // Solo los permisos que este código conoce (un permiso nuevo en BD no se expone a medias).
    return rows.flatMap((row) =>
      parsePermissions(row.Code).map((code) => ({
        code,
        name: row.Name,
        description: row.Description,
        group: row.GroupName,
      })),
    );
  }

  async listRoles(): Promise<Role[]> {
    const { rows } = await this.db.execute<RoleRow>('dbo.usp_Roles_List');
    return rows.map(toRole);
  }

  async createRole(input: RoleInput, actorId: number): Promise<number> {
    const { rows } = await this.db.execute<{ RoleId: number }>('dbo.usp_Roles_Create', {
      inputs: roleInputs(input, actorId),
    });
    const [row] = rows;
    if (!row) throw new Error('usp_Roles_Create no devolvió el rol.');
    return row.RoleId;
  }

  async updateRole(roleId: number, input: RoleInput, actorId: number): Promise<void> {
    await this.db.execute('dbo.usp_Roles_Update', {
      inputs: { RoleId: { type: sql.Int, value: roleId }, ...roleInputs(input, actorId) },
    });
  }

  async deleteRole(roleId: number, actorId: number): Promise<void> {
    await this.db.execute('dbo.usp_Roles_Delete', {
      inputs: {
        RoleId: { type: sql.Int, value: roleId },
        ActorId: { type: sql.Int, value: actorId },
      },
    });
  }

  async listAreas(includeInactive: boolean): Promise<Area[]> {
    const { rows } = await this.db.execute<AreaRow>('dbo.usp_Areas_List', {
      inputs: { IncludeInactive: { type: sql.Bit, value: includeInactive } },
    });
    return rows.map(toArea);
  }

  async saveArea(areaId: number | null, input: AreaInput): Promise<Area> {
    const { rows } = await this.db.execute<AreaRow>('dbo.usp_Areas_Save', {
      inputs: {
        AreaId: { type: sql.Int, value: areaId },
        Name: { type: sql.NVarChar(160), value: input.name },
        Description: { type: sql.NVarChar(400), value: input.description },
        IsActive: { type: sql.Bit, value: input.isActive },
      },
    });
    const [row] = rows;
    if (!row) throw new Error('usp_Areas_Save no devolvió el área.');
    return toArea(row);
  }
}
