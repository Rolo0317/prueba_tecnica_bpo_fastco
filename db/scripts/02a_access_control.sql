/* =============================================================================
   02a_access_control.sql
   Control de acceso escalable: áreas, roles configurables y catálogo de permisos.

   - Permissions: catálogo FIJO (cada permiso lo hace cumplir el código y los SPs).
   - Roles: CONFIGURABLES por un administrador, como combinación de permisos.
       · ADMIN (Administrador): sistema, todos los permisos, no se edita ni se borra.
       · SUPERVISOR y COLLABORATOR: roles iniciales, editables.
   - Areas: cada usuario y cada tarea pertenecen (opcionalmente) a un área.

   Idempotente y con migración: en bases anteriores, la columna de texto Users.Role
   se convierte en Users.RoleId (ADMIN → Administrador, AGENT → Colaborador).
   ============================================================================= */
USE [$(DB_NAME)];
GO
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.Permissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Permissions
    (
        Code        VARCHAR(40)   NOT NULL CONSTRAINT PK_Permissions PRIMARY KEY,
        Name        NVARCHAR(80)  NOT NULL,
        Description NVARCHAR(250) NOT NULL,
        GroupName   NVARCHAR(40)  NOT NULL,
        SortOrder   TINYINT       NOT NULL
    );
END;
GO

IF OBJECT_ID(N'dbo.Roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Roles
    (
        RoleId      INT IDENTITY (1, 1) NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
        -- Código estable solo para los roles del sistema; los roles creados por el usuario no tienen.
        Code        VARCHAR(20)   NULL,
        Name        NVARCHAR(50)  NOT NULL CONSTRAINT UQ_Roles_Name UNIQUE,
        Description NVARCHAR(200) NULL,
        -- Rol protegido: no se editan sus permisos ni se borra (Administrador).
        IsLocked    BIT           NOT NULL CONSTRAINT DF_Roles_IsLocked DEFAULT (0),
        CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_Roles_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_Roles_Name_NotBlank CHECK (LEN(TRIM(Name)) > 0)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Roles_Code' AND object_id = OBJECT_ID(N'dbo.Roles'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_Roles_Code ON dbo.Roles (Code) WHERE Code IS NOT NULL;
GO

IF OBJECT_ID(N'dbo.RolePermissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RolePermissions
    (
        RoleId         INT         NOT NULL
            CONSTRAINT FK_RolePermissions_Role REFERENCES dbo.Roles (RoleId),
        PermissionCode VARCHAR(40) NOT NULL
            CONSTRAINT FK_RolePermissions_Permission REFERENCES dbo.Permissions (Code),
        CONSTRAINT PK_RolePermissions PRIMARY KEY (RoleId, PermissionCode)
    );
END;
GO

IF OBJECT_ID(N'dbo.Areas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Areas
    (
        AreaId      INT IDENTITY (1, 1) NOT NULL CONSTRAINT PK_Areas PRIMARY KEY,
        Name        NVARCHAR(80)  NOT NULL CONSTRAINT UQ_Areas_Name UNIQUE,
        Description NVARCHAR(200) NULL,
        IsActive    BIT           NOT NULL CONSTRAINT DF_Areas_IsActive DEFAULT (1),
        CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_Areas_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_Areas_Name_NotBlank CHECK (LEN(TRIM(Name)) > 0)
    );
END;
GO

/* ---------------------------------------------------------------------------
   Catálogo de permisos y roles del sistema (sincronizado en cada ejecución).
   --------------------------------------------------------------------------- */
BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @Permissions TABLE (Code VARCHAR(40) PRIMARY KEY, Name NVARCHAR(80), Description NVARCHAR(250), GroupName NVARCHAR(40), SortOrder TINYINT);
    INSERT INTO @Permissions VALUES
        ('TASKS_VIEW_ALL',  N'Ver todas las tareas',          N'Ve las tareas de todas las áreas.',                                        N'Tareas',         1),
        ('TASKS_VIEW_AREA', N'Ver las tareas de su área',     N'Ve las tareas de su área, además de las asignadas a él o creadas por él.',  N'Tareas',         2),
        ('TASKS_EDIT_ANY',  N'Editar tareas',                 N'Edita cualquier tarea que pueda ver. Sin este permiso, solo las que creó.', N'Tareas',         3),
        ('TASKS_ASSIGN',    N'Asignar tareas',                N'Asigna o reasigna responsables dentro de las tareas que puede ver.',       N'Tareas',         4),
        ('USERS_MANAGE',    N'Administrar usuarios',          N'Crea, edita, desactiva y elimina usuarios; restablece contraseñas.',       N'Administración', 5),
        ('AREAS_MANAGE',    N'Administrar áreas',             N'Crea, edita y desactiva áreas.',                                           N'Administración', 6),
        ('ROLES_MANAGE',    N'Administrar roles y permisos',  N'Crea y edita roles y define qué permisos tiene cada uno.',                  N'Administración', 7);

    UPDATE p
    SET Name = s.Name, Description = s.Description, GroupName = s.GroupName, SortOrder = s.SortOrder
    FROM dbo.Permissions AS p
    INNER JOIN @Permissions AS s ON s.Code = p.Code;

    INSERT INTO dbo.Permissions (Code, Name, Description, GroupName, SortOrder)
    SELECT s.Code, s.Name, s.Description, s.GroupName, s.SortOrder
    FROM @Permissions AS s
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Permissions AS p WHERE p.Code = s.Code);

    -- Roles del sistema: se crean si faltan. Solo al crearlos reciben sus permisos iniciales,
    -- así los cambios que haga un administrador en Supervisor o Colaborador se respetan.
    DECLARE @Created TABLE (RoleId INT, Code VARCHAR(20));

    INSERT INTO dbo.Roles (Code, Name, Description, IsLocked)
    OUTPUT inserted.RoleId, inserted.Code INTO @Created (RoleId, Code)
    SELECT s.Code, s.Name, s.Description, s.IsLocked
    FROM (VALUES
        ('ADMIN',        N'Administrador', N'Acceso total al sistema.',                          1),
        ('SUPERVISOR',   N'Supervisor',    N'Ve, edita y asigna las tareas de su área.',          0),
        ('COLLABORATOR', N'Colaborador',   N'Gestiona las tareas asignadas a él y las que crea.', 0)
    ) AS s (Code, Name, Description, IsLocked)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles AS r WHERE r.Code = s.Code);

    INSERT INTO dbo.RolePermissions (RoleId, PermissionCode)
    SELECT c.RoleId, p.Code
    FROM @Created AS c
    INNER JOIN dbo.Permissions AS p
        ON p.Code IN ('TASKS_VIEW_AREA', 'TASKS_EDIT_ANY', 'TASKS_ASSIGN')
    WHERE c.Code = 'SUPERVISOR';

    -- El Administrador siempre tiene TODOS los permisos (incluidos los que se agreguen después).
    DECLARE @AdminRoleId INT = (SELECT RoleId FROM dbo.Roles WHERE Code = 'ADMIN');
    INSERT INTO dbo.RolePermissions (RoleId, PermissionCode)
    SELECT @AdminRoleId, p.Code
    FROM dbo.Permissions AS p
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.RolePermissions AS rp WHERE rp.RoleId = @AdminRoleId AND rp.PermissionCode = p.Code
    );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

/* ---------------------------------------------------------------------------
   Columnas nuevas en usuarios y tareas.
   --------------------------------------------------------------------------- */
IF COL_LENGTH(N'dbo.Users', N'RoleId') IS NULL
    ALTER TABLE dbo.Users ADD RoleId INT NULL
        CONSTRAINT FK_Users_Role REFERENCES dbo.Roles (RoleId);
GO

IF COL_LENGTH(N'dbo.Users', N'AreaId') IS NULL
    ALTER TABLE dbo.Users ADD AreaId INT NULL
        CONSTRAINT FK_Users_Area REFERENCES dbo.Areas (AreaId);
GO

IF COL_LENGTH(N'dbo.Tasks', N'AreaId') IS NULL
    ALTER TABLE dbo.Tasks ADD AreaId INT NULL
        CONSTRAINT FK_Tasks_Area REFERENCES dbo.Areas (AreaId);
GO

/* Migración de la columna de texto Users.Role (versión anterior) a Users.RoleId.
   SQL dinámico de texto fijo: la columna Role puede no existir al compilar el lote. */
IF COL_LENGTH(N'dbo.Users', N'Role') IS NOT NULL
BEGIN
    EXEC sys.sp_executesql N'
        UPDATE u
        SET RoleId = r.RoleId
        FROM dbo.Users AS u
        INNER JOIN dbo.Roles AS r
            ON r.Code = CASE u.Role WHEN ''ADMIN'' THEN ''ADMIN'' ELSE ''COLLABORATOR'' END
        WHERE u.RoleId IS NULL;';

    IF OBJECT_ID(N'dbo.CK_Users_Role', N'C') IS NOT NULL
        ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_Role;
    IF OBJECT_ID(N'dbo.DF_Users_Role', N'D') IS NOT NULL
        ALTER TABLE dbo.Users DROP CONSTRAINT DF_Users_Role;

    ALTER TABLE dbo.Users DROP COLUMN Role;
END;
GO

/* Usuarios sin rol (bases anteriores a los roles, cuando todos tenían acceso completo). */
UPDATE dbo.Users
SET RoleId = (SELECT RoleId FROM dbo.Roles WHERE Code = 'ADMIN')
WHERE RoleId IS NULL;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Users') AND name = N'RoleId' AND is_nullable = 1
)
    ALTER TABLE dbo.Users ALTER COLUMN RoleId INT NOT NULL;
GO
