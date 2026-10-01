/* =============================================================================
   05_procedures_users.sql
   Procedimientos del módulo de usuarios: login, administración (solo ADMIN,
   validado en la API) y cambio de contraseña.

   Reglas de integridad que se garantizan aquí, aunque la API también valide:
   - Solo se almacenan hashes bcrypt (nunca contraseñas en texto plano).
   - Un administrador no puede desactivarse ni quitarse el rol a sí mismo.
   - Siempre debe quedar al menos un administrador activo. El conteo se hace con
     UPDLOCK + HOLDLOCK para que dos administradores no se desactiven entre sí
     al mismo tiempo y dejen el sistema sin administradores.
   ============================================================================= */
USE [$(DB_NAME)];
GO

CREATE OR ALTER PROCEDURE dbo.usp_Users_GetByUsername
    @Username NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SELECT UserId, Username, PasswordHash, FullName, Role
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
        SELECT UserId, Username, PasswordHash, FullName, Role
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

        SELECT UserId, Username, FullName, Role, IsActive, CreatedAt, PasswordChangedAt
        FROM dbo.vw_Users
        -- Activos primero; dentro de ellos, administradores (pocos) y luego los más recientes.
        ORDER BY IsActive DESC, CASE Role WHEN 'ADMIN' THEN 0 ELSE 1 END, CreatedAt DESC, UserId DESC
        OFFSET CAST(@Page - 1 AS BIGINT) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Users_Create
    @Username     NVARCHAR(100),
    @PasswordHash VARCHAR(200),
    @FullName     NVARCHAR(200),
    @Role         VARCHAR(20) = 'AGENT'
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

        IF @Role IS NULL OR @Role NOT IN ('ADMIN', 'AGENT')
            THROW 50400, N'El rol debe ser ADMIN o AGENT.', 1;

        -- Defensa en profundidad: solo se aceptan hashes bcrypt, nunca contraseñas en texto plano.
        IF @PasswordHash IS NULL OR @PasswordHash NOT LIKE '$2[aby]$[0-9][0-9]$%' OR LEN(@PasswordHash) <> 60
            THROW 50400, N'El hash de la contraseña no tiene un formato bcrypt válido.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Users WHERE Username = @Username)
            THROW 50409, N'El nombre de usuario ya existe.', 1;

        INSERT INTO dbo.Users (Username, PasswordHash, FullName, Role)
        VALUES (@Username, @PasswordHash, @FullName, @Role);

        SELECT UserId, Username, FullName, Role, IsActive, CreatedAt, PasswordChangedAt
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

/* Edita nombre y rol. Un administrador no puede quitarse el rol a sí mismo ni dejar
   el sistema sin administradores activos. */
CREATE OR ALTER PROCEDURE dbo.usp_Users_Update
    @UserId    INT,
    @FullName  NVARCHAR(200),
    @Role      VARCHAR(20),
    @ChangedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SET @FullName = TRIM(@FullName);

        IF @FullName IS NULL OR LEN(@FullName) = 0 OR LEN(@FullName) > 100
            THROW 50400, N'El nombre completo es obligatorio y admite máximo 100 caracteres.', 1;

        IF @Role IS NULL OR @Role NOT IN ('ADMIN', 'AGENT')
            THROW 50400, N'El rol debe ser ADMIN o AGENT.', 1;

        DECLARE @CurrentRole VARCHAR(20), @IsActive BIT, @OtherActiveAdmins INT;

        BEGIN TRANSACTION;

            SELECT @CurrentRole = Role, @IsActive = IsActive
            FROM dbo.Users WITH (UPDLOCK, ROWLOCK)
            WHERE UserId = @UserId
              AND DeletedAt IS NULL;

            IF @CurrentRole IS NULL
                THROW 50404, N'El usuario no existe.', 1;

            IF @CurrentRole = 'ADMIN' AND @Role <> 'ADMIN'
            BEGIN
                IF @UserId = @ChangedBy
                    THROW 50409, N'No puedes quitarte a ti mismo el rol de administrador.', 1;

                SELECT @OtherActiveAdmins = COUNT(*)
                FROM dbo.Users WITH (UPDLOCK, HOLDLOCK)
                WHERE Role = 'ADMIN' AND IsActive = 1 AND DeletedAt IS NULL AND UserId <> @UserId;

                IF @IsActive = 1 AND @OtherActiveAdmins = 0
                    THROW 50409, N'Debe quedar al menos un administrador activo.', 1;
            END;

            UPDATE dbo.Users
            SET FullName = @FullName,
                Role = @Role
            WHERE UserId = @UserId;

        COMMIT TRANSACTION;

        SELECT UserId, Username, FullName, Role, IsActive, CreatedAt, PasswordChangedAt
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

        DECLARE @Role VARCHAR(20), @OtherActiveAdmins INT;

        BEGIN TRANSACTION;

            SELECT @Role = Role
            FROM dbo.Users WITH (UPDLOCK, ROWLOCK)
            WHERE UserId = @UserId
              AND DeletedAt IS NULL;

            IF @Role IS NULL
                THROW 50404, N'El usuario no existe.', 1;

            IF @IsActive = 0 AND @UserId = @ChangedBy
                THROW 50409, N'No puedes desactivar tu propio usuario.', 1;

            IF @IsActive = 0 AND @Role = 'ADMIN'
            BEGIN
                SELECT @OtherActiveAdmins = COUNT(*)
                FROM dbo.Users WITH (UPDLOCK, HOLDLOCK)
                WHERE Role = 'ADMIN' AND IsActive = 1 AND DeletedAt IS NULL AND UserId <> @UserId;

                IF @OtherActiveAdmins = 0
                    THROW 50409, N'Debe quedar al menos un administrador activo.', 1;
            END;

            UPDATE dbo.Users
            SET IsActive = @IsActive
            WHERE UserId = @UserId;

        COMMIT TRANSACTION;

        SELECT UserId, Username, FullName, Role, IsActive, CreatedAt, PasswordChangedAt
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

/* Reemplaza el hash de la contraseña (cambio propio o restablecimiento por un administrador). */
CREATE OR ALTER PROCEDURE dbo.usp_Users_UpdatePassword
    @UserId       INT,
    @PasswordHash VARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @PasswordHash IS NULL OR @PasswordHash NOT LIKE '$2[aby]$[0-9][0-9]$%' OR LEN(@PasswordHash) <> 60
            THROW 50400, N'El hash de la contraseña no tiene un formato bcrypt válido.', 1;

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

/* Usuarios que pueden ser responsables de una tarea (activos y no eliminados). */
CREATE OR ALTER PROCEDURE dbo.usp_Users_ListAssignable
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SELECT UserId, Username, FullName, Role
        FROM dbo.vw_Users
        WHERE IsActive = 1
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
   asignar para que un administrador las reasigne. Devuelve cuántas se liberaron. */
CREATE OR ALTER PROCEDURE dbo.usp_Users_Delete
    @UserId    INT,
    @ChangedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        DECLARE @Role VARCHAR(20), @IsActive BIT, @OtherActiveAdmins INT, @Unassigned INT;

        BEGIN TRANSACTION;

            SELECT @Role = Role, @IsActive = IsActive
            FROM dbo.Users WITH (UPDLOCK, ROWLOCK)
            WHERE UserId = @UserId
              AND DeletedAt IS NULL;

            IF @Role IS NULL
                THROW 50404, N'El usuario no existe.', 1;

            IF @UserId = @ChangedBy
                THROW 50409, N'No puedes eliminar tu propio usuario.', 1;

            IF @Role = 'ADMIN' AND @IsActive = 1
            BEGIN
                SELECT @OtherActiveAdmins = COUNT(*)
                FROM dbo.Users WITH (UPDLOCK, HOLDLOCK)
                WHERE Role = 'ADMIN' AND IsActive = 1 AND DeletedAt IS NULL AND UserId <> @UserId;

                IF @OtherActiveAdmins = 0
                    THROW 50409, N'Debe quedar al menos un administrador activo.', 1;
            END;

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
