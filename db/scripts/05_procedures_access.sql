/* =============================================================================
   05_procedures_access.sql
   Control de acceso configurable: catálogo de permisos, roles y áreas.

   - Los permisos son un catálogo fijo (cada uno lo hace cumplir el código).
   - Los roles se configuran como combinación de permisos. SIN ESCALADA: nadie crea
     ni edita un rol con permisos que él mismo no tiene, ni edita su propio rol.
   - El rol Administrador (bloqueado) y los roles del sistema no se eliminan.
   ============================================================================= */
USE [$(DB_NAME)];
GO

CREATE OR ALTER PROCEDURE dbo.usp_Permissions_List
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SELECT Code, Name, Description, GroupName
        FROM dbo.Permissions
        ORDER BY SortOrder;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Roles_List
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SELECT
            r.RoleId, r.Code, r.Name, r.Description, r.IsLocked,
            ISNULL(p.Permissions, '') AS Permissions,
            ISNULL(u.UsersCount, 0)   AS UsersCount
        FROM dbo.Roles AS r
        OUTER APPLY (
            SELECT STRING_AGG(rp.PermissionCode, ',') AS Permissions
            FROM dbo.RolePermissions AS rp
            WHERE rp.RoleId = r.RoleId
        ) AS p
        OUTER APPLY (
            SELECT COUNT(*) AS UsersCount
            FROM dbo.Users AS x
            WHERE x.RoleId = r.RoleId AND x.DeletedAt IS NULL
        ) AS u
        ORDER BY r.IsLocked DESC, CASE WHEN r.Code IS NULL THEN 1 ELSE 0 END, r.Name;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* Valida nombre y permisos de un rol (CSV de códigos) y deja la lista en #RolePermissions,
   que el procedimiento llamador crea antes de invocarlo. */
CREATE OR ALTER PROCEDURE dbo.usp_Roles_ValidateDefinition
    @Name        NVARCHAR(100),
    @Permissions VARCHAR(1000),
    @ActorId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @Name IS NULL OR LEN(TRIM(@Name)) = 0 OR LEN(TRIM(@Name)) > 50
            THROW 50400, N'El nombre del rol es obligatorio y admite máximo 50 caracteres.', 1;

        INSERT INTO #RolePermissions (PermissionCode)
        SELECT DISTINCT TRIM(value)
        FROM STRING_SPLIT(ISNULL(@Permissions, ''), ',')
        WHERE LEN(TRIM(value)) > 0;

        IF EXISTS (
            SELECT 1 FROM #RolePermissions AS s
            WHERE NOT EXISTS (SELECT 1 FROM dbo.Permissions AS p WHERE p.Code = s.PermissionCode)
        )
            THROW 50400, N'Uno de los permisos indicados no existe.', 1;

        IF EXISTS (
            SELECT 1 FROM #RolePermissions AS s
            WHERE NOT EXISTS (
                SELECT 1
                FROM dbo.Users AS actor
                INNER JOIN dbo.RolePermissions AS held ON held.RoleId = actor.RoleId
                WHERE actor.UserId = @ActorId
                  AND actor.IsActive = 1
                  AND actor.DeletedAt IS NULL
                  AND held.PermissionCode = s.PermissionCode
            )
        )
            THROW 50403, N'No puedes otorgar permisos que tú no tienes.', 1;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Roles_Create
    @Name        NVARCHAR(100),
    @Description NVARCHAR(400) = NULL,
    @Permissions VARCHAR(1000),
    @ActorId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SET @Name = TRIM(@Name);
        SET @Description = NULLIF(TRIM(@Description), N'');

        IF LEN(@Description) > 200
            THROW 50400, N'La descripción admite máximo 200 caracteres.', 1;

        CREATE TABLE #RolePermissions (PermissionCode VARCHAR(40) NOT NULL PRIMARY KEY);
        EXEC dbo.usp_Roles_ValidateDefinition @Name, @Permissions, @ActorId;

        DECLARE @RoleId INT;

        BEGIN TRANSACTION;

            INSERT INTO dbo.Roles (Name, Description)
            VALUES (@Name, @Description);

            SET @RoleId = CAST(SCOPE_IDENTITY() AS INT);

            INSERT INTO dbo.RolePermissions (RoleId, PermissionCode)
            SELECT @RoleId, PermissionCode FROM #RolePermissions;

        COMMIT TRANSACTION;

        SELECT @RoleId AS RoleId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        IF ERROR_NUMBER() IN (2601, 2627)
            THROW 50409, N'Ya existe un rol con ese nombre.', 1;

        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Roles_Update
    @RoleId      INT,
    @Name        NVARCHAR(100),
    @Description NVARCHAR(400) = NULL,
    @Permissions VARCHAR(1000),
    @ActorId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SET @Name = TRIM(@Name);
        SET @Description = NULLIF(TRIM(@Description), N'');

        IF LEN(@Description) > 200
            THROW 50400, N'La descripción admite máximo 200 caracteres.', 1;

        CREATE TABLE #RolePermissions (PermissionCode VARCHAR(40) NOT NULL PRIMARY KEY);

        BEGIN TRANSACTION;

            DECLARE @IsLocked BIT;
            SELECT @IsLocked = IsLocked FROM dbo.Roles WITH (UPDLOCK, ROWLOCK) WHERE RoleId = @RoleId;

            IF @IsLocked IS NULL
                THROW 50404, N'El rol no existe.', 1;

            IF @IsLocked = 1
                THROW 50409, N'El rol Administrador no se puede modificar.', 1;

            IF EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @ActorId AND RoleId = @RoleId)
                THROW 50409, N'No puedes modificar tu propio rol.', 1;

            -- Quien edita debe tener todos los permisos actuales del rol y todos los nuevos.
            IF EXISTS (SELECT 1 FROM dbo.tvf_RolePermissionsNotHeld(@RoleId, @ActorId))
                THROW 50403, N'No puedes modificar un rol con permisos que tú no tienes.', 1;

            EXEC dbo.usp_Roles_ValidateDefinition @Name, @Permissions, @ActorId;

            UPDATE dbo.Roles
            SET Name = @Name,
                Description = @Description
            WHERE RoleId = @RoleId;

            DELETE FROM dbo.RolePermissions
            WHERE RoleId = @RoleId
              AND PermissionCode NOT IN (SELECT PermissionCode FROM #RolePermissions);

            INSERT INTO dbo.RolePermissions (RoleId, PermissionCode)
            SELECT @RoleId, s.PermissionCode
            FROM #RolePermissions AS s
            WHERE NOT EXISTS (
                SELECT 1 FROM dbo.RolePermissions AS rp
                WHERE rp.RoleId = @RoleId AND rp.PermissionCode = s.PermissionCode
            );

        COMMIT TRANSACTION;

        SELECT @RoleId AS RoleId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        IF ERROR_NUMBER() IN (2601, 2627)
            THROW 50409, N'Ya existe un rol con ese nombre.', 1;

        THROW;
    END CATCH;
END;
GO

/* Elimina un rol creado por un administrador, solo si ningún usuario vigente lo tiene.
   Los usuarios eliminados (lógicamente) que aún lo referencian pasan a Colaborador. */
CREATE OR ALTER PROCEDURE dbo.usp_Roles_Delete
    @RoleId  INT,
    @ActorId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

            DECLARE @Found BIT = 0, @Code VARCHAR(20);
            SELECT @Found = 1, @Code = Code FROM dbo.Roles WITH (UPDLOCK, ROWLOCK) WHERE RoleId = @RoleId;

            IF @Found = 0
                THROW 50404, N'El rol no existe.', 1;

            IF @Code IS NOT NULL
                THROW 50409, N'Los roles del sistema no se pueden eliminar.', 1;

            IF EXISTS (SELECT 1 FROM dbo.tvf_RolePermissionsNotHeld(@RoleId, @ActorId))
                THROW 50403, N'No puedes eliminar un rol con permisos que tú no tienes.', 1;

            IF EXISTS (SELECT 1 FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE RoleId = @RoleId AND DeletedAt IS NULL)
                THROW 50409, N'El rol tiene usuarios asignados. Cámbiales el rol antes de eliminarlo.', 1;

            UPDATE dbo.Users
            SET RoleId = (SELECT RoleId FROM dbo.Roles WHERE Code = 'COLLABORATOR')
            WHERE RoleId = @RoleId;

            DELETE FROM dbo.RolePermissions WHERE RoleId = @RoleId;
            DELETE FROM dbo.Roles WHERE RoleId = @RoleId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;
    END CATCH;
END;
GO

/* Áreas. @IncludeInactive = 0 para los selectores; 1 para la administración. */
CREATE OR ALTER PROCEDURE dbo.usp_Areas_List
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SELECT
            a.AreaId, a.Name, a.Description, a.IsActive, a.CreatedAt,
            (SELECT COUNT(*) FROM dbo.Users AS u WHERE u.AreaId = a.AreaId AND u.DeletedAt IS NULL) AS UsersCount,
            (SELECT COUNT(*)
             FROM dbo.Tasks AS t
             INNER JOIN dbo.TaskStatuses AS s ON s.StatusId = t.StatusId
             WHERE t.AreaId = a.AreaId AND s.IsFinal = 0) AS OpenTasksCount
        FROM dbo.Areas AS a
        WHERE @IncludeInactive = 1 OR a.IsActive = 1
        ORDER BY a.IsActive DESC, a.Name;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Areas_Save
    @AreaId      INT = NULL,
    @Name        NVARCHAR(160),
    @Description NVARCHAR(400) = NULL,
    @IsActive    BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SET @Name = TRIM(@Name);
        SET @Description = NULLIF(TRIM(@Description), N'');

        IF @Name IS NULL OR LEN(@Name) = 0 OR LEN(@Name) > 80
            THROW 50400, N'El nombre del área es obligatorio y admite máximo 80 caracteres.', 1;

        IF LEN(@Description) > 200
            THROW 50400, N'La descripción admite máximo 200 caracteres.', 1;

        IF @IsActive IS NULL
            THROW 50400, N'Debes indicar si el área queda activa o inactiva.', 1;

        IF @AreaId IS NULL
        BEGIN
            INSERT INTO dbo.Areas (Name, Description, IsActive)
            VALUES (@Name, @Description, @IsActive);

            SET @AreaId = CAST(SCOPE_IDENTITY() AS INT);
        END
        ELSE
        BEGIN
            UPDATE dbo.Areas
            SET Name = @Name,
                Description = @Description,
                IsActive = @IsActive
            WHERE AreaId = @AreaId;

            IF @@ROWCOUNT = 0
                THROW 50404, N'El área no existe.', 1;
        END;

        SELECT
            a.AreaId, a.Name, a.Description, a.IsActive, a.CreatedAt,
            (SELECT COUNT(*) FROM dbo.Users AS u WHERE u.AreaId = a.AreaId AND u.DeletedAt IS NULL) AS UsersCount,
            (SELECT COUNT(*)
             FROM dbo.Tasks AS t
             INNER JOIN dbo.TaskStatuses AS s ON s.StatusId = t.StatusId
             WHERE t.AreaId = a.AreaId AND s.IsFinal = 0) AS OpenTasksCount
        FROM dbo.Areas AS a
        WHERE a.AreaId = @AreaId;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627)
            THROW 50409, N'Ya existe un área con ese nombre.', 1;

        THROW;
    END CATCH;
END;
GO
