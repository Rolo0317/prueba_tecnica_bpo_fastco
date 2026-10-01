# Base de datos — SQL Server 2022

## Scripts (`db/scripts`, se ejecutan en orden y son idempotentes)

| Script | Contenido |
|---|---|
| `01_database.sql` | Crea la base de datos y activa `READ_COMMITTED_SNAPSHOT` (lecturas sin bloqueos) |
| `02_tables.sql` | `TaskStatuses`, `TaskStatusTransitions`, `Users`, `Tasks`, `TaskStatusHistory` |
| `03_indexes.sql` | Índices justificados por las consultas reales |
| `04_views.sql` | `vw_TaskDetails`: proyección única de una tarea (la reutilizan todos los SPs) |
| `05_procedures.sql` | Stored Procedures de la aplicación |
| `06_seed_catalogs.sql` | Estados y transiciones permitidas |
| `07_security.sql` | Usuario de aplicación con mínimo privilegio (solo `EXECUTE`) |

`db/init/run-scripts.sh` los ejecuta con `sqlcmd -b` (se detiene ante el primer error). Lo usa el contenedor `db-init` de Docker Compose.
Las variables `$(DB_NAME)`, `$(DB_APP_USER)` y `$(DB_APP_PASSWORD)` llegan desde `.env`.

## Modelo

```
TaskStatuses 1───* Tasks *───1 Users
     │                │            │
     └──* TaskStatusTransitions    │
                      │            │
                      └──* TaskStatusHistory *──┘
```

- Las **transiciones permitidas** son datos (`TaskStatusTransitions`), no código: agregar una regla nueva no requiere tocar ningún procedimiento.
- Cada creación y cambio de estado queda en `TaskStatusHistory` (quién, qué, cuándo), en la misma transacción.

## Stored Procedures

| Procedimiento | Transacción | Errores de negocio |
|---|---|---|
| `usp_Users_GetByUsername` | — | — |
| `usp_Users_Create` (solo acepta hash bcrypt) | — | 50400, 50409 |
| `usp_TaskStatuses_List` (incluye transiciones permitidas) | — | — |
| `usp_Tasks_List` (filtro + paginación + `@TotalCount OUTPUT`) | — | 50400 |
| `usp_Tasks_Create` (tarea + historial) | ✅ | 50400 |
| `usp_Tasks_ChangeStatus` (bloqueo de fila + validación + historial) | ✅ | 50400, 50404, 50409 |

Todos usan `SET NOCOUNT ON`, `SET XACT_ABORT ON` y `TRY/CATCH` con `ROLLBACK` + `THROW`.

## Índice principal — evidencia

**Consulta que optimiza:** el listado filtrado por estado y paginado de `usp_Tasks_List`:

```sql
SELECT TaskId, CreatedAt FROM dbo.Tasks
WHERE StatusId = @StatusId
ORDER BY CreatedAt DESC, TaskId DESC
OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
```

**Índice:** `IX_Tasks_StatusId_CreatedAt (StatusId, CreatedAt DESC, TaskId DESC)`.

Medido con **200 000 tareas** (página 50, 10 filas por página, estado `COMPLETED`):

| | Operador del plan | Lecturas lógicas |
|---|---|---|
| Con el índice | `Index Seek … ORDERED FORWARD` (sin Sort) | **7** |
| Sin el índice (forzando el clustered) | Scan completo + Sort | **2 368** |

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
