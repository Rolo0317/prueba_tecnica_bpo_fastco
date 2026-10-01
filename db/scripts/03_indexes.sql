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
        ON dbo.Tasks (StatusId, CreatedAt DESC, TaskId DESC);
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
