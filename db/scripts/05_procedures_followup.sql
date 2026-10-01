/* =============================================================================
   05_procedures_followup.sql
   Seguimiento de una tarea: avances (notas) y línea de tiempo unificada.
   Misma visibilidad que el resto de tareas: @ViewerId NULL = administrador;
   un id = agente (solo tareas asignadas a él o creadas por él). Tarea no visible → 50404.
   ============================================================================= */
USE [$(DB_NAME)];
GO

/* Registra un avance. Los avances son de solo inserción (no se editan ni se borran). */
CREATE OR ALTER PROCEDURE dbo.usp_TaskNotes_Create
    @TaskId    INT,
    @Body      NVARCHAR(2000),
    @CreatedBy INT,
    @ViewerId  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SET @Body = TRIM(@Body);

        IF @Body IS NULL OR LEN(@Body) = 0 OR LEN(@Body) > 1000
            THROW 50400, N'El avance es obligatorio y admite máximo 1000 caracteres.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @CreatedBy AND IsActive = 1 AND DeletedAt IS NULL)
            THROW 50400, N'El usuario no es válido.', 1;

        IF NOT EXISTS (
            SELECT 1 FROM dbo.Tasks
            WHERE TaskId = @TaskId
              AND (@ViewerId IS NULL OR AssignedTo = @ViewerId OR CreatedBy = @ViewerId)
        )
            THROW 50404, N'La tarea no existe.', 1;

        INSERT INTO dbo.TaskNotes (TaskId, Body, CreatedBy)
        VALUES (@TaskId, @Body, @CreatedBy);

        SELECT n.NoteId, n.Body, n.CreatedBy AS AuthorId, u.FullName AS AuthorName, n.CreatedAt
        FROM dbo.TaskNotes AS n
        INNER JOIN dbo.Users AS u ON u.UserId = n.CreatedBy
        WHERE n.NoteId = CAST(SCOPE_IDENTITY() AS BIGINT);
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* Línea de tiempo: creación, cambios de estado, cambios de responsable y avances,
   en orden cronológico. Cada fuente se lee con su índice (TaskId, fecha). */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_Timeline
    @TaskId   INT,
    @ViewerId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF NOT EXISTS (
            SELECT 1 FROM dbo.Tasks
            WHERE TaskId = @TaskId
              AND (@ViewerId IS NULL OR AssignedTo = @ViewerId OR CreatedBy = @ViewerId)
        )
            THROW 50404, N'La tarea no existe.', 1;

        SELECT Kind, EventId, OccurredAt, ActorId, ActorName,
               FromCode, FromName, ToCode, ToName, FromUserName, ToUserName, Body
        FROM (
            SELECT
                CASE WHEN h.FromStatusId IS NULL THEN 'CREATED' ELSE 'STATUS' END AS Kind,
                CASE WHEN h.FromStatusId IS NULL THEN 0 ELSE 2 END AS KindOrder,
                h.HistoryId AS EventId, h.ChangedAt AS OccurredAt,
                h.ChangedBy AS ActorId, actor.FullName AS ActorName,
                fromStatus.Code AS FromCode, fromStatus.Name AS FromName,
                toStatus.Code AS ToCode, toStatus.Name AS ToName,
                CAST(NULL AS NVARCHAR(100)) AS FromUserName, CAST(NULL AS NVARCHAR(100)) AS ToUserName,
                CAST(NULL AS NVARCHAR(1000)) AS Body
            FROM dbo.TaskStatusHistory AS h
            INNER JOIN dbo.Users AS actor ON actor.UserId = h.ChangedBy
            INNER JOIN dbo.TaskStatuses AS toStatus ON toStatus.StatusId = h.ToStatusId
            LEFT  JOIN dbo.TaskStatuses AS fromStatus ON fromStatus.StatusId = h.FromStatusId
            WHERE h.TaskId = @TaskId

            UNION ALL

            SELECT
                'ASSIGNMENT', 1,
                ah.HistoryId, ah.ChangedAt,
                ah.ChangedBy, actor.FullName,
                NULL, NULL, NULL, NULL,
                fromUser.FullName, toUser.FullName,
                NULL
            FROM dbo.TaskAssignmentHistory AS ah
            INNER JOIN dbo.Users AS actor ON actor.UserId = ah.ChangedBy
            LEFT  JOIN dbo.Users AS fromUser ON fromUser.UserId = ah.FromUserId
            LEFT  JOIN dbo.Users AS toUser ON toUser.UserId = ah.ToUserId
            WHERE ah.TaskId = @TaskId

            UNION ALL

            SELECT
                'NOTE', 3,
                n.NoteId, n.CreatedAt,
                n.CreatedBy, author.FullName,
                NULL, NULL, NULL, NULL,
                NULL, NULL,
                n.Body
            FROM dbo.TaskNotes AS n
            INNER JOIN dbo.Users AS author ON author.UserId = n.CreatedBy
            WHERE n.TaskId = @TaskId
        ) AS events
        ORDER BY OccurredAt, KindOrder, EventId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO
