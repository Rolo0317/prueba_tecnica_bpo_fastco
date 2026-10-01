import type { ValidatedHandler } from '../../middlewares/validate.js';
import type { loginSchemas } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login: ValidatedHandler<typeof loginSchemas> = async ({ body }, _req, res) => {
    const result = await this.authService.login(body.username, body.password);
    res.status(200).json(result);
  };
}
