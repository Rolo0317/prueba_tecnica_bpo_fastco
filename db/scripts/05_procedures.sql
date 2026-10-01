/* =============================================================================
   05_procedures.sql
   Toda la lógica de datos de la aplicación. La API solo ejecuta estos SPs con
   parámetros tipados (nunca SQL dinámico).

   Convenciones:
   - SET NOCOUNT ON + SET XACT_ABORT ON + TRY/CATCH en todos los procedimientos.
   - Transacción en las operaciones que escriben más de una tabla.
   - Errores de negocio con THROW y códigos que la API traduce a HTTP:
       50400 → 400 dato inválido · 50404 → 404 no encontrado · 50409 → 409 conflicto
   - Los parámetros de texto son más largos que la columna para poder validar la
     longitud explícitamente en vez de truncar en silencio.
   ============================================================================= */
USE [$(DB_NAME)];
GO

/* -----------------------------------------------------------------------------
   Usuarios
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Users_GetByUsername
    @Username NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SELECT UserId, Username, PasswordHash, FullName
        FROM dbo.Users
        WHERE Username = TRIM(@Username)
          AND IsActive = 1;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Users_Create
    @Username     NVARCHAR(100),
    @PasswordHash VARCHAR(200),
    @FullName     NVARCHAR(200)
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

        IF EXISTS (SELECT 1 FROM dbo.Users WHERE Username = @Username)
            THROW 50409, N'El nombre de usuario ya existe.', 1;

        INSERT INTO dbo.Users (Username, PasswordHash, FullName)
        VALUES (@Username, @PasswordHash, @FullName);

        SELECT UserId, Username, FullName
        FROM dbo.Users
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

/* -----------------------------------------------------------------------------
   Catálogo de estados
   Devuelve cada estado con sus transiciones permitidas (códigos separados por
   coma), para que el frontend solo ofrezca cambios válidos sin duplicar la regla.
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_TaskStatuses_List
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SELECT
            s.Code,
            s.Name,
            s.IsFinal,
            s.SortOrder,
            AllowedTransitions = ISNULL((
                SELECT STRING_AGG(target.Code, ',') WITHIN GROUP (ORDER BY target.SortOrder)
                FROM dbo.TaskStatusTransitions AS tr
                INNER JOIN dbo.TaskStatuses AS target ON target.StatusId = tr.ToStatusId
                WHERE tr.FromStatusId = s.StatusId
            ), '')
        FROM dbo.TaskStatuses AS s
        ORDER BY s.SortOrder;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* -----------------------------------------------------------------------------
   Tareas — listado con filtro opcional por estado y paginación en SQL.
   @TotalCount (OUTPUT) devuelve el total de registros del filtro para la paginación.

   Estrategia "deferred join": primero se paginan solo las claves usando el índice
   IX_Tasks_StatusId_CreatedAt (o IX_Tasks_CreatedAt si no hay filtro); después se
   obtiene el detalle completo solo de las filas de la página.
   OPTION (RECOMPILE): el plan se ajusta a si hay filtro o no, evitando que un plan
   cacheado para "todas" se reutilice para un estado concreto (y viceversa).
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_List
    @StatusCode VARCHAR(20) = NULL,
    @Page       INT         = 1,
    @PageSize   INT         = 10,
    @TotalCount INT         OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @Page IS NULL OR @Page < 1
            THROW 50400, N'La página debe ser un número mayor o igual a 1.', 1;

        IF @PageSize IS NULL OR @PageSize NOT BETWEEN 1 AND 100
            THROW 50400, N'El tamaño de página debe estar entre 1 y 100.', 1;

        DECLARE @StatusId TINYINT = NULL;

        IF @StatusCode IS NOT NULL
        BEGIN
            SELECT @StatusId = StatusId
            FROM dbo.TaskStatuses
            WHERE Code = @StatusCode;

            IF @StatusId IS NULL
                THROW 50400, N'El estado indicado no existe.', 1;
        END;

        DECLARE @Offset BIGINT = CAST(@Page - 1 AS BIGINT) * @PageSize;

        SELECT @TotalCount = COUNT(*)
        FROM dbo.Tasks
        WHERE @StatusId IS NULL OR StatusId = @StatusId
        OPTION (RECOMPILE);

        WITH PageKeys AS
        (
            SELECT TaskId, CreatedAt
            FROM dbo.Tasks
            WHERE @StatusId IS NULL OR StatusId = @StatusId
            ORDER BY CreatedAt DESC, TaskId DESC
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
        )
        SELECT
            d.TaskId, d.Title, d.Description, d.StatusCode, d.StatusName, d.Priority,
            d.DueDate, d.CreatedById, d.CreatedByName, d.CreatedAt, d.UpdatedAt
        FROM PageKeys AS k
        INNER JOIN dbo.vw_TaskDetails AS d ON d.TaskId = k.TaskId
        ORDER BY k.CreatedAt DESC, k.TaskId DESC
        OPTION (RECOMPILE);
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* -----------------------------------------------------------------------------
   Tareas — creación. La tarea nace en PENDING y se registra en el historial
   dentro de la misma transacción (o se guardan ambas cosas, o ninguna).
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_Create
    @Title       NVARCHAR(500),
    @Description NVARCHAR(2000) = NULL,
    @Priority    TINYINT        = 2,
    @DueDate     DATE           = NULL,
    @CreatedBy   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SET @Title = TRIM(@Title);
        SET @Description = NULLIF(TRIM(@Description), N'');

        IF @Title IS NULL OR LEN(@Title) = 0 OR LEN(@Title) > 150
            THROW 50400, N'El título es obligatorio y admite máximo 150 caracteres.', 1;

        IF LEN(@Description) > 1000
            THROW 50400, N'La descripción admite máximo 1000 caracteres.', 1;

        IF @Priority IS NULL OR @Priority NOT BETWEEN 1 AND 3
            THROW 50400, N'La prioridad debe ser 1 (alta), 2 (media) o 3 (baja).', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @CreatedBy AND IsActive = 1)
            THROW 50400, N'El usuario creador no es válido.', 1;

        DECLARE @PendingStatusId TINYINT = (SELECT StatusId FROM dbo.TaskStatuses WHERE Code = 'PENDING');
        DECLARE @TaskId INT;

        BEGIN TRANSACTION;

            INSERT INTO dbo.Tasks (Title, Description, StatusId, Priority, DueDate, CreatedBy)
            VALUES (@Title, @Description, @PendingStatusId, @Priority, @DueDate, @CreatedBy);

            SET @TaskId = CAST(SCOPE_IDENTITY() AS INT);

            INSERT INTO dbo.TaskStatusHistory (TaskId, FromStatusId, ToStatusId, ChangedBy)
            VALUES (@TaskId, NULL, @PendingStatusId, @CreatedBy);

        COMMIT TRANSACTION;

        SELECT
            TaskId, Title, Description, StatusCode, StatusName, Priority,
            DueDate, CreatedById, CreatedByName, CreatedAt, UpdatedAt
        FROM dbo.vw_TaskDetails
        WHERE TaskId = @TaskId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;
    END CATCH;
END;
GO

/* -----------------------------------------------------------------------------
   Tareas — cambio de estado.
   En una transacción: bloquea la fila (UPDLOCK evita que dos agentes cambien la
   misma tarea a la vez), valida existencia y transición permitida, actualiza la
   tarea y registra el historial.
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_ChangeStatus
    @TaskId     INT,
    @StatusCode VARCHAR(20),
    @ChangedBy  INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        DECLARE @NewStatusId TINYINT = (SELECT StatusId FROM dbo.TaskStatuses WHERE Code = @StatusCode);

        IF @NewStatusId IS NULL
            THROW 50400, N'El estado indicado no existe.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @ChangedBy AND IsActive = 1)
            THROW 50400, N'El usuario no es válido.', 1;

        DECLARE @CurrentStatusId TINYINT;
        DECLARE @Message NVARCHAR(400);

        BEGIN TRANSACTION;

            SELECT @CurrentStatusId = StatusId
            FROM dbo.Tasks WITH (UPDLOCK, ROWLOCK)
            WHERE TaskId = @TaskId;

            IF @CurrentStatusId IS NULL
                THROW 50404, N'La tarea no existe.', 1;

            IF @CurrentStatusId = @NewStatusId
                THROW 50409, N'La tarea ya se encuentra en ese estado.', 1;

            IF NOT EXISTS (
                SELECT 1 FROM dbo.TaskStatusTransitions
                WHERE FromStatusId = @CurrentStatusId AND ToStatusId = @NewStatusId
            )
            BEGIN
                SELECT @Message = CONCAT(N'No se permite cambiar una tarea de "', s.Name, N'" a "', n.Name, N'".')
                FROM dbo.TaskStatuses AS s
                CROSS JOIN dbo.TaskStatuses AS n
                WHERE s.StatusId = @CurrentStatusId AND n.StatusId = @NewStatusId;

                THROW 50409, @Message, 1;
            END;

            UPDATE dbo.Tasks
            SET StatusId = @NewStatusId,
                UpdatedAt = SYSUTCDATETIME()
            WHERE TaskId = @TaskId;

            INSERT INTO dbo.TaskStatusHistory (TaskId, FromStatusId, ToStatusId, ChangedBy)
            VALUES (@TaskId, @CurrentStatusId, @NewStatusId, @ChangedBy);

        COMMIT TRANSACTION;

        SELECT
            TaskId, Title, Description, StatusCode, StatusName, Priority,
            DueDate, CreatedById, CreatedByName, CreatedAt, UpdatedAt
        FROM dbo.vw_TaskDetails
        WHERE TaskId = @TaskId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;
    END CATCH;
END;
GO
