import sql from 'mssql';
import type { ProcedureRunner } from '../../database/procedure-executor.js';
import { passwordVersionOf, type SessionState } from '../auth/auth.types.js';
import type {
  AssignableUser,
  CreateUserInput,
  ManagedUser,
  Role,
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
  Role: Role;
  PasswordHash: string;
  PasswordChangedAt: Date | null;
}

type AssignableRow = Omit<CredentialsRow, 'PasswordHash' | 'PasswordChangedAt'>;

interface SessionRow {
  Role: Role;
  PasswordChangedAt: Date | null;
}

/** Fila de dbo.vw_Users. */
interface UserRow {
  UserId: number;
  Username: string;
  FullName: string;
  Role: Role;
  IsActive: boolean;
  CreatedAt: Date;
  PasswordChangedAt: Date | null;
}

const toCredentials = (row: CredentialsRow): UserWithCredentials => ({
  id: row.UserId,
  username: row.Username,
  fullName: row.FullName,
  role: row.Role,
  passwordHash: row.PasswordHash,
  passwordChangedAt: row.PasswordChangedAt?.toISOString() ?? null,
});

const toManagedUser = (row: UserRow): ManagedUser => ({
  id: row.UserId,
  username: row.Username,
  fullName: row.FullName,
  role: row.Role,
  isActive: row.IsActive,
  createdAt: row.CreatedAt.toISOString(),
  passwordChangedAt: row.PasswordChangedAt?.toISOString() ?? null,
});

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
    const [row] = rows;
    return row
      ? {
          role: row.Role,
          passwordVersion: passwordVersionOf(row.PasswordChangedAt?.toISOString() ?? null),
        }
      : null;
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
        Role: { type: sql.VarChar(20), value: input.role },
      },
    });
    return this.single(rows, 'usp_Users_Create');
  }

  async update(input: UpdateUserInput): Promise<ManagedUser> {
    const { rows } = await this.db.execute<UserRow>('dbo.usp_Users_Update', {
      inputs: {
        UserId: { type: sql.Int, value: input.userId },
        FullName: { type: sql.NVarChar(200), value: input.fullName },
        Role: { type: sql.VarChar(20), value: input.role },
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

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await this.db.execute('dbo.usp_Users_UpdatePassword', {
      inputs: {
        UserId: { type: sql.Int, value: userId },
        PasswordHash: { type: sql.VarChar(200), value: passwordHash },
      },
    });
  }

  async listAssignable(): Promise<AssignableUser[]> {
    const { rows } = await this.db.execute<AssignableRow>('dbo.usp_Users_ListAssignable');
    return rows.map((row) => ({
      id: row.UserId,
      username: row.Username,
      fullName: row.FullName,
      role: row.Role,
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
