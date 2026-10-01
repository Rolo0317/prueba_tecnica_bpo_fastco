#!/usr/bin/env bash
# =============================================================================
# Ejecuta en orden todos los scripts de db/scripts contra SQL Server.
# Lo usa el contenedor db-init de docker compose. Es idempotente: se puede
# ejecutar en cada arranque sin duplicar objetos ni datos.
#
# Variables requeridas: DB_HOST, DB_PORT, DB_NAME, MSSQL_SA_PASSWORD,
#                       DB_APP_USER, DB_APP_PASSWORD
# =============================================================================
set -euo pipefail

: "${DB_HOST:?DB_HOST es obligatoria}"
: "${DB_PORT:?DB_PORT es obligatoria}"
: "${DB_NAME:?DB_NAME es obligatoria}"
: "${MSSQL_SA_PASSWORD:?MSSQL_SA_PASSWORD es obligatoria}"
: "${DB_APP_USER:?DB_APP_USER es obligatoria}"
: "${DB_APP_PASSWORD:?DB_APP_PASSWORD es obligatoria}"

SQLCMD="/opt/mssql-tools18/bin/sqlcmd"
SCRIPTS_DIR="${SCRIPTS_DIR:-/db/scripts}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-30}"

# La contraseña viaja por variable de entorno y no como argumento (-P),
# así no queda visible en la lista de procesos.
export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"

run_sqlcmd() {
  "$SQLCMD" -S "${DB_HOST},${DB_PORT}" -U sa -C -b -I "$@"
}

wait_for_sql_server() {
  local attempt=1
  until run_sqlcmd -Q "SELECT 1" > /dev/null 2>&1; do
    if (( attempt >= MAX_ATTEMPTS )); then
      echo "[db-init] SQL Server no respondió después de ${MAX_ATTEMPTS} intentos." >&2
      exit 1
    fi
    echo "[db-init] Esperando a SQL Server (intento ${attempt}/${MAX_ATTEMPTS})..."
    attempt=$(( attempt + 1 ))
    sleep 2
  done
}

run_scripts() {
  local script
  for script in "$SCRIPTS_DIR"/*.sql; do
    echo "[db-init] Ejecutando $(basename "$script")"
    run_sqlcmd \
      -v DB_NAME="$DB_NAME" DB_APP_USER="$DB_APP_USER" DB_APP_PASSWORD="$DB_APP_PASSWORD" \
      -i "$script"
  done
}

wait_for_sql_server
run_scripts
echo "[db-init] Base de datos '${DB_NAME}' lista."
