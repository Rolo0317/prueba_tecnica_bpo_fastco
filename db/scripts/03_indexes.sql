/* =============================================================================
   03_indexes.sql
   Índices alineados con las consultas reales de la aplicación.
   ============================================================================= */
USE [$(DB_NAME)];
GO
SET NOCOUNT ON;
GO

/* -----------------------------------------------------------------------------
   IX_Tasks_StatusId_CreatedAt  (índice principal de la aplicación)

   Consulta que optimiza: el listado filtrado por estado de usp_Tasks_List
   (pantalla principal, la consulta más frecuente):

       SELECT TaskId, CreatedAt
       FROM dbo.Tasks
       WHERE StatusId = @StatusId
       ORDER BY CreatedAt DESC, TaskId DESC
       OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;

   - StatusId primero: el filtro de igualdad permite un Index Seek directo
     al rango del estado pedido.
   - CreatedAt DESC, TaskId DESC: coinciden exactamente con el ORDER BY, así que
     las filas ya salen ordenadas del índice (sin operador Sort) y la paginación
     se detiene al completar la página.
   - Es cubriente para esa consulta (todas las columnas están en la clave), y el
     procedimiento solo busca el detalle completo de las filas de la página
     ("deferred join"), no de todas las filas saltadas por el OFFSET.
   - INCLUDE (AreaId, AssignedTo, CreatedBy): las columnas del filtro de visibilidad
     (supervisor: "su área, o asignadas a él, o creadas por él"). Así el filtro se evalúa
     dentro del índice, sin ir a la tabla por cada fila. Medido con 200 000 tareas:
     supervisor + estado pasó de 2 135 a ~200 lecturas lógicas en el conteo.

   Verificación: SET STATISTICS IO ON + plan de ejecución real (Ctrl+M en SSMS)
   → debe aparecer "Index Seek (NonClustered) [IX_Tasks_StatusId_CreatedAt]"
   sin Sort. Uso acumulado: sys.dm_db_index_usage_stats (columna user_seeks).
   ----------------------------------------------------------------------------- */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Tasks_StatusId_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Tasks')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Tasks_StatusId_CreatedAt
        ON dbo.Tasks (StatusId, CreatedAt DESC, TaskId DESC)
        INCLUDE (AreaId, AssignedTo, CreatedBy);
END
ELSE IF NOT EXISTS (
    -- Bases anteriores: el índice existe sin las columnas incluidas → se reconstruye.
    SELECT 1
    FROM sys.index_columns AS ic
    INNER JOIN sys.indexes AS i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    WHERE i.name = N'IX_Tasks_StatusId_CreatedAt' AND i.object_id = OBJECT_ID(N'dbo.Tasks')
      AND ic.is_included_column = 1 AND COL_NAME(ic.object_id, ic.column_id) = N'AreaId'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Tasks_StatusId_CreatedAt
        ON dbo.Tasks (StatusId, CreatedAt DESC, TaskId DESC)
        INCLUDE (AreaId, AssignedTo, CreatedBy)
        WITH (DROP_EXISTING = ON);
END;
GO

/* IX_Tasks_CreatedAt: el mismo listado sin filtro de estado ("Todas").
   Evita recorrer la tabla completa y ordenarla en cada página. */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Tasks_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Tasks')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Tasks_CreatedAt
        ON dbo.Tasks (CreatedAt DESC, TaskId DESC);
END;
GO

/* Visibilidad de un agente: solo ve las tareas asignadas a él y las que creó.
   Un índice por cada condición (misma forma que el principal: filtro + orden de la página)
   permite a SQL Server resolver el OR con dos Index Seek combinados en lugar de un scan. */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Tasks_AssignedTo_StatusId_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Tasks')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Tasks_AssignedTo_StatusId_CreatedAt
        ON dbo.Tasks (AssignedTo, StatusId, CreatedAt DESC, TaskId DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Tasks_CreatedBy_StatusId_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Tasks')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Tasks_CreatedBy_StatusId_CreatedAt
        ON dbo.Tasks (CreatedBy, StatusId, CreatedAt DESC, TaskId DESC);
END;
GO

/* IX_TaskStatusHistory_TaskId_ChangedAt: soporta la FK hacia Tasks y la consulta
   del historial de una tarea en orden cronológico (auditoría). */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_TaskStatusHistory_TaskId_ChangedAt' AND object_id = OBJECT_ID(N'dbo.TaskStatusHistory')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_TaskStatusHistory_TaskId_ChangedAt
        ON dbo.TaskStatusHistory (TaskId, ChangedAt);
END;
GO

/* IX_TaskStatusHistory_ToStatusId_ChangedAt: "desempeño por área" (usp_Tasks_StatsByArea) busca los
   cierres de un periodo: Index Seek por estado destino y rango de fechas, sin recorrer el historial. */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_TaskStatusHistory_ToStatusId_ChangedAt' AND object_id = OBJECT_ID(N'dbo.TaskStatusHistory')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_TaskStatusHistory_ToStatusId_ChangedAt
        ON dbo.TaskStatusHistory (ToStatusId, ChangedAt)
        INCLUDE (TaskId);
END;
GO

/* Línea de tiempo de una tarea: avances y reasignaciones en orden cronológico.
   También soportan las FK hacia Tasks. */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_TaskNotes_TaskId_CreatedAt' AND object_id = OBJECT_ID(N'dbo.TaskNotes')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_TaskNotes_TaskId_CreatedAt
        ON dbo.TaskNotes (TaskId, CreatedAt);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_TaskAssignmentHistory_TaskId_ChangedAt' AND object_id = OBJECT_ID(N'dbo.TaskAssignmentHistory')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_TaskAssignmentHistory_TaskId_ChangedAt
        ON dbo.TaskAssignmentHistory (TaskId, ChangedAt);
END;
GO

/* Visibilidad por área (supervisores) y filtro por área: misma forma que el índice principal. */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Tasks_AreaId_StatusId_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Tasks')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Tasks_AreaId_StatusId_CreatedAt
        ON dbo.Tasks (AreaId, StatusId, CreatedAt DESC, TaskId DESC);
END;
GO

/* Soportan las FK y las reglas "último administrador" y "usuarios de mi área". */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Users_RoleId' AND object_id = OBJECT_ID(N'dbo.Users'))
    CREATE NONCLUSTERED INDEX IX_Users_RoleId ON dbo.Users (RoleId) INCLUDE (IsActive, DeletedAt);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Users_AreaId' AND object_id = OBJECT_ID(N'dbo.Users'))
    CREATE NONCLUSTERED INDEX IX_Users_AreaId ON dbo.Users (AreaId) INCLUDE (IsActive, DeletedAt);
GO
