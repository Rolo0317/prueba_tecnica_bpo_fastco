/* =============================================================================
   05_procedures.sql
   Procedimientos de tareas y del catálogo de estados (usuarios, accesos,
   indicadores y seguimiento están en los demás 05_procedures_*.sql).
   La API solo ejecuta SPs con parámetros tipados (nunca SQL dinámico).

   Convenciones:
   - SET NOCOUNT ON + SET XACT_ABORT ON + TRY/CATCH en todos los procedimientos.
   - Transacción en las operaciones que escriben más de una tabla.
   - Errores de negocio con THROW y códigos que la API traduce a HTTP:
       50400 → 400 dato inválido · 50403 → 403 sin permiso ·
       50404 → 404 no encontrado · 50409 → 409 conflicto
   - Los parámetros de texto son más largos que la columna para poder validar la
     longitud explícitamente en vez de truncar en silencio.

   Autorización (defensa en profundidad): cada SP recibe QUIÉN actúa y calcula su
   alcance con dbo.tvf_UserAccess (permisos del rol y área del usuario):
     visible = TASKS_VIEW_ALL
             o (TASKS_VIEW_AREA y la tarea es de su área)
             o la tarea está asignada a él o la creó él.
   Una tarea no visible responde 50404 (no se revela que existe).
   ============================================================================= */
USE [$(DB_NAME)];
GO

/* -----------------------------------------------------------------------------
   Catálogo de estados con sus transiciones permitidas (códigos separados por coma),
   para que el frontend solo ofrezca cambios válidos sin duplicar la regla.
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
   Responsable válido para quien asigna: usuario activo y, si quien asigna no ve todas
   las áreas, de su misma área (o él mismo). NULL = sin asignar.
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_ValidateAssignee
    @AssignedTo INT,
    @ActorId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @AssignedTo IS NULL RETURN;

        DECLARE @AssigneeAreaId INT, @AssigneeActive BIT = 0;
        SELECT @AssigneeAreaId = AreaId, @AssigneeActive = 1
        FROM dbo.Users
        WHERE UserId = @AssignedTo AND IsActive = 1 AND DeletedAt IS NULL;

        IF @AssigneeActive = 0
            THROW 50400, N'El responsable debe ser un usuario activo.', 1;

        DECLARE @ViewAll BIT = 0, @ActorAreaId INT = NULL;
        SELECT @ViewAll = ViewAll, @ActorAreaId = AreaId FROM dbo.tvf_UserAccess(@ActorId);

        IF @ViewAll = 0
           AND @AssignedTo <> @ActorId
           AND (@ActorAreaId IS NULL OR ISNULL(@AssigneeAreaId, -1) <> @ActorAreaId)
            THROW 50403, N'Solo puedes asignar tareas a personas de tu área.', 1;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* -----------------------------------------------------------------------------
   Tareas — listado con filtros opcionales (estado y área) y paginación en SQL.
   @TotalCount (OUTPUT) devuelve el total de registros visibles.

   "Deferred join": primero se paginan solo las claves con el índice que corresponda
   (estado, área, responsable o creador) y después se trae el detalle de la página.
   OPTION (RECOMPILE): con los permisos ya resueltos en variables, el optimizador
   descarta las ramas que no aplican y elige el índice adecuado para cada caso.
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_List
    @StatusCode VARCHAR(20) = NULL,
    @AreaId     INT         = NULL,
    @Page       INT         = 1,
    @PageSize   INT         = 10,
    @ViewerId   INT,
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
            SELECT @StatusId = StatusId FROM dbo.TaskStatuses WHERE Code = @StatusCode;
            IF @StatusId IS NULL
                THROW 50400, N'El estado indicado no existe.', 1;
        END;

        DECLARE @ViewAll BIT = 0, @ViewArea BIT = 0, @ViewerAreaId INT = NULL;
        SELECT @ViewAll = ViewAll, @ViewArea = ViewArea, @ViewerAreaId = AreaId
        FROM dbo.tvf_UserAccess(@ViewerId);

        DECLARE @Offset BIGINT = CAST(@Page - 1 AS BIGINT) * @PageSize;

        -- El conteo va a una tabla variable y no a "SELECT @TotalCount = COUNT(*)": SQL Server
        -- no aplica la optimización de OPTION (RECOMPILE) a sentencias que asignan variables,
        -- y sin ella el filtro no se simplifica y el conteo recorre toda la tabla (verificado
        -- con el plan real: Clustered Index Scan → Index Seek sobre IX_Tasks_StatusId_CreatedAt).
        DECLARE @Count TABLE (Total INT NOT NULL);

        INSERT INTO @Count (Total)
        SELECT COUNT(*)
        FROM dbo.Tasks
        WHERE (@StatusId IS NULL OR StatusId = @StatusId)
          AND (@AreaId IS NULL OR AreaId = @AreaId)
          AND (@ViewAll = 1 OR (@ViewArea = 1 AND AreaId = @ViewerAreaId)
               OR AssignedTo = @ViewerId OR CreatedBy = @ViewerId)
        OPTION (RECOMPILE);

        SELECT @TotalCount = Total FROM @Count;

        WITH PageKeys AS
        (
            SELECT TaskId, CreatedAt
            FROM dbo.Tasks
            WHERE (@StatusId IS NULL OR StatusId = @StatusId)
              AND (@AreaId IS NULL OR AreaId = @AreaId)
              AND (@ViewAll = 1 OR (@ViewArea = 1 AND AreaId = @ViewerAreaId)
                   OR AssignedTo = @ViewerId OR CreatedBy = @ViewerId)
            ORDER BY CreatedAt DESC, TaskId DESC
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
        )
        SELECT
            d.TaskId, d.Title, d.Description, d.StatusCode, d.StatusName, d.Priority, d.DueDate,
            d.CreatedById, d.CreatedByName, d.AssignedToId, d.AssignedToName, d.AreaId, d.AreaName,
            d.NotesCount, d.CreatedAt, d.UpdatedAt
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
   Tareas — creación. Nace en PENDING; el historial de estado y de responsable se
   registran en la misma transacción.
   - Sin TASKS_ASSIGN solo puede asignársela a sí mismo.
   - Sin TASKS_VIEW_ALL la tarea queda en el área de quien la crea.
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_Create
    @Title       NVARCHAR(500),
    @Description NVARCHAR(2000) = NULL,
    @Priority    TINYINT        = 2,
    @DueDate     DATE           = NULL,
    @AssignedTo  INT            = NULL,
    @AreaId      INT            = NULL,
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

        DECLARE @Found BIT = 0, @ViewAll BIT = 0, @CanAssign BIT = 0, @CreatorAreaId INT = NULL;
        SELECT @Found = 1, @ViewAll = ViewAll, @CanAssign = CanAssign, @CreatorAreaId = AreaId
        FROM dbo.tvf_UserAccess(@CreatedBy);

        IF @Found = 0
            THROW 50400, N'El usuario creador no es válido.', 1;

        IF @CanAssign = 0 AND @AssignedTo IS NOT NULL AND @AssignedTo <> @CreatedBy
            THROW 50403, N'No tienes permiso para asignar tareas a otras personas.', 1;

        IF @ViewAll = 0
        BEGIN
            IF @AreaId IS NOT NULL AND ISNULL(@CreatorAreaId, -1) <> @AreaId
                THROW 50403, N'Solo puedes crear tareas en tu área.', 1;
            SET @AreaId = @CreatorAreaId;
        END
        ELSE IF @AreaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Areas WHERE AreaId = @AreaId AND IsActive = 1)
            THROW 50400, N'El área indicada no existe o está inactiva.', 1;

        EXEC dbo.usp_Tasks_ValidateAssignee @AssignedTo, @CreatedBy;

        DECLARE @PendingStatusId TINYINT = (SELECT StatusId FROM dbo.TaskStatuses WHERE Code = 'PENDING');
        DECLARE @TaskId INT;

        BEGIN TRANSACTION;

            INSERT INTO dbo.Tasks (Title, Description, StatusId, Priority, DueDate, CreatedBy, AssignedTo, AreaId)
            VALUES (@Title, @Description, @PendingStatusId, @Priority, @DueDate, @CreatedBy, @AssignedTo, @AreaId);

            SET @TaskId = CAST(SCOPE_IDENTITY() AS INT);

            INSERT INTO dbo.TaskStatusHistory (TaskId, FromStatusId, ToStatusId, ChangedBy)
            VALUES (@TaskId, NULL, @PendingStatusId, @CreatedBy);

            IF @AssignedTo IS NOT NULL
                INSERT INTO dbo.TaskAssignmentHistory (TaskId, FromUserId, ToUserId, ChangedBy)
                VALUES (@TaskId, NULL, @AssignedTo, @CreatedBy);

        COMMIT TRANSACTION;

        SELECT
            TaskId, Title, Description, StatusCode, StatusName, Priority, DueDate,
            CreatedById, CreatedByName, AssignedToId, AssignedToName, AreaId, AreaName,
            NotesCount, CreatedAt, UpdatedAt
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
   Tareas — edición de datos, responsable y área.
   - Editar: con TASKS_EDIT_ANY cualquier tarea visible; sin él, solo las que creó.
   - Responsable (@ChangeAssignee = 1): requiere TASKS_ASSIGN; 0 = conservar el actual.
   - Área (@ChangeArea = 1): requiere TASKS_VIEW_ALL; 0 = conservar la actual.
   ----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_Update
    @TaskId         INT,
    @Title          NVARCHAR(500),
    @Description    NVARCHAR(2000) = NULL,
    @Priority       TINYINT,
    @DueDate        DATE           = NULL,
    @AssignedTo     INT            = NULL,
    @ChangeAssignee BIT            = 0,
    @AreaId         INT            = NULL,
    @ChangeArea     BIT            = 0,
    @ActorId        INT
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

        DECLARE @ViewAll BIT = 0, @ViewArea BIT = 0, @EditAny BIT = 0, @CanAssign BIT = 0, @ActorAreaId INT = NULL;
        SELECT @ViewAll = ViewAll, @ViewArea = ViewArea, @EditAny = EditAny, @CanAssign = CanAssign, @ActorAreaId = AreaId
        FROM dbo.tvf_UserAccess(@ActorId);

        DECLARE @CreatedBy INT, @CurrentAssignee INT, @CurrentAreaId INT;

        BEGIN TRANSACTION;

            SELECT @CreatedBy = CreatedBy, @CurrentAssignee = AssignedTo, @CurrentAreaId = AreaId
            FROM dbo.Tasks WITH (UPDLOCK, ROWLOCK)
            WHERE TaskId = @TaskId
              AND (@ViewAll = 1 OR (@ViewArea = 1 AND AreaId = @ActorAreaId)
                   OR AssignedTo = @ActorId OR CreatedBy = @ActorId);

            IF @CreatedBy IS NULL
                THROW 50404, N'La tarea no existe.', 1;

            IF @EditAny = 0 AND @CreatedBy <> @ActorId
                THROW 50403, N'Solo puedes editar las tareas que creaste.', 1;

            IF @ChangeAssignee = 0
                SET @AssignedTo = @CurrentAssignee;
            ELSE IF ISNULL(@AssignedTo, -1) <> ISNULL(@CurrentAssignee, -1)
            BEGIN
                IF @CanAssign = 0
                    THROW 50403, N'No tienes permiso para cambiar el responsable.', 1;
                EXEC dbo.usp_Tasks_ValidateAssignee @AssignedTo, @ActorId;
            END;

            IF @ChangeArea = 0
                SET @AreaId = @CurrentAreaId;
            ELSE IF ISNULL(@AreaId, -1) <> ISNULL(@CurrentAreaId, -1)
            BEGIN
                IF @ViewAll = 0
                    THROW 50403, N'No tienes permiso para mover tareas entre áreas.', 1;
                IF @AreaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Areas WHERE AreaId = @AreaId AND IsActive = 1)
                    THROW 50400, N'El área indicada no existe o está inactiva.', 1;
            END;

            UPDATE dbo.Tasks
            SET Title = @Title,
                Description = @Description,
                Priority = @Priority,
                DueDate = @DueDate,
                AssignedTo = @AssignedTo,
                AreaId = @AreaId,
                UpdatedAt = SYSUTCDATETIME()
            WHERE TaskId = @TaskId;

            IF ISNULL(@AssignedTo, -1) <> ISNULL(@CurrentAssignee, -1)
                INSERT INTO dbo.TaskAssignmentHistory (TaskId, FromUserId, ToUserId, ChangedBy)
                VALUES (@TaskId, @CurrentAssignee, @AssignedTo, @ActorId);

        COMMIT TRANSACTION;

        SELECT
            TaskId, Title, Description, StatusCode, StatusName, Priority, DueDate,
            CreatedById, CreatedByName, AssignedToId, AssignedToName, AreaId, AreaName,
            NotesCount, CreatedAt, UpdatedAt
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
   Tareas — cambio de estado (cualquier tarea visible para quien la cambia).
   En una transacción: bloquea la fila (UPDLOCK evita que dos personas cambien la
   misma tarea a la vez), valida transición permitida, actualiza e historial.
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

        DECLARE @Found BIT = 0, @ViewAll BIT = 0, @ViewArea BIT = 0, @ActorAreaId INT = NULL;
        SELECT @Found = 1, @ViewAll = ViewAll, @ViewArea = ViewArea, @ActorAreaId = AreaId
        FROM dbo.tvf_UserAccess(@ChangedBy);

        IF @Found = 0
            THROW 50400, N'El usuario no es válido.', 1;

        DECLARE @CurrentStatusId TINYINT;
        DECLARE @Message NVARCHAR(400);

        BEGIN TRANSACTION;

            SELECT @CurrentStatusId = StatusId
            FROM dbo.Tasks WITH (UPDLOCK, ROWLOCK)
            WHERE TaskId = @TaskId
              AND (@ViewAll = 1 OR (@ViewArea = 1 AND AreaId = @ActorAreaId)
                   OR AssignedTo = @ChangedBy OR CreatedBy = @ChangedBy);

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
            CreatedById, CreatedByName, AssignedToId, AssignedToName, AreaId, AreaName,
            NotesCount, CreatedAt, UpdatedAt
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
