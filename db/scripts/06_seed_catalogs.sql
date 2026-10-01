/* =============================================================================
   06_seed_catalogs.sql
   Datos de catálogo: estados y transiciones permitidas.
   Idempotente: sincroniza los catálogos con lo definido aquí en cada ejecución.
   (El usuario demo NO se crea aquí: lo crea la API al iniciar, con hash bcrypt
   generado a partir de variables de entorno, para no versionar credenciales.)
   ============================================================================= */
USE [$(DB_NAME)];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @Statuses TABLE
    (
        StatusId  TINYINT      NOT NULL PRIMARY KEY,
        Code      VARCHAR(20)  NOT NULL,
        Name      NVARCHAR(50) NOT NULL,
        IsFinal   BIT          NOT NULL,
        SortOrder TINYINT      NOT NULL
    );

    INSERT INTO @Statuses (StatusId, Code, Name, IsFinal, SortOrder)
    VALUES
        (1, 'PENDING',     N'Pendiente',   0, 1),
        (2, 'IN_PROGRESS', N'En progreso', 0, 2),
        (3, 'COMPLETED',   N'Completada',  1, 3),
        (4, 'CANCELLED',   N'Cancelada',   1, 4);

    UPDATE target
    SET Code = source.Code,
        Name = source.Name,
        IsFinal = source.IsFinal,
        SortOrder = source.SortOrder
    FROM dbo.TaskStatuses AS target
    INNER JOIN @Statuses AS source ON source.StatusId = target.StatusId;

    INSERT INTO dbo.TaskStatuses (StatusId, Code, Name, IsFinal, SortOrder)
    SELECT source.StatusId, source.Code, source.Name, source.IsFinal, source.SortOrder
    FROM @Statuses AS source
    WHERE NOT EXISTS (SELECT 1 FROM dbo.TaskStatuses AS t WHERE t.StatusId = source.StatusId);

    /* Reglas de negocio:
       Pendiente   → En progreso | Cancelada
       En progreso → Pendiente | Completada | Cancelada
       Completada y Cancelada son estados finales. */
    DECLARE @Transitions TABLE
    (
        FromStatusId TINYINT NOT NULL,
        ToStatusId   TINYINT NOT NULL,
        PRIMARY KEY (FromStatusId, ToStatusId)
    );

    INSERT INTO @Transitions (FromStatusId, ToStatusId)
    VALUES (1, 2), (1, 4), (2, 1), (2, 3), (2, 4);

    DELETE target
    FROM dbo.TaskStatusTransitions AS target
    WHERE NOT EXISTS (
        SELECT 1 FROM @Transitions AS source
        WHERE source.FromStatusId = target.FromStatusId AND source.ToStatusId = target.ToStatusId
    );

    INSERT INTO dbo.TaskStatusTransitions (FromStatusId, ToStatusId)
    SELECT source.FromStatusId, source.ToStatusId
    FROM @Transitions AS source
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.TaskStatusTransitions AS t
        WHERE t.FromStatusId = source.FromStatusId AND t.ToStatusId = source.ToStatusId
    );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
