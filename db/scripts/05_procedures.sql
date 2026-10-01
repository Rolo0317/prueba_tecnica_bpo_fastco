/* =============================================================================
   05_procedures.sql
   Procedimientos de tareas y del catálogo de estados (los de usuarios están en
   05_procedures_users.sql). La API solo ejecuta SPs con parámetros tipados
   (nunca SQL dinámico).

   Convenciones:
   - SET NOCOUNT ON + SET XACT_ABORT ON + TRY/CATCH en todos los procedimientos.
   - Transacción en las operaciones que escriben más de una tabla.
   - Errores de negocio con THROW y códigos que la API traduce a HTTP:
       50400 → 400 dato inválido · 50403 → 403 sin permiso ·
       50404 → 404 no encontrado · 50409 → 409 conflicto
   - Los parámetros de texto son más largos que la columna para poder validar la
     longitud explícitamente en vez de truncar en silencio.

   Visibilidad (también se aplica aquí, no solo en la API — defensa en profundidad):
   - @ViewerId NULL  → administrador: ve y gestiona todas las tareas.
   - @ViewerId = id  → agente: solo las tareas asignadas a él o creadas por él.
     Para una tarea que no puede ver se responde 50404 (no se revela que existe).
   ============================================================================= */
USE [$(DB_NAME)];
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
   Responsable válido: usuario activo y no eliminado. NULL = sin asignar.
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_ValidateAssignee
    @AssignedTo INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @AssignedTo IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM dbo.Users
            WHERE UserId = @AssignedTo AND IsActive = 1 AND DeletedAt IS NULL
        )
            THROW 50400, N'El responsable debe ser un usuario activo.', 1;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* -----------------------------------------------------------------------------
   Tareas — listado con filtro opcional por estado y paginación en SQL.
   @TotalCount (OUTPUT) devuelve el total de registros visibles para la paginación.

   Estrategia "deferred join": primero se paginan solo las claves usando los índices
   (IX_Tasks_StatusId_CreatedAt / IX_Tasks_CreatedAt para el administrador;
   IX_Tasks_AssignedTo_* e IX_Tasks_CreatedBy_* para un agente) y después se obtiene
   el detalle completo solo de las filas de la página.
   OPTION (RECOMPILE): el plan se ajusta a los parámetros reales (con o sin filtro,
   administrador o agente) en lugar de reutilizar un plan genérico.
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_List
    @StatusCode VARCHAR(20) = NULL,
    @Page       INT         = 1,
    @PageSize   INT         = 10,
    @ViewerId   INT         = NULL,
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
        WHERE (@StatusId IS NULL OR StatusId = @StatusId)
          AND (@ViewerId IS NULL OR AssignedTo = @ViewerId OR CreatedBy = @ViewerId)
        OPTION (RECOMPILE);

        WITH PageKeys AS
        (
            SELECT TaskId, CreatedAt
            FROM dbo.Tasks
            WHERE (@StatusId IS NULL OR StatusId = @StatusId)
              AND (@ViewerId IS NULL OR AssignedTo = @ViewerId OR CreatedBy = @ViewerId)
            ORDER BY CreatedAt DESC, TaskId DESC
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
        )
        SELECT
            d.TaskId, d.Title, d.Description, d.StatusCode, d.StatusName, d.Priority, d.DueDate,
            d.CreatedById, d.CreatedByName, d.AssignedToId, d.AssignedToName, d.CreatedAt, d.UpdatedAt
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
   Quién puede asignar a quién lo decide la API (un agente solo se asigna a sí mismo).
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_Create
    @Title       NVARCHAR(500),
    @Description NVARCHAR(2000) = NULL,
    @Priority    TINYINT        = 2,
    @DueDate     DATE           = NULL,
    @AssignedTo  INT            = NULL,
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

        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @CreatedBy AND IsActive = 1 AND DeletedAt IS NULL)
            THROW 50400, N'El usuario creador no es válido.', 1;

        EXEC dbo.usp_Tasks_ValidateAssignee @AssignedTo;

        DECLARE @PendingStatusId TINYINT = (SELECT StatusId FROM dbo.TaskStatuses WHERE Code = 'PENDING');
        DECLARE @TaskId INT;

        BEGIN TRANSACTION;

            INSERT INTO dbo.Tasks (Title, Description, StatusId, Priority, DueDate, CreatedBy, AssignedTo)
            VALUES (@Title, @Description, @PendingStatusId, @Priority, @DueDate, @CreatedBy, @AssignedTo);

            SET @TaskId = CAST(SCOPE_IDENTITY() AS INT);

            INSERT INTO dbo.TaskStatusHistory (TaskId, FromStatusId, ToStatusId, ChangedBy)
            VALUES (@TaskId, NULL, @PendingStatusId, @CreatedBy);

        COMMIT TRANSACTION;

        SELECT
            TaskId, Title, Description, StatusCode, StatusName, Priority, DueDate,
            CreatedById, CreatedByName, AssignedToId, AssignedToName, CreatedAt, UpdatedAt
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
   Tareas — edición de datos y responsable.
   @ActorId NULL = administrador (edita cualquier tarea y puede reasignar).
   Un agente solo edita las tareas que creó y no puede cambiar el responsable.
   @ChangeAssignee = 0 conserva el responsable actual (así no hay que reenviarlo);
   con 1, @AssignedTo es el nuevo responsable (NULL = sin asignar).
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_Update
    @TaskId      INT,
    @Title       NVARCHAR(500),
    @Description NVARCHAR(2000) = NULL,
    @Priority    TINYINT,
    @DueDate     DATE           = NULL,
    @AssignedTo     INT            = NULL,
    @ChangeAssignee BIT            = 0,
    @ActorId        INT            = NULL
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

        DECLARE @CreatedBy INT, @CurrentAssignee INT;

        BEGIN TRANSACTION;

            SELECT @CreatedBy = CreatedBy, @CurrentAssignee = AssignedTo
            FROM dbo.Tasks WITH (UPDLOCK, ROWLOCK)
            WHERE TaskId = @TaskId
              AND (@ActorId IS NULL OR AssignedTo = @ActorId OR CreatedBy = @ActorId);

            IF @CreatedBy IS NULL
                THROW 50404, N'La tarea no existe.', 1;

            IF @ActorId IS NOT NULL AND @CreatedBy <> @ActorId
                THROW 50403, N'Solo puedes editar las tareas que creaste.', 1;

            IF @ChangeAssignee = 0
                SET @AssignedTo = @CurrentAssignee;
            ELSE IF @ActorId IS NOT NULL AND ISNULL(@AssignedTo, -1) <> ISNULL(@CurrentAssignee, -1)
                THROW 50403, N'Solo un administrador puede cambiar el responsable.', 1;
            ELSE
                EXEC dbo.usp_Tasks_ValidateAssignee @AssignedTo;

            UPDATE dbo.Tasks
            SET Title = @Title,
                Description = @Description,
                Priority = @Priority,
                DueDate = @DueDate,
                AssignedTo = @AssignedTo,
                UpdatedAt = SYSUTCDATETIME()
            WHERE TaskId = @TaskId;

        COMMIT TRANSACTION;

        SELECT
            TaskId, Title, Description, StatusCode, StatusName, Priority, DueDate,
            CreatedById, CreatedByName, AssignedToId, AssignedToName, CreatedAt, UpdatedAt
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
   misma tarea a la vez), valida visibilidad, existencia y transición permitida,
   actualiza la tarea y registra el historial.
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_ChangeStatus
    @TaskId     INT,
    @StatusCode VARCHAR(20),
    @ChangedBy  INT,
    @ViewerId   INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        DECLARE @NewStatusId TINYINT = (SELECT StatusId FROM dbo.TaskStatuses WHERE Code = @StatusCode);

        IF @NewStatusId IS NULL
            THROW 50400, N'El estado indicado no existe.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @ChangedBy AND IsActive = 1 AND DeletedAt IS NULL)
            THROW 50400, N'El usuario no es válido.', 1;

        DECLARE @CurrentStatusId TINYINT;
        DECLARE @Message NVARCHAR(400);

        BEGIN TRANSACTION;

            SELECT @CurrentStatusId = StatusId
            FROM dbo.Tasks WITH (UPDLOCK, ROWLOCK)
            WHERE TaskId = @TaskId
              AND (@ViewerId IS NULL OR AssignedTo = @ViewerId OR CreatedBy = @ViewerId);

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
            TaskId, Title, Description, StatusCode, StatusName, Priority, DueDate,
            CreatedById, CreatedByName, AssignedToId, AssignedToName, CreatedAt, UpdatedAt
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
