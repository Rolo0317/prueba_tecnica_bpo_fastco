/* =============================================================================
   02_tables.sql
   Esquema: catálogo de estados, transiciones permitidas, usuarios, tareas
   e historial de cambios de estado (auditoría).
   Idempotente: solo crea las tablas que no existen.
   ============================================================================= */
USE [$(DB_NAME)];
GO
SET NOCOUNT ON;
GO

/* Catálogo de estados de una tarea */
IF OBJECT_ID(N'dbo.TaskStatuses', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TaskStatuses
    (
        StatusId  TINYINT      NOT NULL CONSTRAINT PK_TaskStatuses PRIMARY KEY,
        Code      VARCHAR(20)  NOT NULL CONSTRAINT UQ_TaskStatuses_Code UNIQUE,
        Name      NVARCHAR(50) NOT NULL,
        IsFinal   BIT          NOT NULL CONSTRAINT DF_TaskStatuses_IsFinal DEFAULT (0),
        SortOrder TINYINT      NOT NULL
    );
END;
GO

/* Transiciones de estado permitidas (las reglas viven en datos, no en código:
   agregar una transición nueva no requiere modificar ningún procedimiento) */
IF OBJECT_ID(N'dbo.TaskStatusTransitions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TaskStatusTransitions
    (
        FromStatusId TINYINT NOT NULL
            CONSTRAINT FK_TaskStatusTransitions_FromStatus REFERENCES dbo.TaskStatuses (StatusId),
        ToStatusId   TINYINT NOT NULL
            CONSTRAINT FK_TaskStatusTransitions_ToStatus REFERENCES dbo.TaskStatuses (StatusId),
        CONSTRAINT PK_TaskStatusTransitions PRIMARY KEY (FromStatusId, ToStatusId),
        CONSTRAINT CK_TaskStatusTransitions_DifferentStatus CHECK (FromStatusId <> ToStatusId)
    );
END;
GO

/* Usuarios de la aplicación. Solo se almacena el hash bcrypt de la contraseña. */
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users
    (
        UserId       INT IDENTITY (1, 1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
        Username     NVARCHAR(50)  NOT NULL CONSTRAINT UQ_Users_Username UNIQUE,
        PasswordHash VARCHAR(100)  NOT NULL,
        FullName     NVARCHAR(100) NOT NULL,
        IsActive     BIT           NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (1),
        CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_Users_Username_NotBlank CHECK (LEN(TRIM(Username)) > 0)
    );
END;
GO

/* Tareas operativas */
IF OBJECT_ID(N'dbo.Tasks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Tasks
    (
        TaskId      INT IDENTITY (1, 1) NOT NULL CONSTRAINT PK_Tasks PRIMARY KEY,
        Title       NVARCHAR(150)  NOT NULL,
        Description NVARCHAR(1000) NULL,
        StatusId    TINYINT        NOT NULL
            CONSTRAINT FK_Tasks_Status REFERENCES dbo.TaskStatuses (StatusId),
        Priority    TINYINT        NOT NULL CONSTRAINT DF_Tasks_Priority DEFAULT (2),
        DueDate     DATE           NULL,
        CreatedBy   INT            NOT NULL
            CONSTRAINT FK_Tasks_CreatedBy REFERENCES dbo.Users (UserId),
        CreatedAt   DATETIME2(3)   NOT NULL CONSTRAINT DF_Tasks_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt   DATETIME2(3)   NOT NULL CONSTRAINT DF_Tasks_UpdatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_Tasks_Title_NotBlank CHECK (LEN(TRIM(Title)) > 0),
        CONSTRAINT CK_Tasks_Priority CHECK (Priority BETWEEN 1 AND 3) -- 1 = Alta, 2 = Media, 3 = Baja
    );
END;
GO

/* Historial de estados: quién cambió qué y cuándo (trazabilidad / auditoría).
   FromStatusId es NULL en el registro de creación de la tarea. */
IF OBJECT_ID(N'dbo.TaskStatusHistory', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TaskStatusHistory
    (
        HistoryId    BIGINT IDENTITY (1, 1) NOT NULL CONSTRAINT PK_TaskStatusHistory PRIMARY KEY,
        TaskId       INT          NOT NULL
            CONSTRAINT FK_TaskStatusHistory_Task REFERENCES dbo.Tasks (TaskId),
        FromStatusId TINYINT      NULL
            CONSTRAINT FK_TaskStatusHistory_FromStatus REFERENCES dbo.TaskStatuses (StatusId),
        ToStatusId   TINYINT      NOT NULL
            CONSTRAINT FK_TaskStatusHistory_ToStatus REFERENCES dbo.TaskStatuses (StatusId),
        ChangedBy    INT          NOT NULL
            CONSTRAINT FK_TaskStatusHistory_ChangedBy REFERENCES dbo.Users (UserId),
        ChangedAt    DATETIME2(3) NOT NULL CONSTRAINT DF_TaskStatusHistory_ChangedAt DEFAULT (SYSUTCDATETIME())
    );
END;
GO
