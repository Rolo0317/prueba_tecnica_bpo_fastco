/* =============================================================================
   04_views.sql
   Vistas y funciones reutilizadas por los procedimientos (DRY):
   - tvf_UserAccess: permisos efectivos de un usuario (fuente única de autorización).
   - vw_TaskDetails: proyección única de una tarea.
   - vw_Users: proyección pública de un usuario (sin hash de contraseña).
   ============================================================================= */
USE [$(DB_NAME)];
GO

/* Permisos efectivos de un usuario ACTIVO y no eliminado (sin filas = sin acceso).
   Función en línea (inline TVF): SQL Server la expande dentro de cada consulta. */
CREATE OR ALTER FUNCTION dbo.tvf_UserAccess (@UserId INT)
RETURNS TABLE
AS
RETURN
SELECT
    u.UserId,
    u.RoleId,
    r.Name AS RoleName,
    r.Code AS RoleCode,
    u.AreaId,
    CAST(MAX(CASE WHEN rp.PermissionCode = 'TASKS_VIEW_ALL'  THEN 1 ELSE 0 END) AS BIT) AS ViewAll,
    CAST(MAX(CASE WHEN rp.PermissionCode = 'TASKS_VIEW_AREA' THEN 1 ELSE 0 END) AS BIT) AS ViewArea,
    CAST(MAX(CASE WHEN rp.PermissionCode = 'TASKS_EDIT_ANY'  THEN 1 ELSE 0 END) AS BIT) AS EditAny,
    CAST(MAX(CASE WHEN rp.PermissionCode = 'TASKS_ASSIGN'    THEN 1 ELSE 0 END) AS BIT) AS CanAssign,
    CAST(MAX(CASE WHEN rp.PermissionCode = 'USERS_MANAGE'    THEN 1 ELSE 0 END) AS BIT) AS ManageUsers,
    CAST(MAX(CASE WHEN rp.PermissionCode = 'AREAS_MANAGE'    THEN 1 ELSE 0 END) AS BIT) AS ManageAreas,
    CAST(MAX(CASE WHEN rp.PermissionCode = 'ROLES_MANAGE'    THEN 1 ELSE 0 END) AS BIT) AS ManageRoles
FROM dbo.Users AS u
INNER JOIN dbo.Roles AS r ON r.RoleId = u.RoleId
LEFT  JOIN dbo.RolePermissions AS rp ON rp.RoleId = u.RoleId
WHERE u.UserId = @UserId
  AND u.IsActive = 1
  AND u.DeletedAt IS NULL
GROUP BY u.UserId, u.RoleId, r.Name, r.Code, u.AreaId;
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
    t.AreaId,
    ar.Name      AS AreaName,
    n.NotesCount,
    t.CreatedAt,
    t.UpdatedAt
FROM dbo.Tasks AS t
INNER JOIN dbo.TaskStatuses AS s ON s.StatusId = t.StatusId
INNER JOIN dbo.Users        AS u ON u.UserId   = t.CreatedBy
LEFT  JOIN dbo.Users        AS a ON a.UserId   = t.AssignedTo
LEFT  JOIN dbo.Areas        AS ar ON ar.AreaId = t.AreaId
-- Conteo por tarea apoyado en IX_TaskNotes_TaskId_CreatedAt (Index Seek por TaskId).
OUTER APPLY (SELECT COUNT(*) AS NotesCount FROM dbo.TaskNotes WHERE TaskId = t.TaskId) AS n;
GO

/* Proyección pública de un usuario (sin el hash de la contraseña). */
CREATE OR ALTER VIEW dbo.vw_Users
AS
SELECT
    u.UserId, u.Username, u.FullName,
    u.RoleId, r.Name AS RoleName, r.Code AS RoleCode,
    u.AreaId, ar.Name AS AreaName,
    u.IsActive, u.CreatedAt, u.PasswordChangedAt
FROM dbo.Users AS u
INNER JOIN dbo.Roles AS r ON r.RoleId = u.RoleId
LEFT  JOIN dbo.Areas AS ar ON ar.AreaId = u.AreaId
WHERE u.DeletedAt IS NULL;
GO
