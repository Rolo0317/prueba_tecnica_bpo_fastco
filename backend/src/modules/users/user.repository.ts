import sql from 'mssql';
import type { ProcedureRunner } from '../../database/procedure-executor.js';
import { parsePermissions, type NamedRef } from '../access/access.types.js';
import { passwordVersionOf, type SessionState } from '../auth/auth.types.js';
import type {
  AssignableUser,
  CreateUserInput,
  ManagedUser,
  SetUserActiveInput,
  UpdateUserInput,
  UserPage,
  UserRepository,
  UserWithCredentials,
} from './user.types.js';

interface CredentialsRow {
  UserId: number;
  Username: string;
  FullName: string;
  PasswordHash: string;
  PasswordChangedAt: Date | null;
}

interface AreaColumns {
  AreaId: number | null;
  AreaName: string | null;
}

interface RoleColumns {
  RoleId: number;
  RoleName: string;
}

interface SessionRow extends RoleColumns, AreaColumns {
  UserId: number;
  Username: string;
  FullName: string;
  PasswordChangedAt: Date | null;
  Permissions: string;
}

interface AssignableRow extends AreaColumns {
  UserId: number;
  Username: string;
  FullName: string;
}

/** Fila de dbo.vw_Users. */
interface UserRow extends RoleColumns, AreaColumns {
  UserId: number;
  Username: string;
  FullName: string;
  IsActive: boolean;
  CreatedAt: Date;
  PasswordChangedAt: Date | null;
}

const isoOrNull = (date: Date | null): string | null => date?.toISOString() ?? null;

const areaOf = (row: AreaColumns): NamedRef | null =>
  row.AreaId === null ? null : { id: row.AreaId, name: row.AreaName ?? '' };

const roleOf = (row: RoleColumns): NamedRef => ({ id: row.RoleId, name: row.RoleName });

const toCredentials = (row: CredentialsRow): UserWithCredentials => ({
  id: row.UserId,
  username: row.Username,
  fullName: row.FullName,
  passwordHash: row.PasswordHash,
  passwordChangedAt: isoOrNull(row.PasswordChangedAt),
});

const toManagedUser = (row: UserRow): ManagedUser => ({
  id: row.UserId,
  username: row.Username,
  fullName: row.FullName,
  role: roleOf(row),
  area: areaOf(row),
  isActive: row.IsActive,
  createdAt: row.CreatedAt.toISOString(),
  passwordChangedAt: isoOrNull(row.PasswordChangedAt),
});

const toSessionState = (row: SessionRow): SessionState => ({
  user: {
    id: row.UserId,
    username: row.Username,
    fullName: row.FullName,
    role: roleOf(row),
    area: areaOf(row),
    permissions: parsePermissions(row.Permissions),
  },
  passwordVersion: passwordVersionOf(isoOrNull(row.PasswordChangedAt)),
});

const optionalInt = (value: number | null) => ({ type: sql.Int, value });

export class SqlUserRepository implements UserRepository {
  constructor(private readonly db: ProcedureRunner) {}

  async findByUsername(username: string): Promise<UserWithCredentials | null> {
    const { rows } = await this.db.execute<CredentialsRow>('dbo.usp_Users_GetByUsername', {
      inputs: { Username: { type: sql.NVarChar(100), value: username } },
    });
    return rows[0] ? toCredentials(rows[0]) : null;
  }

  async findCredentialsById(userId: number): Promise<UserWithCredentials | null> {
    const { rows } = await this.db.execute<CredentialsRow>('dbo.usp_Users_GetCredentialsById', {
      inputs: { UserId: { type: sql.Int, value: userId } },
    });
    return rows[0] ? toCredentials(rows[0]) : null;
  }

  async findSessionState(userId: number): Promise<SessionState | null> {
    const { rows } = await this.db.execute<SessionRow>('dbo.usp_Users_GetSessionState', {
      inputs: { UserId: { type: sql.Int, value: userId } },
    });
    return rows[0] ? toSessionState(rows[0]) : null;
  }

  async list(page: number, pageSize: number): Promise<UserPage> {
    const { rows, output } = await this.db.execute<UserRow>('dbo.usp_Users_List', {
      inputs: {
        Page: { type: sql.Int, value: page },
        PageSize: { type: sql.Int, value: pageSize },
      },
      outputs: { TotalCount: sql.Int },
    });
    return { users: rows.map(toManagedUser), total: Number(output.TotalCount ?? 0) };
  }

  async create(input: CreateUserInput): Promise<ManagedUser> {
    const { rows } = await this.db.execute<UserRow>('dbo.usp_Users_Create', {
      inputs: {
        Username: { type: sql.NVarChar(100), value: input.username },
        PasswordHash: { type: sql.VarChar(200), value: input.passwordHash },
        FullName: { type: sql.NVarChar(200), value: input.fullName },
        RoleId: { type: sql.Int, value: input.roleId },
        AreaId: optionalInt(input.areaId),
        ActorId: optionalInt(input.actorId),
      },
    });
    return this.single(rows, 'usp_Users_Create');
  }

  async update(input: UpdateUserInput): Promise<ManagedUser> {
    const { rows } = await this.db.execute<UserRow>('dbo.usp_Users_Update', {
      inputs: {
        UserId: { type: sql.Int, value: input.userId },
        FullName: { type: sql.NVarChar(200), value: input.fullName },
        RoleId: { type: sql.Int, value: input.roleId },
        AreaId: optionalInt(input.areaId),
        ChangedBy: { type: sql.Int, value: input.changedBy },
      },
    });
    return this.single(rows, 'usp_Users_Update');
  }

  async setActive(input: SetUserActiveInput): Promise<ManagedUser> {
    const { rows } = await this.db.execute<UserRow>('dbo.usp_Users_SetActive', {
      inputs: {
        UserId: { type: sql.Int, value: input.userId },
        IsActive: { type: sql.Bit, value: input.isActive },
        ChangedBy: { type: sql.Int, value: input.changedBy },
      },
    });
    return this.single(rows, 'usp_Users_SetActive');
  }

  async updatePassword(
    userId: number,
    passwordHash: string,
    actorId: number | null,
  ): Promise<void> {
    await this.db.execute('dbo.usp_Users_UpdatePassword', {
      inputs: {
        UserId: { type: sql.Int, value: userId },
        PasswordHash: { type: sql.VarChar(200), value: passwordHash },
        ActorId: optionalInt(actorId),
      },
    });
  }

  async listAssignable(actorId: number): Promise<AssignableUser[]> {
    const { rows } = await this.db.execute<AssignableRow>('dbo.usp_Users_ListAssignable', {
      inputs: { ActorId: { type: sql.Int, value: actorId } },
    });
    return rows.map((row) => ({
      id: row.UserId,
      username: row.Username,
      fullName: row.FullName,
      area: areaOf(row),
    }));
  }

  async delete(userId: number, changedBy: number): Promise<number> {
    const { rows } = await this.db.execute<{ UnassignedTasks: number }>('dbo.usp_Users_Delete', {
      inputs: {
        UserId: { type: sql.Int, value: userId },
        ChangedBy: { type: sql.Int, value: changedBy },
      },
    });
    return rows[0]?.UnassignedTasks ?? 0;
  }

  private single(rows: UserRow[], procedure: string): ManagedUser {
    const [row] = rows;
    if (!row) {
      throw new Error(`${procedure} no devolvió el usuario.`);
    }
    return toManagedUser(row);
  }
}
