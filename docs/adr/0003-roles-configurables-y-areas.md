# ADR 0003 — Roles configurables, permisos y áreas

- **Estado:** Aceptada (reemplaza los roles fijos `ADMIN` / `AGENT` del ADR 0002, decisión #4)
- **Fecha:** 2026-10-01

## Contexto
La aplicación pasó a ser de uso general para cualquier área. Con dos roles fijos no se podía expresar
"un supervisor que ve y asigna las tareas de su equipo" ni crear roles nuevos sin cambiar código. Se pidió
asignar rol y área al crear un usuario (creando el área en el mismo formulario) y definir los permisos de
cada rol desde la aplicación.

## Decisiones

| # | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| 1 | **Catálogo fijo de permisos** (`Permissions`) y **roles configurables** como combinación de permisos (`Roles`, `RolePermissions`) | Permisos creados por el usuario | Un permiso solo tiene sentido si el código lo hace cumplir; lo configurable es la combinación |
| 2 | Permisos de alcance (`TASKS_VIEW_ALL`, `TASKS_VIEW_AREA`) y de acción (`TASKS_EDIT_ANY`, `TASKS_ASSIGN`, `USERS_MANAGE`, `AREAS_MANAGE`, `ROLES_MANAGE`). Sin permisos: lo asignado a él y lo que creó | Un permiso por endpoint | Pocos permisos con significado de negocio son entendibles para quien administra |
| 3 | Un usuario tiene **un rol y un área** (opcional); una tarea pertenece a un área | Varias áreas por persona | Cubre el caso de uso; `UserAreas` queda como evolución sin cambiar el resto (decisión #4) |
| 4 | Función en línea `dbo.tvf_UserAccess(@UserId)` como **única fuente de autorización en SQL**; todos los SPs reciben quién opera (`@ViewerId` / `@ActorId`) | Pasar banderas desde la API | La BD no confía en lo que diga la API: resuelve los permisos ella misma (defensa en profundidad). Al ser *inline*, el optimizador la expande sin costo de función escalar |
| 5 | Rol, área y permisos **no viajan en el JWT**: se leen en cada petición (`usp_Users_GetSessionState`) y el frontend los refresca con `GET /account/me` | Permisos en el token | Un cambio de rol o de los permisos de un rol aplica de inmediato. El token solo identifica (id + versión de contraseña) |
| 6 | **Sin escalada de privilegios**, validado en el SP: no otorgar permisos que uno no tiene (al crear/editar roles o asignar un rol), no gestionar a usuarios con más permisos, no editar el propio rol | Validar solo en la interfaz | Un usuario con `USERS_MANAGE` no puede crearse un Administrador ni restablecerle la contraseña |
| 7 | Rol **Administrador bloqueado**: siempre tiene todos los permisos (incluidos los que se agreguen) y no se edita ni se elimina; siempre queda ≥1 Administrador activo | Un rol administrador editable | Evita dejar el sistema sin administración |
| 8 | Roles del sistema con `Code` estable (`ADMIN`, `SUPERVISOR`, `COLLABORATOR`); los creados tienen `Code = NULL` y solo se eliminan si nadie los tiene | Identificar roles por nombre | El nombre es editable; el código no. El seed y las reglas usan el código |
| 9 | Sin `TASKS_VIEW_ALL`, la tarea se crea en el área de quien la crea y solo se asigna a personas de su área | Elegir libremente | Un supervisor no puede "empujar" tareas a otras áreas |
| 10 | Migración idempotente en `02a_access_control.sql`: la columna de texto `Users.Role` pasa a `Users.RoleId` (`ADMIN` → Administrador, `AGENT` → Colaborador) | Recrear la base | Las bases existentes se actualizan con el mismo `docker compose up` |
| 11 | Índice `IX_Tasks_AreaId_StatusId_CreatedAt` con la misma forma que el índice principal | Reutilizar el de estado | El listado de un supervisor (y el filtro por área) hace Index Seek por área y estado sin Sort |
| 12 | El área se puede **escribir en el formulario de usuario** y se crea al guardar (solo con `AREAS_MANAGE`) | Ir primero a la pantalla de áreas | Menos pasos para quien da de alta a una persona de un equipo nuevo |

## Consecuencias
- (+) Se pueden crear roles nuevos (p. ej. "Auditor" que solo ve todo) sin tocar código ni base.
- (+) El alcance de cada persona se decide en un solo lugar en SQL (`tvf_UserAccess`) y en un solo lugar en la API (`can()` / `requirePermission`).
- (−) Una lectura extra por petición para cargar los permisos (búsqueda por clave primaria, de costo despreciable). Con mucho tráfico se cachearía unos segundos en Redis.
- (−) Un permiso nuevo requiere código (API, SP y UI). Es intencional: ver decisión #1.
