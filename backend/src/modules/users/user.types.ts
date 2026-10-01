export interface User {
  id: number;
  username: string;
  fullName: string;
}

export interface UserWithCredentials extends User {
  passwordHash: string;
}

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  fullName: string;
}

export interface UserRepository {
  findByUsername(username: string): Promise<UserWithCredentials | null>;
  create(input: CreateUserInput): Promise<User>;
}
