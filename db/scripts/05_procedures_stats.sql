/* =============================================================================
   05_procedures_stats.sql
   Estadísticas de tareas para los indicadores del panel.
   ============================================================================= */
USE [$(DB_NAME)];
GO

/* @ViewerId: NULL = administrador (todas las tareas); un id = solo las tareas visibles
   para ese agente (asignadas a él o creadas por él).
   Una fila por estado (incluidos los que tienen 0 tareas) y, por OUTPUT, el total,
   las vencidas, las que vencen hoy y las de prioridad alta abiertas.
   @Today llega desde la API con la fecha local del usuario: las fechas límite son
   fechas de calendario, no instantes UTC.
   El conteo por estado aprovecha IX_Tasks_StatusId_CreatedAt (agrupa por la primera
   columna de la clave sin ordenar ni leer la tabla completa). */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_Stats
    @Today            DATE = NULL,
    @ViewerId         INT  = NULL,
    @Total            INT OUTPUT,
    @Overdue          INT OUTPUT,
    @DueToday         INT OUTPUT,
    @HighPriorityOpen INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SET @Today = ISNULL(@Today, CAST(SYSUTCDATETIME() AS DATE));

        SELECT
            @Total = COUNT(*),
            @Overdue = ISNULL(SUM(CASE WHEN s.IsFinal = 0 AND t.DueDate < @Today THEN 1 ELSE 0 END), 0),
            @DueToday = ISNULL(SUM(CASE WHEN s.IsFinal = 0 AND t.DueDate = @Today THEN 1 ELSE 0 END), 0),
            @HighPriorityOpen = ISNULL(SUM(CASE WHEN s.IsFinal = 0 AND t.Priority = 1 THEN 1 ELSE 0 END), 0)
        FROM dbo.Tasks AS t
        INNER JOIN dbo.TaskStatuses AS s ON s.StatusId = t.StatusId
        WHERE @ViewerId IS NULL OR t.AssignedTo = @ViewerId OR t.CreatedBy = @ViewerId
        OPTION (RECOMPILE);

        SELECT s.Code, s.Name, s.IsFinal, ISNULL(c.TaskCount, 0) AS TaskCount
        FROM dbo.TaskStatuses AS s
        LEFT JOIN (
            SELECT StatusId, COUNT(*) AS TaskCount
            FROM dbo.Tasks
            WHERE @ViewerId IS NULL OR AssignedTo = @ViewerId OR CreatedBy = @ViewerId
            GROUP BY StatusId
        ) AS c ON c.StatusId = s.StatusId
        ORDER BY s.SortOrder
        OPTION (RECOMPILE);
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO
