/* =============================================================================
   05_procedures_stats.sql
   Estadísticas de tareas para los indicadores del panel.
   ============================================================================= */
USE [$(DB_NAME)];
GO

/* @ViewerId: quién consulta. Se cuentan solo las tareas que puede ver según sus permisos
   (todas, las de su área, o las asignadas a él / creadas por él) — ver dbo.tvf_UserAccess.
   @AreaId (opcional): limita los indicadores a un área.
   Una fila por estado (incluidos los que tienen 0 tareas) y, por OUTPUT, el total,
   las vencidas, las que vencen hoy y las de prioridad alta abiertas.
   @Today llega desde la API con la fecha local del usuario: las fechas límite son
   fechas de calendario, no instantes UTC.
   El conteo por estado aprovecha IX_Tasks_StatusId_CreatedAt (agrupa por la primera
   columna de la clave sin ordenar ni leer la tabla completa). */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_Stats
    @Today            DATE = NULL,
    @ViewerId         INT,
    @AreaId           INT  = NULL,
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

        DECLARE @ViewAll BIT = 0, @ViewArea BIT = 0, @ViewerAreaId INT = NULL;
        SELECT @ViewAll = ViewAll, @ViewArea = ViewArea, @ViewerAreaId = AreaId
        FROM dbo.tvf_UserAccess(@ViewerId);

        -- A una tabla variable y no a variables directamente: así OPTION (RECOMPILE) simplifica
        -- el filtro de alcance y puede usar los índices por área (ver usp_Tasks_List).
        DECLARE @Totals TABLE (Total INT, Overdue INT, DueToday INT, HighPriorityOpen INT);

        INSERT INTO @Totals (Total, Overdue, DueToday, HighPriorityOpen)
        SELECT
            COUNT(*),
            ISNULL(SUM(CASE WHEN s.IsFinal = 0 AND t.DueDate < @Today THEN 1 ELSE 0 END), 0),
            ISNULL(SUM(CASE WHEN s.IsFinal = 0 AND t.DueDate = @Today THEN 1 ELSE 0 END), 0),
            ISNULL(SUM(CASE WHEN s.IsFinal = 0 AND t.Priority = 1 THEN 1 ELSE 0 END), 0)
        FROM dbo.Tasks AS t
        INNER JOIN dbo.TaskStatuses AS s ON s.StatusId = t.StatusId
        WHERE (@AreaId IS NULL OR t.AreaId = @AreaId)
          AND (@ViewAll = 1 OR (@ViewArea = 1 AND t.AreaId = @ViewerAreaId)
               OR t.AssignedTo = @ViewerId OR t.CreatedBy = @ViewerId)
        OPTION (RECOMPILE);

        SELECT @Total = Total, @Overdue = Overdue, @DueToday = DueToday,
               @HighPriorityOpen = HighPriorityOpen
        FROM @Totals;

        SELECT s.Code, s.Name, s.IsFinal, ISNULL(c.TaskCount, 0) AS TaskCount
        FROM dbo.TaskStatuses AS s
        LEFT JOIN (
            SELECT StatusId, COUNT(*) AS TaskCount
            FROM dbo.Tasks
            WHERE (@AreaId IS NULL OR AreaId = @AreaId)
              AND (@ViewAll = 1 OR (@ViewArea = 1 AND AreaId = @ViewerAreaId)
                   OR AssignedTo = @ViewerId OR CreatedBy = @ViewerId)
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
