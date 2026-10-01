import { http, type ApiClient } from '@/core/http';

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function createAccountService(client: ApiClient) {
  return {
    changePassword: (payload: ChangePasswordPayload) => client.put('/account/password', payload),
  };
}

export type AccountService = ReturnType<typeof createAccountService>;

export const accountService = createAccountService(http);
