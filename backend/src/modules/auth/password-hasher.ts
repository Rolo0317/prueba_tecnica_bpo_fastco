import bcrypt from 'bcryptjs';
import type { PasswordHasher } from './auth.types.js';

export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly saltRounds: number) {}

  hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, this.saltRounds);
  }

  verify(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }
}
