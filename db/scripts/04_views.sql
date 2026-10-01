/* =============================================================================
   04_views.sql
   Proyección única de una tarea con su estado y creador. La reutilizan todos los
   procedimientos que devuelven tareas, para que la forma del resultado sea la
   misma en todos (DRY).
   ============================================================================= */
USE [$(DB_NAME)];
GO

CREATE OR ALTER VIEW dbo.vw_TaskDetails
AS
SELECT
    t.TaskId,
    t.Title,
    t.Description,
    s.Code       AS StatusCode,
    s.Name       AS StatusName,
    t.Priority,
    t.DueDate,
    t.CreatedBy  AS CreatedById,
    u.FullName   AS CreatedByName,
    t.CreatedAt,
    t.UpdatedAt
FROM dbo.Tasks AS t
INNER JOIN dbo.TaskStatuses AS s ON s.StatusId = t.StatusId
INNER JOIN dbo.Users        AS u ON u.UserId   = t.CreatedBy;
GO
