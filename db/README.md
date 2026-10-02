# Base de datos — SQL Server 2022

## Scripts (`db/scripts`, se ejecutan en orden y son idempotentes)

| Script | Contenido |
|---|---|
| `01_database.sql` | Crea la base de datos y activa `READ_COMMITTED_SNAPSHOT` (lecturas sin bloqueos) |
| `02_tables.sql` | `TaskStatuses`, `TaskStatusTransitions`, `Users`, `Tasks`, `TaskStatusHistory`, `TaskNotes`, `TaskAssignmentHistory` |
| `02a_access_control.sql` | `Permissions` (catálogo fijo), `Roles`, `RolePermissions`, `Areas`; `Users.RoleId`, `Users.AreaId`, `Tasks.AreaId`; migración desde la columna de texto `Users.Role` |
| `03_indexes.sql` | Índices justificados por las consultas reales |
| `04_views.sql` | `tvf_UserAccess` (permisos efectivos de un usuario), `vw_TaskDetails`, `vw_Users` |
| `05_procedures.sql` | Stored Procedures de tareas y estados |
| `05_procedures_access.sql` | Permisos, roles y áreas |
| `05_procedures_followup.sql` | Avances y línea de tiempo |
| `05_procedures_stats.sql` | `usp_Tasks_Stats`: indicadores del panel |
| `05_procedures_users.sql` | Stored Procedures de usuarios: login, sesión, administración y contraseñas |
| `06_seed_catalogs.sql` | Estados y transiciones permitidas |
| `07_security.sql` | Usuario de aplicación con mínimo privilegio (solo `EXECUTE`) |

`db/init/run-scripts.sh` los ejecuta con `sqlcmd -b` (se detiene ante el primer error). Lo usa el contenedor `db-init` de Docker Compose.
Las variables `$(DB_NAME)`, `$(DB_APP_USER)` y `$(DB_APP_PASSWORD)` llegan desde `.env`.

## Modelo

```
Permissions *──* Roles 1───* Users *───1 Areas
                              │  │          │
TaskStatuses 1───* Tasks *────┘  │          │
     │               │  └────────┼──────────┘ (Tasks.AreaId)
     └──* TaskStatusTransitions  │
                     ├──* TaskStatusHistory / TaskAssignmentHistory / TaskNotes
```

- Las **transiciones permitidas** son datos (`TaskStatusTransitions`), no código: agregar una regla nueva no requiere tocar ningún procedimiento.
- Cada creación y cambio de estado queda en `TaskStatusHistory` (quién, qué, cuándo), en la misma transacción.
- **Roles configurables:** un rol es una combinación de permisos del catálogo. Roles del sistema con código
  estable: `ADMIN` (Administrador, bloqueado, siempre con todos los permisos), `SUPERVISOR` y `COLLABORATOR`.

## Stored Procedures

| Procedimiento | Transacción | Errores de negocio |
|---|---|---|
| `usp_TaskStatuses_List` (incluye transiciones permitidas) | — | — |
| `usp_Tasks_List` (filtros por estado y área + alcance + paginación + `@TotalCount OUTPUT`) | — | 50400 |
| `usp_Tasks_Create` (tarea + historial; área y responsable según permisos) | ✅ | 50400, 50403 |
| `usp_Tasks_Update` (datos, responsable y área según permisos) | ✅ | 50400, 50403, 50404 |
| `usp_Tasks_ChangeStatus` (bloqueo de fila + validación + historial) | ✅ | 50400, 50404, 50409 |
| `usp_Tasks_Stats` (conteos por estado y vencimientos, por alcance y área) | — | — |
| `usp_TaskNotes_Create` (avance; solo inserción) | — | 50400, 50404 |
| `usp_Tasks_Timeline` (creación, estados, responsables y avances) | — | 50404 |
| `usp_Users_GetByUsername` / `usp_Users_GetCredentialsById` (solo activos) | — | — |
| `usp_Users_GetSessionState` (rol, área y permisos vigentes; se consulta en cada petición) | — | — |
| `usp_Users_List` (paginado) | — | 50400 |
| `usp_Users_Create` (solo hash bcrypt; rol y área válidos; sin escalada) | — | 50400, 50403, 50409 |
| `usp_Users_Update` / `usp_Users_SetActive` (sin escalada; siempre queda un Administrador activo) | ✅ | 50400, 50403, 50404, 50409 |
| `usp_Users_UpdatePassword` (restablecer exige poder gestionar al usuario) | — | 50400, 50403, 50404 |
| `usp_Users_ListAssignable` (todos o los de su área) / `usp_Users_Delete` (eliminación lógica) | ✅ | 50403, 50404, 50409 |
| `usp_Permissions_List` / `usp_Roles_List` / `usp_Areas_List` | — | — |
| `usp_Roles_Create` / `usp_Roles_Update` / `usp_Roles_Delete` | ✅ | 50400, 50403, 50404, 50409 |
| `usp_Areas_Save` (crear o editar) | — | 50400, 50404, 50409 |

**Seguimiento:** `TaskNotes` (avances) y `TaskAssignmentHistory` (cada asignación, reasignación o liberación,
incluida la que ocurre al eliminar un usuario) son tablas de solo inserción. Junto con `TaskStatusHistory`
forman la línea de tiempo de cada tarea.

**Visibilidad:** todos los SPs de tareas reciben quién opera y resuelven sus permisos con `tvf_UserAccess`:
`TASKS_VIEW_ALL` ve todo, `TASKS_VIEW_AREA` ve su área, y cualquiera ve lo asignado a él o creado por él.
Una tarea no visible responde 50404. Índices de apoyo: `IX_Tasks_AreaId_StatusId_CreatedAt`,
`IX_Tasks_AssignedTo_StatusId_CreatedAt` e `IX_Tasks_CreatedBy_StatusId_CreatedAt`.

**Sin escalada de privilegios** (`tvf_RolePermissionsNotHeld`): nadie asigna un rol ni otorga permisos que
no tiene, ni gestiona a un usuario con más permisos, ni edita su propio rol. Decisiones en
[ADR 0002](../docs/adr/0002-control-de-acceso-y-eliminacion-de-usuarios.md) y
[ADR 0003](../docs/adr/0003-roles-configurables-y-areas.md).

Todos usan `SET NOCOUNT ON`, `SET XACT_ABORT ON` y `TRY/CATCH` con `ROLLBACK` + `THROW`.

## Índice principal — evidencia

**Consulta que optimiza:** el listado filtrado por estado y paginado de `usp_Tasks_List`:

```sql
SELECT TaskId, CreatedAt FROM dbo.Tasks
WHERE StatusId = @StatusId
ORDER BY CreatedAt DESC, TaskId DESC
OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
```

**Índice:** `IX_Tasks_StatusId_CreatedAt (StatusId, CreatedAt DESC, TaskId DESC) INCLUDE (AreaId, AssignedTo, CreatedBy)` (las columnas incluidas son las del filtro de visibilidad por permisos).

Medido con **200 000 tareas** (página 50, 10 filas por página, estado `COMPLETED`):

| | Operador del plan | Lecturas lógicas |
|---|---|---|
| Con el índice | `Index Seek … ORDERED FORWARD` (sin Sort) | **8** |
| Sin el índice (forzando el clustered) | Scan completo + Sort | **2 135** |

**Cómo verificar que SQL Server usa el índice:**
1. Plan de ejecución real (en SSMS, Ctrl+M) o `SET STATISTICS XML ON`: debe aparecer `Index Seek` sobre `IX_Tasks_StatusId_CreatedAt` y ningún operador `Sort`.
2. `SET STATISTICS IO ON`: comparar las lecturas lógicas con y sin el índice (`WITH (INDEX(PK_Tasks))`).
3. En producción: `sys.dm_db_index_usage_stats` (`user_seeks` creciendo) y Query Store para el plan de `usp_Tasks_List`.

## Pruebas realizadas

Conectado como el usuario de aplicación (no SA), todos los casos devolvieron lo esperado:
- `SELECT` directo a una tabla → error 229 (permiso denegado). Solo puede ejecutar SPs.
- Contraseña en texto plano rechazada (50400). Usuario duplicado sin importar mayúsculas (50409).
- Título vacío, prioridad inválida o usuario inexistente → 50400.
- Transiciones: válidas OK; desde un estado final, al mismo estado o saltos no permitidos → 50409; tarea inexistente → 50404.
- Ninguna transacción queda abierta después de un error (`@@TRANCOUNT = 0`).
- Paginación y totales correctos con y sin filtro; página 0, `pageSize` 500 o estado inexistente → 50400.
- Los scripts se ejecutaron dos veces seguidas sin errores (idempotencia).
