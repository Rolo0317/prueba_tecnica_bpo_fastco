import sql from 'mssql';
import type { ProcedureRunner } from '../../database/procedure-executor.js';
import { parsePermissions, type NamedRef } from '../access/access.types.js';
import { passwordVersionOf, type SessionState } from '../auth/auth.types.js';
import type {
  AssignableUser,
  CreateUserInput,
  ManagedUser,
  PasswordResetContact,
  SetUserActiveInput,
  UpdateUserInput,
  UserListFilter,
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
  /** Solo la devuelve el listado. */
  PasswordResetRequestedAt?: Date | null;
  Email: string | null;
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
  email: row.Email,
  role: roleOf(row),
  area: areaOf(row),
  isActive: row.IsActive,
  createdAt: row.CreatedAt.toISOString(),
  passwordChangedAt: isoOrNull(row.PasswordChangedAt),
  passwordResetRequestedAt: isoOrNull(row.PasswordResetRequestedAt ?? null),
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

  async list(filter: UserListFilter): Promise<UserPage> {
    const { rows, output } = await this.db.execute<UserRow>('dbo.usp_Users_List', {
      inputs: {
        Page: { type: sql.Int, value: filter.page },
        PageSize: { type: sql.Int, value: filter.pageSize },
        Search: { type: sql.NVarChar(100), value: filter.search ?? null },
        RoleId: { type: sql.Int, value: filter.roleId ?? null },
        AreaId: { type: sql.Int, value: filter.areaId ?? null },
        Status: { type: sql.VarChar(10), value: filter.status ?? null },
        PendingReset: { type: sql.Bit, value: filter.pendingReset ?? false },
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
        Email: { type: sql.NVarChar(254), value: input.email },
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
        Email: { type: sql.NVarChar(254), value: input.email ?? null },
        ChangeEmail: { type: sql.Bit, value: input.email !== undefined },
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

  async requestPasswordReset(
    identifier: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetContact | null> {
    const { rows } = await this.db.execute<{ Email: string; FullName: string }>(
      'dbo.usp_PasswordResets_Request',
      {
        inputs: {
          Identifier: { type: sql.NVarChar(254), value: identifier },
          TokenHash: { type: sql.Char(64), value: tokenHash },
          ExpiresAt: { type: sql.DateTime2(3), value: expiresAt },
        },
      },
    );
    const [row] = rows;
    return row ? { email: row.Email, fullName: row.FullName } : null;
  }

  async consumePasswordReset(tokenHash: string, passwordHash: string): Promise<void> {
    await this.db.execute('dbo.usp_PasswordResets_Consume', {
      inputs: {
        TokenHash: { type: sql.Char(64), value: tokenHash },
        PasswordHash: { type: sql.VarChar(200), value: passwordHash },
      },
    });
  }

  async activateDemoAccounts(passwordHash: string): Promise<number> {
    const { rows } = await this.db.execute<{ Activated: number }>(
      'dbo.usp_Users_ActivateDemoAccounts',
      { inputs: { PasswordHash: { type: sql.VarChar(200), value: passwordHash } } },
    );
    return rows[0]?.Activated ?? 0;
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
