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
    t.AssignedTo AS AssignedToId,
    a.FullName   AS AssignedToName,
    t.CreatedAt,
    t.UpdatedAt
FROM dbo.Tasks AS t
INNER JOIN dbo.TaskStatuses AS s ON s.StatusId = t.StatusId
INNER JOIN dbo.Users        AS u ON u.UserId   = t.CreatedBy
LEFT  JOIN dbo.Users        AS a ON a.UserId   = t.AssignedTo;
GO

/* Proyección pública de un usuario (sin el hash de la contraseña). */
CREATE OR ALTER VIEW dbo.vw_Users
AS
SELECT UserId, Username, FullName, Role, IsActive, CreatedAt, PasswordChangedAt
FROM dbo.Users
WHERE DeletedAt IS NULL;
GO
