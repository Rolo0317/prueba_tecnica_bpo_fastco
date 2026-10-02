/* =============================================================================
   08_demo_data.sql
   Datos de demostración de un BPO en operación: áreas reales de un contact center,
   roles configurados, ~60 personas y ~4 meses de tareas con su historial completo
   (creación, asignación, avances, reasignaciones, cierres y cancelaciones).

   - Solo se ejecuta si SEED_DEMO_DATA=true y la base no tiene tareas (no toca datos reales).
   - Determinístico: siempre genera los mismos datos (no usa RAND/NEWID).
   - Las cuentas quedan BLOQUEADAS (hash bcrypt que no corresponde a ninguna contraseña)
     hasta que la API les asigna SEED_DEMO_PASSWORD (usp_Users_ActivateDemoAccounts).
     Ninguna contraseña queda escrita en el repositorio.
   - Clientes y campañas ficticios.
   ============================================================================= */
USE [$(DB_NAME)];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF N'$(SEED_DEMO_DATA)' <> N'true'
BEGIN
    PRINT N'[demo] SEED_DEMO_DATA distinto de true: se omiten los datos de demostración.';
    RETURN;
END;

IF EXISTS (SELECT 1 FROM dbo.Tasks)
BEGIN
    PRINT N'[demo] La base ya tiene tareas: no se cargan datos de demostración.';
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @LockedHash VARCHAR(60) = '$2b$12$' + REPLICATE('.', 53);
    DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @Pending TINYINT = (SELECT StatusId FROM dbo.TaskStatuses WHERE Code = 'PENDING'),
            @InProgress TINYINT = (SELECT StatusId FROM dbo.TaskStatuses WHERE Code = 'IN_PROGRESS'),
            @Completed TINYINT = (SELECT StatusId FROM dbo.TaskStatuses WHERE Code = 'COMPLETED'),
            @Cancelled TINYINT = (SELECT StatusId FROM dbo.TaskStatuses WHERE Code = 'CANCELLED');

    /* ---------------------------------------------------------------- Áreas */
    INSERT INTO dbo.Areas (Name, Description)
    SELECT s.Name, s.Description
    FROM (VALUES
        (N'Operaciones Contact Center',      N'Atención inbound y outbound de las campañas de los clientes.'),
        (N'Back Office',                     N'Validación de soportes, novedades y gestión documental.'),
        (N'Calidad',                         N'Monitoreo de interacciones, calibraciones y planes de mejora.'),
        (N'Formación',                       N'Inducción, nesting y actualización de procedimientos por campaña.'),
        (N'Workforce Management',            N'Pronóstico de tráfico, mallas de turnos y control de adherencia.'),
        (N'Innovación y Transformación Digital', N'Automatización (RPA), bots conversacionales y analítica de voz.'),
        (N'Tecnología e Infraestructura',    N'Plataforma de telefonía, puestos de trabajo y redes.'),
        (N'Seguridad de la Información',     N'Gestión de accesos, incidentes y cumplimiento ISO 27001.'),
        (N'Talento Humano',                  N'Selección, contratación, nómina y bienestar.'),
        (N'Cartera y Cobranza',              N'Gestión de cobro preventivo y de mora temprana.'),
        (N'Retención y Fidelización',        N'Contención de cancelaciones y campañas de fidelización.'),
        (N'Ventas y Televentas',             N'Venta cruzada y campañas comerciales outbound.'),
        (N'Experiencia del Cliente',         N'PQRS, encuestas NPS y casos escalados.'),
        (N'Analítica y Reportes',            N'Tableros de gestión, indicadores contractuales e informes a clientes.'),
        (N'Facturación y Finanzas',          N'Facturación a clientes, conciliaciones y cuentas por pagar.'),
        (N'Jurídica y Cumplimiento',         N'Contratos, Habeas Data (Ley 1581) y requerimientos de entes de control.'),
        (N'Servicios Administrativos',       N'Compras, mantenimiento de sedes y proveedores.')
    ) AS s (Name, Description)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Areas AS a WHERE a.Name = s.Name);

    /* ---------------------------------------------------------------- Roles */
    DECLARE @NewRoles TABLE (Name NVARCHAR(50), Description NVARCHAR(200), Permissions VARCHAR(200));
    INSERT INTO @NewRoles VALUES
        (N'Gerente de operaciones', N'Ve, edita y asigna las tareas de todas las áreas.', 'TASKS_VIEW_ALL,TASKS_EDIT_ANY,TASKS_ASSIGN'),
        (N'Líder de innovación',    N'Impulsa proyectos transversales: ve todas las áreas y asigna.', 'TASKS_VIEW_ALL,TASKS_ASSIGN'),
        (N'Analista de calidad',    N'Audita la operación: ve las tareas de todas las áreas.', 'TASKS_VIEW_ALL'),
        (N'Analista WFM',           N'Planea la capacidad: ve las tareas de todas las áreas.', 'TASKS_VIEW_ALL'),
        (N'Analista de datos',      N'Construye los informes: ve las tareas de todas las áreas.', 'TASKS_VIEW_ALL'),
        (N'Oficial de seguridad',   N'Seguimiento a incidentes y accesos en todas las áreas.', 'TASKS_VIEW_ALL'),
        (N'Formador',               N'Acompaña a su área: ve las tareas del área.', 'TASKS_VIEW_AREA'),
        (N'Gestor de talento humano', N'Administra las cuentas de usuario del personal.', 'USERS_MANAGE,TASKS_VIEW_AREA'),
        (N'Agente',                 N'Asesor de línea: gestiona las tareas asignadas y las que crea.', '');

    INSERT INTO dbo.Roles (Name, Description)
    SELECT r.Name, r.Description
    FROM @NewRoles AS r
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles AS x WHERE x.Name = r.Name);

    INSERT INTO dbo.RolePermissions (RoleId, PermissionCode)
    SELECT ro.RoleId, TRIM(p.value)
    FROM @NewRoles AS r
    INNER JOIN dbo.Roles AS ro ON ro.Name = r.Name
    CROSS APPLY STRING_SPLIT(r.Permissions, ',') AS p
    WHERE LEN(TRIM(p.value)) > 0
      AND NOT EXISTS (SELECT 1 FROM dbo.RolePermissions AS x WHERE x.RoleId = ro.RoleId AND x.PermissionCode = TRIM(p.value));

    /* ---------------------------------------------------------------- Personas */
    DECLARE @People TABLE (Username NVARCHAR(50), FullName NVARCHAR(100), RoleName NVARCHAR(50), AreaName NVARCHAR(80), IsLead BIT, IsActive BIT);
    INSERT INTO @People VALUES
        (N'sandra.mejia',     N'Sandra Milena Mejía Ortiz',      N'Gerente de operaciones', N'Operaciones Contact Center', 1, 1),
        (N'carlos.restrepo',  N'Carlos Andrés Restrepo Gil',     N'Supervisor',  N'Operaciones Contact Center', 1, 1),
        (N'julian.ospina',    N'Julián David Ospina Rendón',     N'Supervisor',  N'Operaciones Contact Center', 1, 1),
        (N'valentina.cardona',N'Valentina Cardona Ríos',         N'Agente',      N'Operaciones Contact Center', 0, 1),
        (N'kevin.zapata',     N'Kevin Alexis Zapata Muñoz',      N'Agente',      N'Operaciones Contact Center', 0, 1),
        (N'daniela.munoz',    N'Daniela Muñoz Arango',           N'Agente',      N'Operaciones Contact Center', 0, 1),
        (N'brayan.henao',     N'Brayan Stiven Henao Cifuentes',  N'Agente',      N'Operaciones Contact Center', 0, 1),
        (N'yesica.arango',    N'Yésica Paola Arango López',      N'Agente',      N'Operaciones Contact Center', 0, 0),
        (N'santiago.villa',   N'Santiago Villa Montoya',         N'Agente',      N'Operaciones Contact Center', 0, 1),
        (N'paula.agudelo',    N'Paula Andrea Agudelo Gaviria',   N'Agente',      N'Operaciones Contact Center', 0, 1),
        (N'cristian.rios',    N'Cristian Camilo Ríos Bermúdez',  N'Agente',      N'Operaciones Contact Center', 0, 1),
        (N'diana.salazar',    N'Diana Patricia Salazar Mora',    N'Supervisor',  N'Back Office', 1, 1),
        (N'andres.giraldo',   N'Andrés Felipe Giraldo Mesa',     N'Colaborador', N'Back Office', 0, 1),
        (N'luisa.mesa',       N'Luisa Fernanda Mesa Quintero',   N'Colaborador', N'Back Office', 0, 1),
        (N'jhon.castano',     N'Jhon Fredy Castaño Ramírez',     N'Colaborador', N'Back Office', 0, 1),
        (N'natalia.correa',   N'Natalia Correa Vélez',           N'Colaborador', N'Back Office', 0, 1),
        (N'mateo.alzate',     N'Mateo Alzate Buitrago',          N'Colaborador', N'Back Office', 0, 1),
        (N'laura.gomez',      N'Laura Cristina Gómez Patiño',    N'Supervisor',  N'Calidad', 1, 1),
        (N'camila.vargas',    N'Camila Vargas Londoño',          N'Analista de calidad', N'Calidad', 0, 1),
        (N'felipe.londono',   N'Felipe Londoño Escobar',         N'Analista de calidad', N'Calidad', 0, 1),
        (N'manuela.serna',    N'Manuela Serna Holguín',          N'Analista de calidad', N'Calidad', 0, 1),
        (N'ricardo.duque',    N'Ricardo Duque Toro',             N'Supervisor',  N'Formación', 1, 1),
        (N'angela.ramirez',   N'Ángela María Ramírez Ocampo',    N'Formador',    N'Formación', 0, 1),
        (N'sebastian.marin',  N'Sebastián Marín Correa',         N'Formador',    N'Formación', 0, 1),
        (N'oscar.velez',      N'Óscar Iván Vélez Hincapié',      N'Supervisor',  N'Workforce Management', 1, 1),
        (N'tatiana.osorio',   N'Tatiana Osorio Rendón',          N'Analista WFM', N'Workforce Management', 0, 1),
        (N'juan.bedoya',      N'Juan Pablo Bedoya Cárdenas',     N'Analista WFM', N'Workforce Management', 0, 1),
        (N'alejandro.franco', N'Alejandro Franco Villegas',      N'Líder de innovación', N'Innovación y Transformación Digital', 1, 1),
        (N'mariana.cano',     N'Mariana Cano Echavarría',        N'Colaborador', N'Innovación y Transformación Digital', 0, 1),
        (N'david.echeverri',  N'David Echeverri Lopera',         N'Colaborador', N'Innovación y Transformación Digital', 0, 1),
        (N'hernan.quintero',  N'Hernán Darío Quintero Álvarez',  N'Supervisor',  N'Tecnología e Infraestructura', 1, 1),
        (N'esteban.pineda',   N'Esteban Pineda Uribe',           N'Colaborador', N'Tecnología e Infraestructura', 0, 1),
        (N'jorge.arboleda',   N'Jorge Mario Arboleda Sánchez',   N'Colaborador', N'Tecnología e Infraestructura', 0, 1),
        (N'monica.uribe',     N'Mónica Uribe Restrepo',          N'Oficial de seguridad', N'Seguridad de la Información', 1, 1),
        (N'claudia.hoyos',    N'Claudia Hoyos Gutiérrez',        N'Gestor de talento humano', N'Talento Humano', 1, 1),
        (N'viviana.ochoa',    N'Viviana Ochoa Jiménez',          N'Colaborador', N'Talento Humano', 0, 1),
        (N'fernando.cardenas',N'Fernando Cárdenas Toro',         N'Supervisor',  N'Cartera y Cobranza', 1, 1),
        (N'lina.posada',      N'Lina Marcela Posada Duque',      N'Agente',      N'Cartera y Cobranza', 0, 1),
        (N'miguel.tobon',     N'Miguel Ángel Tobón Rúa',         N'Agente',      N'Cartera y Cobranza', 0, 1),
        (N'karen.jaramillo',  N'Karen Jaramillo Zuluaga',        N'Agente',      N'Cartera y Cobranza', 0, 1),
        (N'adriana.betancur', N'Adriana Betancur Mejía',         N'Supervisor',  N'Retención y Fidelización', 1, 1),
        (N'johan.montoya',    N'Johan Sebastián Montoya Gil',    N'Agente',      N'Retención y Fidelización', 0, 1),
        (N'sara.estrada',     N'Sara Estrada Pérez',             N'Agente',      N'Retención y Fidelización', 0, 1),
        (N'mauricio.arias',   N'Mauricio Arias Henao',           N'Supervisor',  N'Ventas y Televentas', 1, 1),
        (N'alejandra.rojas',  N'Alejandra Rojas Cadavid',        N'Agente',      N'Ventas y Televentas', 0, 1),
        (N'nicolas.guzman',   N'Nicolás Guzmán Valencia',        N'Agente',      N'Ventas y Televentas', 0, 1),
        (N'patricia.lopez',   N'Patricia López Arbeláez',        N'Supervisor',  N'Experiencia del Cliente', 1, 1),
        (N'daniel.sierra',    N'Daniel Sierra Marulanda',        N'Colaborador', N'Experiencia del Cliente', 0, 1),
        (N'catalina.vasquez', N'Catalina Vásquez Orozco',        N'Colaborador', N'Experiencia del Cliente', 0, 1),
        (N'andrea.pulgarin',  N'Andrea Pulgarín Castro',         N'Analista de datos', N'Analítica y Reportes', 1, 1),
        (N'samuel.ortiz',     N'Samuel Ortiz Bedoya',            N'Analista de datos', N'Analítica y Reportes', 0, 1),
        (N'gloria.zuluaga',   N'Gloria Inés Zuluaga Franco',     N'Supervisor',  N'Facturación y Finanzas', 1, 1),
        (N'ivan.palacio',     N'Iván Palacio Mejía',             N'Colaborador', N'Facturación y Finanzas', 0, 1),
        (N'beatriz.galeano',  N'Beatriz Galeano Ruiz',           N'Colaborador', N'Jurídica y Cumplimiento', 1, 1),
        (N'ruben.herrera',    N'Rubén Herrera Cano',             N'Colaborador', N'Servicios Administrativos', 1, 1);

    INSERT INTO dbo.Users (Username, PasswordHash, FullName, RoleId, AreaId, IsActive, Email, CreatedAt)
    SELECT p.Username, @LockedHash, p.FullName, r.RoleId, a.AreaId, p.IsActive,
           p.Username + N'@fastco.test',
           DATEADD(DAY, -150 - (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(p.Username, '|', 'alta')), 1, 4) AS INT) & 2147483647) % 400, @Now)
    FROM @People AS p
    INNER JOIN dbo.Roles AS r ON r.Name = p.RoleName
    INNER JOIN dbo.Areas AS a ON a.Name = p.AreaName
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Users AS u WHERE u.Username = p.Username);

    /* Integrantes por área: líderes (crean y asignan) y equipo (atiende). */
    CREATE TABLE #Leads (AreaId INT, UserId INT, Rn INT, Cnt INT);
    CREATE TABLE #Team  (AreaId INT, UserId INT, Rn INT, Cnt INT);

    INSERT INTO #Leads
    SELECT a.AreaId, u.UserId,
           ROW_NUMBER() OVER (PARTITION BY a.AreaId ORDER BY u.UserId),
           COUNT(*) OVER (PARTITION BY a.AreaId)
    FROM @People AS p
    INNER JOIN dbo.Users AS u ON u.Username = p.Username
    INNER JOIN dbo.Areas AS a ON a.Name = p.AreaName
    WHERE p.IsLead = 1 AND p.RoleName <> N'Gerente de operaciones';

    INSERT INTO #Team
    SELECT a.AreaId, u.UserId,
           ROW_NUMBER() OVER (PARTITION BY a.AreaId ORDER BY u.UserId),
           COUNT(*) OVER (PARTITION BY a.AreaId)
    FROM @People AS p
    INNER JOIN dbo.Users AS u ON u.Username = p.Username
    INNER JOIN dbo.Areas AS a ON a.Name = p.AreaName
    WHERE p.IsActive = 1
      AND (p.IsLead = 0 OR NOT EXISTS (SELECT 1 FROM @People AS q WHERE q.AreaName = p.AreaName AND q.IsLead = 0));

    /* ---------------------------------------------------------------- Plantillas de tareas
       Hours = horas típicas hasta completarse; {c} = cliente/campaña. */
    DECLARE @Tpl TABLE (Id INT IDENTITY, AreaName NVARCHAR(80), Title NVARCHAR(150), Description NVARCHAR(400), Priority TINYINT, Hours INT);
    INSERT INTO @Tpl (AreaName, Title, Description, Priority, Hours) VALUES
        (N'Operaciones Contact Center', N'Devolver llamada a cliente con reclamo por doble cobro — {c}', N'El cliente reporta dos cargos en el mismo ciclo. Validar en el sistema del cliente y confirmar el reverso.', 1, 6),
        (N'Operaciones Contact Center', N'Escalar caso de falla técnica recurrente — {c}', N'Tercera llamada del mismo cliente por la misma falla. Escalar a segundo nivel con la evidencia de las interacciones.', 1, 10),
        (N'Operaciones Contact Center', N'Confirmar agendamiento de visita técnica — {c}', N'Llamar al cliente para confirmar franja horaria y datos de contacto.', 2, 8),
        (N'Operaciones Contact Center', N'Actualizar guion de bienvenida por cambio de tarifas — {c}', N'El cliente envió nuevas tarifas vigentes desde el 1 del mes. Ajustar el guion y socializar con los asesores.', 2, 24),
        (N'Operaciones Contact Center', N'Cubrir pico de tráfico del lunes — {c}', N'WFM proyecta 18 % más llamadas. Coordinar horas extra y pausas escalonadas.', 1, 5),
        (N'Back Office', N'Validar soporte de pago enviado por correo — {c}', N'Cliente adjunta comprobante de pago. Verificar contra el extracto bancario y aplicar el pago.', 1, 12),
        (N'Back Office', N'Radicar novedad de cambio de titular — {c}', N'Revisar documentos (cédula, carta firmada) y radicar la novedad en la plataforma del cliente.', 2, 20),
        (N'Back Office', N'Depurar base de solicitudes sin documentos completos — {c}', N'Clasificar solicitudes incompletas y enviar correo de requerimiento al titular.', 3, 36),
        (N'Back Office', N'Procesar lote de devoluciones aprobadas — {c}', N'Lote semanal de devoluciones aprobadas por el cliente. Generar archivo plano y validar totales.', 2, 16),
        (N'Calidad', N'Monitorear muestra semanal de llamadas — {c}', N'Evaluar 40 interacciones con la matriz vigente y registrar hallazgos críticos.', 2, 30),
        (N'Calidad', N'Sesión de calibración con el cliente — {c}', N'Calibrar criterios de la matriz de calidad con el equipo del cliente y dejar acta.', 2, 48),
        (N'Calidad', N'Plan de mejora por error crítico en protocolo de seguridad — {c}', N'Asesor omitió validación de identidad. Retroalimentar y hacer seguimiento por dos semanas.', 1, 24),
        (N'Formación', N'Inducción de nueva cohorte de asesores — {c}', N'Grupo de 12 personas. Preparar agenda, accesos de prueba y evaluación final.', 1, 72),
        (N'Formación', N'Actualizar módulo de procedimientos por nuevo producto — {c}', N'El cliente lanza un producto nuevo. Ajustar el material y la evaluación de conocimiento.', 2, 40),
        (N'Formación', N'Refuerzo a asesores con bajo puntaje de calidad — {c}', N'Sesión de 2 horas sobre manejo de objeciones y cierre de llamada.', 2, 20),
        (N'Workforce Management', N'Ajustar malla de turnos por festivo — {c}', N'Recalcular dimensionamiento y publicar la malla con 72 horas de anticipación.', 1, 10),
        (N'Workforce Management', N'Revisar adherencia del equipo de la tarde — {c}', N'Adherencia de 84 % frente a meta de 90 %. Identificar causas y proponer ajustes.', 2, 16),
        (N'Workforce Management', N'Pronóstico de tráfico para el próximo mes — {c}', N'Actualizar el modelo con el histórico de las últimas 8 semanas y la campaña de facturación.', 2, 30),
        (N'Innovación y Transformación Digital', N'Piloto de bot de autogestión para consulta de saldo — {c}', N'Definir intenciones, flujo conversacional y medir tasa de contención en el piloto.', 1, 120),
        (N'Innovación y Transformación Digital', N'Automatizar con RPA la validación de soportes de pago', N'Robot que descarga los soportes del buzón y los cruza con el extracto. Back Office valida resultados.', 2, 160),
        (N'Innovación y Transformación Digital', N'Analítica de voz: identificar motivos de cancelación — {c}', N'Clasificar transcripciones del último mes y presentar el top 5 de motivos a Retención.', 2, 96),
        (N'Tecnología e Infraestructura', N'Restablecer acceso a la VPN de un asesor en trabajo remoto', N'El asesor no puede conectarse desde casa. Validar certificado y perfil de acceso.', 1, 3),
        (N'Tecnología e Infraestructura', N'Revisar latencia en la plataforma de telefonía — {c}', N'Reportes de cortes de audio en la sede norte. Revisar QoS y enlaces con el proveedor.', 1, 8),
        (N'Tecnología e Infraestructura', N'Alistar 15 puestos de trabajo para nueva cohorte', N'Imagen corporativa, diademas, softphone y accesos según el perfil de la campaña.', 2, 40),
        (N'Seguridad de la Información', N'Revisión trimestral de accesos de usuarios retirados', N'Cruzar el reporte de retiros de Talento Humano con las cuentas activas en todas las plataformas.', 1, 30),
        (N'Seguridad de la Información', N'Atender incidente: correo de phishing reportado por asesores', N'Bloquear el remitente, revisar quién hizo clic y enviar comunicado preventivo.', 1, 6),
        (N'Talento Humano', N'Publicar vacantes de asesores bilingües — {c}', N'Requerimiento de 8 asesores con inglés B2. Publicar en portales y coordinar pruebas.', 2, 48),
        (N'Talento Humano', N'Gestionar novedades de nómina de la quincena', N'Consolidar incapacidades, horas extra y recargos nocturnos reportados por los supervisores.', 1, 20),
        (N'Cartera y Cobranza', N'Gestionar acuerdos de pago de mora 30 días — {c}', N'Campaña preventiva sobre la base asignada. Registrar promesas de pago en el CRM.', 2, 30),
        (N'Cartera y Cobranza', N'Verificar promesas de pago incumplidas — {c}', N'Cruzar promesas vencidas con pagos recibidos y reprogramar la gestión.', 2, 16),
        (N'Retención y Fidelización', N'Contactar clientes con solicitud de cancelación — {c}', N'Aplicar oferta de retención vigente y registrar el motivo de la solicitud.', 1, 12),
        (N'Retención y Fidelización', N'Analizar caída en la tasa de retención de la semana — {c}', N'La tasa bajó de 42 % a 35 %. Revisar ofertas aplicadas y escuchar una muestra de llamadas.', 2, 24),
        (N'Ventas y Televentas', N'Cargar base de prospectos de la campaña de venta cruzada — {c}', N'Validar autorizaciones de contacto (Habeas Data) antes de cargar la base al marcador.', 1, 10),
        (N'Ventas y Televentas', N'Auditar ventas con soporte de grabación incompleto — {c}', N'El cliente rechazó ventas sin grabación de aceptación. Recuperar grabaciones o reversar.', 1, 20),
        (N'Experiencia del Cliente', N'Responder PQRS dentro del término legal — {c}', N'Plazo de 15 días hábiles. Consolidar la respuesta con el área responsable.', 1, 48),
        (N'Experiencia del Cliente', N'Analizar comentarios de detractores de la encuesta NPS — {c}', N'Clasificar los comentarios y presentar acciones a los supervisores de operación.', 2, 30),
        (N'Analítica y Reportes', N'Informe mensual de indicadores contractuales — {c}', N'Nivel de servicio, abandono, TMO y calidad. Validar cifras con WFM antes de enviar.', 1, 24),
        (N'Analítica y Reportes', N'Ajustar tablero de productividad por cambio de pausas', N'Incluir los nuevos códigos de pausa en el tablero de supervisores.', 3, 16),
        (N'Facturación y Finanzas', N'Conciliar facturación del mes con el cliente — {c}', N'Cruzar horas facturadas contra el reporte de conexión y resolver diferencias.', 1, 40),
        (N'Facturación y Finanzas', N'Radicar cuentas de cobro de proveedores de telefonía', N'Validar soportes y radicar antes del corte de pagos del día 25.', 2, 12),
        (N'Jurídica y Cumplimiento', N'Responder requerimiento de la Superintendencia — {c}', N'Consolidar evidencia de la atención del caso y radicar dentro del plazo.', 1, 60),
        (N'Jurídica y Cumplimiento', N'Revisar autorizaciones de tratamiento de datos de la nueva campaña', N'Verificar textos legales del guion y del formulario web según la Ley 1581.', 2, 30),
        (N'Servicios Administrativos', N'Cotizar mantenimiento del aire acondicionado de la sede norte', N'Solicitar tres cotizaciones y programar el mantenimiento fuera del horario pico.', 3, 72),
        (N'Servicios Administrativos', N'Gestionar compra de diademas de reposición', N'Inventario de 20 diademas dañadas reportadas por Tecnología.', 2, 48);

    DECLARE @Clients TABLE (Id INT, Name NVARCHAR(60));
    INSERT INTO @Clients VALUES
        (0, N'Telco Andina'), (1, N'Banco Horizonte'), (2, N'Seguros Altamira'),
        (3, N'EPS Vital'), (4, N'Tienda Nova'), (5, N'Energía del Valle');

    DECLARE @TplCount INT = (SELECT COUNT(*) FROM @Tpl);

    /* ---------------------------------------------------------------- Tareas (~4 meses) */
    CREATE TABLE #Plan
    (
        K INT PRIMARY KEY, TplId INT, AreaId INT, Title NVARCHAR(150), Description NVARCHAR(1000),
        Priority TINYINT, CreatedAt DATETIME2(3), DueDate DATE, CreatedBy INT, AssignedTo INT,
        Reassign INT NULL, StartedAt DATETIME2(3) NULL, ClosedAt DATETIME2(3) NULL, FinalStatus TINYINT,
        TaskId INT NULL
    );

    ;WITH N AS (
        SELECT TOP (460) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS K
        FROM sys.all_objects
    ),
    Base AS (
        SELECT
            n.K,
            1 + (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(n.K, '|', 17)), 1, 4) AS INT) & 2147483647) % @TplCount AS TplId,
            CASE WHEN n.K % 5 = 0 THEN (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(n.K, '|', 29)), 1, 4) AS INT) & 2147483647) % 4
                 ELSE (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(n.K, '|', 29)), 1, 4) AS INT) & 2147483647) % 120 END AS AgeDays,
            -- Hora de creación en jornada laboral de Colombia (UTC-5): 7:00 a 18:00 → 12:00 a 23:00 UTC.
            12 * 60 + (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(n.K, '|', 31)), 1, 4) AS INT) & 2147483647) % 660 AS MinuteOfDay,
            (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(n.K, '|', 41)), 1, 4) AS INT) & 2147483647) % 100 AS Roll,
            50 + (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(n.K, '|', 43)), 1, 4) AS INT) & 2147483647) % 200 AS SpeedPct,
            (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(n.K, '|', 47)), 1, 4) AS INT) & 2147483647) % 100 AS AssignRoll
        FROM N AS n
    )
    INSERT INTO #Plan (K, TplId, AreaId, Title, Description, Priority, CreatedAt, DueDate, CreatedBy, AssignedTo, Reassign, StartedAt, ClosedAt, FinalStatus)
    SELECT
        b.K, t.Id, a.AreaId,
        REPLACE(t.Title, N'{c}', c.Name),
        t.Description,
        CASE WHEN b.Roll % 7 = 0 AND t.Priority < 3 THEN t.Priority + 1 ELSE t.Priority END,
        x.CreatedAt,
        CASE WHEN b.AgeDays <= 3 AND st.Status IN ('PENDING', 'IN_PROGRESS')
             THEN DATEADD(DAY, (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(b.K, '|', 71)), 1, 4) AS INT) & 2147483647) % 7, CAST(@Now AS DATE))
             ELSE CAST(DATEADD(HOUR, CEILING(t.Hours * 1.6) + 24, x.CreatedAt) AS DATE) END,
        ld.UserId,
        CASE WHEN b.AssignRoll < 4 THEN NULL ELSE tm.UserId END,
        CASE WHEN b.AssignRoll BETWEEN 4 AND 13 AND tm.Cnt > 1 THEN tm2.UserId END,
        CASE WHEN st.Status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')
             THEN DATEADD(MINUTE, 10 + t.Hours * b.SpeedPct * 60 / 100 / 6, x.CreatedAt) END,
        CASE WHEN st.Status IN ('COMPLETED', 'CANCELLED')
             THEN DATEADD(MINUTE, 30 + t.Hours * b.SpeedPct * 60 / 100, x.CreatedAt) END,
        CASE st.Status WHEN 'PENDING' THEN @Pending WHEN 'IN_PROGRESS' THEN @InProgress
                       WHEN 'COMPLETED' THEN @Completed ELSE @Cancelled END
    FROM Base AS b
    INNER JOIN @Tpl AS t ON t.Id = b.TplId
    INNER JOIN dbo.Areas AS a ON a.Name = t.AreaName
    INNER JOIN @Clients AS c ON c.Id = b.K % 6
    CROSS APPLY (
        SELECT DATEADD(MINUTE, b.MinuteOfDay, CAST(CAST(DATEADD(DAY, -b.AgeDays, @Now) AS DATE) AS DATETIME2(3))) AS Planned
    ) AS x0
    CROSS APPLY (
        -- Nada en el futuro: si la hora de hoy aún no llega, la tarea se creó el día anterior.
        SELECT CASE WHEN x0.Planned > DATEADD(MINUTE, -30, @Now) THEN DATEADD(DAY, -1, x0.Planned) ELSE x0.Planned END AS CreatedAt
    ) AS x
    CROSS APPLY (
        -- Lo antiguo casi siempre está cerrado; lo reciente, en curso. Si el cierre caería en el futuro, sigue abierta.
        SELECT CASE
            WHEN DATEADD(MINUTE, 30 + t.Hours * b.SpeedPct * 60 / 100, x.CreatedAt) > @Now
                THEN CASE WHEN b.Roll < 45 THEN 'PENDING' ELSE 'IN_PROGRESS' END
            -- Más de 12 días: casi todo cerrado, con un pequeño rezago vencido (lo normal en operación).
            WHEN b.AgeDays > 12 THEN CASE WHEN b.Roll < 6 THEN 'CANCELLED' WHEN b.Roll < 8 THEN 'IN_PROGRESS' WHEN b.Roll < 9 THEN 'PENDING' ELSE 'COMPLETED' END
            -- Entre 4 y 12 días: en su mayoría cerrado.
            WHEN b.AgeDays > 3 THEN CASE WHEN b.Roll < 5 THEN 'CANCELLED' WHEN b.Roll < 12 THEN 'IN_PROGRESS' WHEN b.Roll < 15 THEN 'PENDING' ELSE 'COMPLETED' END
            -- Últimos 3 días: el trabajo en curso.
            ELSE CASE WHEN b.Roll < 30 THEN 'PENDING' WHEN b.Roll < 65 THEN 'IN_PROGRESS' WHEN b.Roll < 68 THEN 'CANCELLED' ELSE 'COMPLETED' END
        END AS Status
    ) AS st
    INNER JOIN #Leads AS ld ON ld.AreaId = a.AreaId AND ld.Rn = 1 + (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(b.K, '|', 53)), 1, 4) AS INT) & 2147483647) % ld.Cnt
    INNER JOIN #Team  AS tm ON tm.AreaId = a.AreaId AND tm.Rn = 1 + (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(b.K, '|', 59)), 1, 4) AS INT) & 2147483647) % tm.Cnt
    LEFT  JOIN #Team  AS tm2 ON tm2.AreaId = a.AreaId AND tm2.Rn = 1 + tm.Rn % tm.Cnt;

    -- Una tarea en curso empezó antes de hoy a esta hora (tercio del tiempo transcurrido).
    UPDATE #Plan
    SET StartedAt = DATEADD(SECOND, DATEDIFF(SECOND, CreatedAt, @Now) / 3, CreatedAt)
    WHERE StartedAt > DATEADD(MINUTE, -10, @Now);

    -- Sin responsable, una tarea no avanza: queda pendiente.
    UPDATE #Plan SET StartedAt = NULL, ClosedAt = NULL, FinalStatus = @Pending, Reassign = NULL
    WHERE AssignedTo IS NULL;

    -- Ids en orden cronológico, como en producción: INSERT ... ORDER BY garantiza el orden
    -- de la identidad, y como la tabla estaba vacía, la n-ésima tarea es la n-ésima del plan.
    INSERT INTO dbo.Tasks (Title, Description, StatusId, Priority, DueDate, CreatedBy, AssignedTo, AreaId, CreatedAt, UpdatedAt)
    SELECT Title, Description, FinalStatus, Priority, DueDate, CreatedBy,
           COALESCE(Reassign, AssignedTo), AreaId, CreatedAt, COALESCE(ClosedAt, StartedAt, CreatedAt)
    FROM #Plan
    ORDER BY CreatedAt, K;

    ;WITH Seq AS (SELECT K, ROW_NUMBER() OVER (ORDER BY CreatedAt, K) AS Rn FROM #Plan),
          Ids AS (SELECT TaskId, ROW_NUMBER() OVER (ORDER BY TaskId) AS Rn FROM dbo.Tasks)
    UPDATE p SET TaskId = i.TaskId
    FROM #Plan AS p
    INNER JOIN Seq AS q ON q.K = p.K
    INNER JOIN Ids AS i ON i.Rn = q.Rn;

    /* ---------------------------------------------------------------- Historial de estados */
    INSERT INTO dbo.TaskStatusHistory (TaskId, FromStatusId, ToStatusId, ChangedBy, ChangedAt)
    SELECT TaskId, NULL, @Pending, CreatedBy, CreatedAt FROM #Plan
    UNION ALL
    SELECT TaskId, @Pending, @InProgress, COALESCE(Reassign, AssignedTo), StartedAt
    FROM #Plan WHERE StartedAt IS NOT NULL AND FinalStatus <> @Cancelled
    UNION ALL
    SELECT TaskId, @InProgress, @Completed, COALESCE(Reassign, AssignedTo), ClosedAt
    FROM #Plan WHERE FinalStatus = @Completed
    UNION ALL
    SELECT TaskId, @Pending, @Cancelled, CreatedBy, ClosedAt
    FROM #Plan WHERE FinalStatus = @Cancelled;

    /* ---------------------------------------------------------------- Asignaciones y reasignaciones */
    INSERT INTO dbo.TaskAssignmentHistory (TaskId, FromUserId, ToUserId, ChangedBy, ChangedAt)
    SELECT TaskId, NULL, AssignedTo, CreatedBy, DATEADD(MINUTE, 3, CreatedAt)
    FROM #Plan WHERE AssignedTo IS NOT NULL
    UNION ALL
    SELECT TaskId, AssignedTo, Reassign, CreatedBy,
           -- Antes de que el nuevo responsable empiece (o 2 h después de creada, sin pasar de hoy).
           COALESCE(DATEADD(MINUTE, -5, StartedAt), LEAST(DATEADD(HOUR, 2, CreatedAt), @Now))
    FROM #Plan WHERE Reassign IS NOT NULL;

    /* ---------------------------------------------------------------- Avances */
    DECLARE @Notes TABLE (Id INT IDENTITY(0, 1), Body NVARCHAR(400));
    INSERT INTO @Notes (Body) VALUES
        (N'Se contactó al cliente; queda pendiente el envío del soporte por correo.'),
        (N'Revisado con el supervisor. Se ajusta el procedimiento y se continúa.'),
        (N'Sin respuesta en dos intentos de contacto. Se reprograma para la jornada de la tarde.'),
        (N'Se escaló al segundo nivel del cliente con el número de caso y la evidencia.'),
        (N'El cliente confirmó la información. Se cierra la gestión en el CRM.'),
        (N'Avance del 50 %: falta validar los datos con el área responsable.'),
        (N'Se envió la información al cliente para su aprobación.'),
        (N'Se documentó el hallazgo en el acta y se socializó con el equipo.'),
        (N'Pendiente respuesta del proveedor; se hace seguimiento mañana a primera hora.'),
        (N'Se validó el soporte contra el extracto: coincide el valor y la fecha.'),
        (N'Se programó la sesión con el grupo para el jueves a las 2:00 p. m.'),
        (N'Ajuste aplicado en producción y verificado con una muestra de casos.'),
        (N'El cliente solicitó ampliar el plazo; se informa al supervisor.'),
        (N'Se actualizó el tablero con la información del corte de hoy.'),
        (N'Se identificó la causa raíz y se propone plan de acción.');

    DECLARE @NoteCount INT = (SELECT COUNT(*) FROM @Notes);

    INSERT INTO dbo.TaskNotes (TaskId, Body, CreatedBy, CreatedAt)
    SELECT p.TaskId,
           n.Body,
           COALESCE(p.Reassign, p.AssignedTo),
           DATEADD(SECOND,
                   DATEDIFF(SECOND, p.StartedAt, COALESCE(p.ClosedAt, @Now)) * (v.Step * 2 + 1) / (cnt.Total * 2 + 1),
                   p.StartedAt)
    FROM #Plan AS p
    CROSS APPLY (SELECT 1 + (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(p.K, '|', 61)), 1, 4) AS INT) & 2147483647) % 3 AS Total) AS cnt
    CROSS APPLY (VALUES (0), (1), (2)) AS v (Step)
    INNER JOIN @Notes AS n ON n.Id = (CAST(SUBSTRING(HASHBYTES('SHA2_256', CONCAT(p.K, '|', v.Step, '|', 67)), 1, 4) AS INT) & 2147483647) % @NoteCount
    WHERE p.StartedAt IS NOT NULL
      AND p.FinalStatus <> @Cancelled
      AND v.Step < cnt.Total;

    COMMIT TRANSACTION;

    DECLARE @Summary NVARCHAR(200) = CONCAT(N'[demo] Cargadas ', (SELECT COUNT(*) FROM dbo.Tasks),
        N' tareas, ', (SELECT COUNT(*) FROM dbo.Users), N' personas y ', (SELECT COUNT(*) FROM dbo.Areas), N' áreas.');
    PRINT @Summary;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
