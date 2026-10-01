import sql from 'mssql';
import type { ProcedureRunner } from '../../database/procedure-executor.js';
import type { CreateUserInput, User, UserRepository, UserWithCredentials } from './user.types.js';

interface UserRow {
  UserId: number;
  Username: string;
  FullName: string;
}

interface UserCredentialsRow extends UserRow {
  PasswordHash: string;
}

const toUser = (row: UserRow): User => ({
  id: row.UserId,
  username: row.Username,
  fullName: row.FullName,
});

export class SqlUserRepository implements UserRepository {
  constructor(private readonly db: ProcedureRunner) {}

  async findByUsername(username: string): Promise<UserWithCredentials | null> {
    const { rows } = await this.db.execute<UserCredentialsRow>('dbo.usp_Users_GetByUsername', {
      inputs: { Username: { type: sql.NVarChar(100), value: username } },
    });
    const [row] = rows;
    return row ? { ...toUser(row), passwordHash: row.PasswordHash } : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const { rows } = await this.db.execute<UserRow>('dbo.usp_Users_Create', {
      inputs: {
        Username: { type: sql.NVarChar(100), value: input.username },
        PasswordHash: { type: sql.VarChar(200), value: input.passwordHash },
        FullName: { type: sql.NVarChar(200), value: input.fullName },
      },
    });
    const [row] = rows;
    if (!row) {
      throw new Error('usp_Users_Create no devolvió el usuario creado.');
    }
    return toUser(row);
  }
}
