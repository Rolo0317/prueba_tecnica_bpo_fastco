/* =============================================================================
   07_security.sql
   Usuario de aplicación con mínimo privilegio: la API NUNCA se conecta como SA.
   Solo puede ejecutar procedimientos del esquema dbo; no puede leer ni escribir
   tablas directamente (el acceso a datos ocurre por ownership chaining de los SPs).

   Variables sqlcmd: $(DB_NAME), $(DB_APP_USER), $(DB_APP_PASSWORD)
   Las credenciales llegan desde .env; no hay ninguna escrita en este script.
   Idempotente: si el login ya existe, sincroniza la contraseña con la de .env.
   ============================================================================= */
USE master;
GO
SET NOCOUNT ON;
GO

DECLARE @Login    SYSNAME       = N'$(DB_APP_USER)';
DECLARE @Password NVARCHAR(128) = N'$(DB_APP_PASSWORD)';
DECLARE @Sql      NVARCHAR(MAX);

IF SUSER_ID(@Login) IS NULL
    SET @Sql = N'CREATE LOGIN ' + QUOTENAME(@Login)
             + N' WITH PASSWORD = ' + QUOTENAME(@Password, '''')
             + N', CHECK_POLICY = ON, DEFAULT_DATABASE = ' + QUOTENAME(N'$(DB_NAME)') + N';';
ELSE
    SET @Sql = N'ALTER LOGIN ' + QUOTENAME(@Login)
             + N' WITH PASSWORD = ' + QUOTENAME(@Password, '''') + N';';

EXEC sys.sp_executesql @Sql;
GO

USE [$(DB_NAME)];
GO

DECLARE @User SYSNAME = N'$(DB_APP_USER)';
DECLARE @Sql  NVARCHAR(MAX);

IF USER_ID(@User) IS NULL
BEGIN
    SET @Sql = N'CREATE USER ' + QUOTENAME(@User) + N' FOR LOGIN ' + QUOTENAME(@User) + N';';
    EXEC sys.sp_executesql @Sql;
END;

SET @Sql = N'GRANT EXECUTE ON SCHEMA::dbo TO ' + QUOTENAME(@User) + N';';
EXEC sys.sp_executesql @Sql;
GO
