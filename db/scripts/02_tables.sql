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
        Role         VARCHAR(20)   NOT NULL CONSTRAINT DF_Users_Role DEFAULT ('AGENT'),
        IsActive     BIT           NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (1),
        CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME()),
        PasswordChangedAt DATETIME2(3) NULL,
        DeletedAt    DATETIME2(3)  NULL,
        CONSTRAINT CK_Users_Username_NotBlank CHECK (LEN(TRIM(Username)) > 0),
        CONSTRAINT CK_Users_Role CHECK (Role IN ('ADMIN', 'AGENT'))
    );
END;
GO

/* Migración para bases creadas antes de los roles: agrega las columnas que falten.
   Los usuarios que ya existían tenían acceso completo, así que conservan ese acceso como ADMIN. */
IF COL_LENGTH(N'dbo.Users', N'Role') IS NULL
BEGIN
    ALTER TABLE dbo.Users ADD Role VARCHAR(20) NOT NULL
        CONSTRAINT DF_Users_Role DEFAULT ('AGENT') WITH VALUES;
    -- Se ejecutan como SQL dinámico (texto fijo, sin parámetros) porque la columna aún no
    -- existía cuando se compiló este lote.
    EXEC sys.sp_executesql N'UPDATE dbo.Users SET Role = ''ADMIN'';';
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Users ADD CONSTRAINT CK_Users_Role CHECK (Role IN (''ADMIN'', ''AGENT''));';
END;
GO

IF COL_LENGTH(N'dbo.Users', N'PasswordChangedAt') IS NULL
BEGIN
    ALTER TABLE dbo.Users ADD PasswordChangedAt DATETIME2(3) NULL;
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
        -- Responsable de la tarea. NULL = sin asignar.
        AssignedTo  INT            NULL
            CONSTRAINT FK_Tasks_AssignedTo REFERENCES dbo.Users (UserId),
        CreatedAt   DATETIME2(3)   NOT NULL CONSTRAINT DF_Tasks_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt   DATETIME2(3)   NOT NULL CONSTRAINT DF_Tasks_UpdatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_Tasks_Title_NotBlank CHECK (LEN(TRIM(Title)) > 0),
        CONSTRAINT CK_Tasks_Priority CHECK (Priority BETWEEN 1 AND 3) -- 1 = Alta, 2 = Media, 3 = Baja
    );
END;
GO

/* Migración: asignación de tareas para bases creadas antes de esta funcionalidad. */
IF COL_LENGTH(N'dbo.Tasks', N'AssignedTo') IS NULL
BEGIN
    ALTER TABLE dbo.Tasks ADD AssignedTo INT NULL
        CONSTRAINT FK_Tasks_AssignedTo REFERENCES dbo.Users (UserId);
END;
GO

/* Migración: eliminación lógica de usuarios. Un usuario eliminado no inicia sesión ni
   aparece en la administración, pero su rastro en tareas e historial se conserva (auditoría). */
IF COL_LENGTH(N'dbo.Users', N'DeletedAt') IS NULL
BEGIN
    ALTER TABLE dbo.Users ADD DeletedAt DATETIME2(3) NULL;
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

/* Avances (notas de seguimiento) de una tarea: quién reportó qué y cuándo.
   Solo inserción: no se editan ni se borran, para que sean una traza confiable. */
IF OBJECT_ID(N'dbo.TaskNotes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TaskNotes
    (
        NoteId    BIGINT IDENTITY (1, 1) NOT NULL CONSTRAINT PK_TaskNotes PRIMARY KEY,
        TaskId    INT            NOT NULL
            CONSTRAINT FK_TaskNotes_Task REFERENCES dbo.Tasks (TaskId),
        Body      NVARCHAR(1000) NOT NULL,
        CreatedBy INT            NOT NULL
            CONSTRAINT FK_TaskNotes_CreatedBy REFERENCES dbo.Users (UserId),
        CreatedAt DATETIME2(3)   NOT NULL CONSTRAINT DF_TaskNotes_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_TaskNotes_Body_NotBlank CHECK (LEN(TRIM(Body)) > 0)
    );
END;
GO

/* Historial de responsables: cada asignación, reasignación o liberación (auditoría).
   FromUserId / ToUserId NULL = sin asignar. */
IF OBJECT_ID(N'dbo.TaskAssignmentHistory', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TaskAssignmentHistory
    (
        HistoryId  BIGINT IDENTITY (1, 1) NOT NULL CONSTRAINT PK_TaskAssignmentHistory PRIMARY KEY,
        TaskId     INT          NOT NULL
            CONSTRAINT FK_TaskAssignmentHistory_Task REFERENCES dbo.Tasks (TaskId),
        FromUserId INT          NULL
            CONSTRAINT FK_TaskAssignmentHistory_FromUser REFERENCES dbo.Users (UserId),
        ToUserId   INT          NULL
            CONSTRAINT FK_TaskAssignmentHistory_ToUser REFERENCES dbo.Users (UserId),
        ChangedBy  INT          NOT NULL
            CONSTRAINT FK_TaskAssignmentHistory_ChangedBy REFERENCES dbo.Users (UserId),
        ChangedAt  DATETIME2(3) NOT NULL CONSTRAINT DF_TaskAssignmentHistory_ChangedAt DEFAULT (SYSUTCDATETIME())
    );
END;
GO
