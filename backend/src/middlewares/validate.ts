import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { ValidationError, type ErrorDetail } from '../core/errors.js';

z.config(z.locales.es());

type RequestPart = 'params' | 'query' | 'body';

export type RequestSchemas = Partial<Record<RequestPart, z.ZodType>>;

export type ValidatedInput<S extends RequestSchemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

export type ValidatedHandler<S extends RequestSchemas> = (
  input: ValidatedInput<S>,
  req: Request,
  res: Response,
) => Promise<void>;

const REQUEST_PARTS: readonly RequestPart[] = ['params', 'query', 'body'];

/** Nombre del campo afectado; en campos no permitidos zod reporta las llaves aparte del path. */
function fieldOf(issue: z.core.$ZodIssue, part: RequestPart): string {
  if (issue.code === 'unrecognized_keys') return issue.keys.join(', ');
  return issue.path.length > 0 ? issue.path.join('.') : part;
}

/** Valida params, query y body con zod; acumula todos los errores en una sola respuesta 400. */
export function parseRequest<S extends RequestSchemas>(schemas: S, req: Request): ValidatedInput<S> {
  const parsed: Partial<Record<RequestPart, unknown>> = {};
  const details: ErrorDetail[] = [];

  for (const part of REQUEST_PARTS) {
    const schema = schemas[part];
    if (!schema) continue;

    const result = schema.safeParse(req[part]);
    if (result.success) {
      parsed[part] = result.data;
    } else {
      details.push(
        ...result.error.issues.map((issue) => ({ field: fieldOf(issue, part), message: issue.message })),
      );
    }
  }

  if (details.length > 0) {
    throw new ValidationError(undefined, details);
  }
  return parsed as ValidatedInput<S>;
}

/**
 * Envuelve un handler para que reciba la entrada ya validada y tipada.
 * Express 5 propaga las promesas rechazadas al manejador central de errores.
 */
export function withValidation<S extends RequestSchemas>(
  schemas: S,
  handler: ValidatedHandler<S>,
): RequestHandler {
  return async (req, res) => {
    await handler(parseRequest(schemas, req), req, res);
  };
}
