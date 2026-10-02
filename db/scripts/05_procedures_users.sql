/* =============================================================================
   05_procedures_users.sql
   Procedimientos del módulo de usuarios: login, sesión, administración y contraseñas.

   Reglas de integridad y seguridad que se garantizan aquí, aunque la API también valide:
   - Solo se almacenan hashes bcrypt (nunca contraseñas en texto plano).
   - SIN ESCALADA DE PRIVILEGIOS: quien administra usuarios no puede asignar un rol con
     permisos que él mismo no tiene, ni gestionar a alguien con más permisos que él.
   - Nadie cambia su propio rol, ni se desactiva o elimina a sí mismo.
   - Siempre queda al menos un usuario activo con el rol Administrador. El conteo se hace
     con UPDLOCK + HOLDLOCK para que dos operaciones simultáneas no lo dejen en cero.
   ============================================================================= */
USE [$(DB_NAME)];
GO

/* Permisos de un rol que el actor NO tiene (sin filas = puede otorgarlo o gestionarlo). */
CREATE OR ALTER FUNCTION dbo.tvf_RolePermissionsNotHeld (@RoleId INT, @ActorId INT)
RETURNS TABLE
AS
RETURN
SELECT rp.PermissionCode
FROM dbo.RolePermissions AS rp
WHERE rp.RoleId = @RoleId
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.Users AS actor
      INNER JOIN dbo.RolePermissions AS held ON held.RoleId = actor.RoleId
      WHERE actor.UserId = @ActorId
        AND actor.IsActive = 1
        AND actor.DeletedAt IS NULL
        AND held.PermissionCode = rp.PermissionCode
  );
GO

/* El actor puede gestionar al usuario objetivo solo si este no tiene más permisos que él. */
CREATE OR ALTER PROCEDURE dbo.usp_Users_AssertCanManage
    @UserId  INT,
    @ActorId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        DECLARE @TargetRoleId INT = (SELECT RoleId FROM dbo.Users WHERE UserId = @UserId AND DeletedAt IS NULL);

        IF @TargetRoleId IS NULL
            THROW 50404, N'El usuario no existe.', 1;

        IF EXISTS (SELECT 1 FROM dbo.tvf_RolePermissionsNotHeld(@TargetRoleId, @ActorId))
            THROW 50403, N'No puedes gestionar a un usuario con más permisos que los tuyos.', 1;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* Valida el rol y el área que se asignan a un usuario. @ActorId NULL = sistema (seed). */
CREATE OR ALTER PROCEDURE dbo.usp_Users_ValidateRoleAndArea
    @RoleId  INT,
    @AreaId  INT,
    @ActorId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @RoleId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleId = @RoleId)
            THROW 50400, N'El rol indicado no existe.', 1;

        IF @AreaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Areas WHERE AreaId = @AreaId AND IsActive = 1)
            THROW 50400, N'El área indicada no existe o está inactiva.', 1;

        IF @ActorId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.tvf_RolePermissionsNotHeld(@RoleId, @ActorId))
            THROW 50403, N'No puedes asignar un rol con permisos que tú no tienes.', 1;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* Falla si @UserId es el único Administrador activo (bloquea el rango contado). */
CREATE OR ALTER PROCEDURE dbo.usp_Users_AssertNotLastAdmin
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        DECLARE @AdminRoleId INT = (SELECT RoleId FROM dbo.Roles WHERE Code = 'ADMIN');

        IF EXISTS (
            SELECT 1 FROM dbo.Users
            WHERE UserId = @UserId AND RoleId = @AdminRoleId AND IsActive = 1 AND DeletedAt IS NULL
        )
        AND NOT EXISTS (
            SELECT 1 FROM dbo.Users WITH (UPDLOCK, HOLDLOCK)
            WHERE RoleId = @AdminRoleId AND IsActive = 1 AND DeletedAt IS NULL AND UserId <> @UserId
        )
            THROW 50409, N'Debe quedar al menos un Administrador activo.', 1;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Users_GetByUsername
    @Username NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SELECT UserId, Username, PasswordHash, FullName, PasswordChangedAt
        FROM dbo.Users
        WHERE Username = TRIM(@Username)
          AND IsActive = 1
          AND DeletedAt IS NULL;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* Credenciales de un usuario activo por id (para verificar la contraseña actual). */
CREATE OR ALTER PROCEDURE dbo.usp_Users_GetCredentialsById
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SELECT UserId, Username, PasswordHash, FullName, PasswordChangedAt
        FROM dbo.Users
        WHERE UserId = @UserId
          AND IsActive = 1
          AND DeletedAt IS NULL;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* Estado vigente de la sesión: se consulta en cada petición autenticada.
   Sin filas = usuario inactivo o eliminado (su token deja de valer de inmediato).
   Devuelve rol, área y permisos efectivos (CSV): un cambio de rol, de área o de los
   permisos de un rol aplica desde la siguiente petición, sin volver a iniciar sesión.
   La fecha del último cambio de contraseña permite cerrar las sesiones anteriores. */
CREATE OR ALTER PROCEDURE dbo.usp_Users_GetSessionState
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SELECT
            u.UserId, u.Username, u.FullName,
            u.RoleId, r.Name AS RoleName,
            u.AreaId, ar.Name AS AreaName,
            u.PasswordChangedAt,
            ISNULL((
                SELECT STRING_AGG(rp.PermissionCode, ',')
                FROM dbo.RolePermissions AS rp
                WHERE rp.RoleId = u.RoleId
            ), '') AS Permissions
        FROM dbo.Users AS u
        INNER JOIN dbo.Roles AS r ON r.RoleId = u.RoleId
        LEFT  JOIN dbo.Areas AS ar ON ar.AreaId = u.AreaId
        WHERE u.UserId = @UserId
          AND u.IsActive = 1
          AND u.DeletedAt IS NULL;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Users_List
    @Page       INT = 1,
    @PageSize   INT = 10,
    @TotalCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @Page IS NULL OR @Page < 1
            THROW 50400, N'La página debe ser un número mayor o igual a 1.', 1;

        IF @PageSize IS NULL OR @PageSize NOT BETWEEN 1 AND 100
            THROW 50400, N'El tamaño de página debe estar entre 1 y 100.', 1;

        SELECT @TotalCount = COUNT(*) FROM dbo.vw_Users;

        SELECT UserId, Username, FullName, RoleId, RoleName, AreaId, AreaName,
               IsActive, CreatedAt, PasswordChangedAt
        FROM dbo.vw_Users
        -- Activos primero; dentro de ellos, administradores (pocos) y luego los más recientes.
        ORDER BY IsActive DESC, CASE RoleCode WHEN 'ADMIN' THEN 0 ELSE 1 END, CreatedAt DESC, UserId DESC
        OFFSET CAST(@Page - 1 AS BIGINT) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* @ActorId NULL solo lo usa el seed del sistema (administrador inicial). */
CREATE OR ALTER PROCEDURE dbo.usp_Users_Create
    @Username     NVARCHAR(100),
    @PasswordHash VARCHAR(200),
    @FullName     NVARCHAR(200),
    @RoleId       INT,
    @AreaId       INT = NULL,
    @ActorId      INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SET @Username = TRIM(@Username);
        SET @FullName = TRIM(@FullName);

        IF @Username IS NULL OR LEN(@Username) = 0 OR LEN(@Username) > 50
            THROW 50400, N'El nombre de usuario es obligatorio y admite máximo 50 caracteres.', 1;

        IF @FullName IS NULL OR LEN(@FullName) = 0 OR LEN(@FullName) > 100
            THROW 50400, N'El nombre completo es obligatorio y admite máximo 100 caracteres.', 1;

        -- Defensa en profundidad: solo se aceptan hashes bcrypt, nunca contraseñas en texto plano.
        IF @PasswordHash IS NULL OR @PasswordHash NOT LIKE '$2[aby]$[0-9][0-9]$%' OR LEN(@PasswordHash) <> 60
            THROW 50400, N'El hash de la contraseña no tiene un formato bcrypt válido.', 1;

        EXEC dbo.usp_Users_ValidateRoleAndArea @RoleId, @AreaId, @ActorId;

        IF EXISTS (SELECT 1 FROM dbo.Users WHERE Username = @Username)
            THROW 50409, N'El nombre de usuario ya existe.', 1;

        INSERT INTO dbo.Users (Username, PasswordHash, FullName, RoleId, AreaId)
        VALUES (@Username, @PasswordHash, @FullName, @RoleId, @AreaId);

        SELECT UserId, Username, FullName, RoleId, RoleName, AreaId, AreaName,
               IsActive, CreatedAt, PasswordChangedAt
        FROM dbo.vw_Users
        WHERE UserId = CAST(SCOPE_IDENTITY() AS INT);
    END TRY
    BEGIN CATCH
        -- Dos registros simultáneos con el mismo usuario: la restricción UNIQUE gana la carrera.
        IF ERROR_NUMBER() IN (2601, 2627)
            THROW 50409, N'El nombre de usuario ya existe.', 1;

        THROW;
    END CATCH;
END;
GO

/* Edita nombre, rol y área. */
CREATE OR ALTER PROCEDURE dbo.usp_Users_Update
    @UserId    INT,
    @FullName  NVARCHAR(200),
    @RoleId    INT,
    @AreaId    INT = NULL,
    @ChangedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SET @FullName = TRIM(@FullName);

        IF @FullName IS NULL OR LEN(@FullName) = 0 OR LEN(@FullName) > 100
            THROW 50400, N'El nombre completo es obligatorio y admite máximo 100 caracteres.', 1;

        DECLARE @CurrentRoleId INT;

        BEGIN TRANSACTION;

            SELECT @CurrentRoleId = RoleId
            FROM dbo.Users WITH (UPDLOCK, ROWLOCK)
            WHERE UserId = @UserId
              AND DeletedAt IS NULL;

            IF @CurrentRoleId IS NULL
                THROW 50404, N'El usuario no existe.', 1;

            EXEC dbo.usp_Users_AssertCanManage @UserId, @ChangedBy;

            IF @RoleId <> @CurrentRoleId
            BEGIN
                IF @UserId = @ChangedBy
                    THROW 50409, N'No puedes cambiar tu propio rol.', 1;

                EXEC dbo.usp_Users_AssertNotLastAdmin @UserId;
            END;

            EXEC dbo.usp_Users_ValidateRoleAndArea @RoleId, @AreaId, @ChangedBy;

            UPDATE dbo.Users
            SET FullName = @FullName,
                RoleId = @RoleId,
                AreaId = @AreaId
            WHERE UserId = @UserId;

        COMMIT TRANSACTION;

        SELECT UserId, Username, FullName, RoleId, RoleName, AreaId, AreaName,
               IsActive, CreatedAt, PasswordChangedAt
        FROM dbo.vw_Users
        WHERE UserId = @UserId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;
    END CATCH;
END;
GO

/* Activa o desactiva un usuario. Un usuario inactivo no puede iniciar sesión. */
CREATE OR ALTER PROCEDURE dbo.usp_Users_SetActive
    @UserId    INT,
    @IsActive  BIT,
    @ChangedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @IsActive IS NULL
            THROW 50400, N'Debes indicar si el usuario queda activo o inactivo.', 1;

        BEGIN TRANSACTION;

            IF NOT EXISTS (SELECT 1 FROM dbo.Users WITH (UPDLOCK, ROWLOCK) WHERE UserId = @UserId AND DeletedAt IS NULL)
                THROW 50404, N'El usuario no existe.', 1;

            IF @IsActive = 0 AND @UserId = @ChangedBy
                THROW 50409, N'No puedes desactivar tu propio usuario.', 1;

            EXEC dbo.usp_Users_AssertCanManage @UserId, @ChangedBy;

            IF @IsActive = 0
                EXEC dbo.usp_Users_AssertNotLastAdmin @UserId;

            UPDATE dbo.Users
            SET IsActive = @IsActive
            WHERE UserId = @UserId;

        COMMIT TRANSACTION;

        SELECT UserId, Username, FullName, RoleId, RoleName, AreaId, AreaName,
               IsActive, CreatedAt, PasswordChangedAt
        FROM dbo.vw_Users
        WHERE UserId = @UserId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;
    END CATCH;
END;
GO

/* Reemplaza el hash de la contraseña: cambio propio (@ActorId NULL o el mismo usuario)
   o restablecimiento por quien administra usuarios (sin escalada de privilegios). */
CREATE OR ALTER PROCEDURE dbo.usp_Users_UpdatePassword
    @UserId       INT,
    @PasswordHash VARCHAR(200),
    @ActorId      INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @PasswordHash IS NULL OR @PasswordHash NOT LIKE '$2[aby]$[0-9][0-9]$%' OR LEN(@PasswordHash) <> 60
            THROW 50400, N'El hash de la contraseña no tiene un formato bcrypt válido.', 1;

        IF @ActorId IS NOT NULL AND @ActorId <> @UserId
            EXEC dbo.usp_Users_AssertCanManage @UserId, @ActorId;

        UPDATE dbo.Users
        SET PasswordHash = @PasswordHash,
            PasswordChangedAt = SYSUTCDATETIME()
        WHERE UserId = @UserId
          AND DeletedAt IS NULL;

        IF @@ROWCOUNT = 0
            THROW 50404, N'El usuario no existe.', 1;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* Usuarios a los que el actor puede asignar tareas: todos los activos si ve todas las
   áreas; si no, los activos de su área y él mismo. */
CREATE OR ALTER PROCEDURE dbo.usp_Users_ListAssignable
    @ActorId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        DECLARE @ViewAll BIT = 0, @ActorAreaId INT = NULL;
        SELECT @ViewAll = ViewAll, @ActorAreaId = AreaId
        FROM dbo.tvf_UserAccess(@ActorId);

        SELECT UserId, Username, FullName, AreaId, AreaName
        FROM dbo.vw_Users
        WHERE IsActive = 1
          AND (@ViewAll = 1 OR UserId = @ActorId OR AreaId = @ActorAreaId)
        ORDER BY FullName, UserId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* Eliminación lógica: el usuario deja de existir para la aplicación (no inicia sesión,
   no aparece en la administración ni como responsable), pero su nombre se conserva en
   las tareas que creó y en el historial (trazabilidad). Sus tareas abiertas quedan sin
   asignar (y queda registrado) para reasignarlas. Devuelve cuántas se liberaron. */
CREATE OR ALTER PROCEDURE dbo.usp_Users_Delete
    @UserId    INT,
    @ChangedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        DECLARE @Unassigned INT;

        BEGIN TRANSACTION;

            IF NOT EXISTS (SELECT 1 FROM dbo.Users WITH (UPDLOCK, ROWLOCK) WHERE UserId = @UserId AND DeletedAt IS NULL)
                THROW 50404, N'El usuario no existe.', 1;

            IF @UserId = @ChangedBy
                THROW 50409, N'No puedes eliminar tu propio usuario.', 1;

            EXEC dbo.usp_Users_AssertCanManage @UserId, @ChangedBy;
            EXEC dbo.usp_Users_AssertNotLastAdmin @UserId;

            DECLARE @Released TABLE (TaskId INT NOT NULL PRIMARY KEY);

            UPDATE t
            SET AssignedTo = NULL,
                UpdatedAt = SYSUTCDATETIME()
            OUTPUT inserted.TaskId INTO @Released (TaskId)
            FROM dbo.Tasks AS t
            INNER JOIN dbo.TaskStatuses AS s ON s.StatusId = t.StatusId
            WHERE t.AssignedTo = @UserId
              AND s.IsFinal = 0;

            SET @Unassigned = @@ROWCOUNT;

            INSERT INTO dbo.TaskAssignmentHistory (TaskId, FromUserId, ToUserId, ChangedBy)
            SELECT TaskId, @UserId, NULL, @ChangedBy
            FROM @Released;

            UPDATE dbo.Users
            SET IsActive = 0,
                DeletedAt = SYSUTCDATETIME()
            WHERE UserId = @UserId;

        COMMIT TRANSACTION;

        SELECT @Unassigned AS UnassignedTasks;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;
    END CATCH;
END;
GO
