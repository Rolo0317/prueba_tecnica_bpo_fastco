import type sql from 'mssql';
import { translateSqlError } from './sql-errors.js';

type SqlType = (() => sql.ISqlType) | sql.ISqlType;

export interface ProcedureParameter {
  type: SqlType;
  value: unknown;
}

export interface ProcedureCall {
  inputs?: Record<string, ProcedureParameter>;
  outputs?: Record<string, SqlType>;
}

export interface ProcedureResult<TRow> {
  rows: TRow[];
  output: Record<string, unknown>;
}

/** Abstracción mínima que usan los repositories (permite reemplazarla en pruebas). */
export interface ProcedureRunner {
  execute<TRow>(procedure: string, call?: ProcedureCall): Promise<ProcedureResult<TRow>>;
  ping(): Promise<void>;
}

/**
 * Único punto de acceso a SQL Server: solo ejecuta Stored Procedures con parámetros
 * tipados (nunca SQL concatenado) y traduce los errores de negocio a AppError.
 */
export class ProcedureExecutor implements ProcedureRunner {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async execute<TRow>(procedure: string, call: ProcedureCall = {}): Promise<ProcedureResult<TRow>> {
    const request = this.pool.request();

    for (const [name, { type, value }] of Object.entries(call.inputs ?? {})) {
      request.input(name, type, value);
    }
    for (const [name, type] of Object.entries(call.outputs ?? {})) {
      request.output(name, type);
    }

    try {
      const result = await request.execute<TRow>(procedure);
      // Un SP que termina sin SELECT (p. ej. con RETURN) no trae recordset: se normaliza a [].
      const rows = result.recordset as TRow[] | undefined; // los tipos de mssql no lo reflejan
      return { rows: rows ?? [], output: result.output };
    } catch (error) {
      throw translateSqlError(error);
    }
  }

  /** Verificación de conectividad para el healthcheck (sin acceso a tablas). */
  async ping(): Promise<void> {
    await this.pool.request().query('SELECT 1 AS ok');
  }
}
