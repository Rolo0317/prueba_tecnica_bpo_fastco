/* =============================================================================
   01_database.sql
   Crea la base de datos si no existe. Se ejecuta en el contexto de master.
   Variables sqlcmd: $(DB_NAME)
   ============================================================================= */
SET NOCOUNT ON;
GO

IF DB_ID(N'$(DB_NAME)') IS NULL
BEGIN
    PRINT N'Creando base de datos $(DB_NAME)...';
    CREATE DATABASE [$(DB_NAME)];
END;
GO

/* READ_COMMITTED_SNAPSHOT: las lecturas (listado) no bloquean ni son bloqueadas
   por las escrituras (crear / cambiar estado). Mejora la concurrencia en una
   operación con muchos agentes trabajando a la vez. */
IF EXISTS (
    SELECT 1
    FROM sys.databases
    WHERE name = N'$(DB_NAME)'
      AND is_read_committed_snapshot_on = 0
)
BEGIN
    ALTER DATABASE [$(DB_NAME)] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
END;
GO
