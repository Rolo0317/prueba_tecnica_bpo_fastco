# ADR 0002 — Control de acceso por tarea y eliminación de usuarios

- **Estado:** Aceptada
- **Fecha:** 2026-10-01

## Contexto
Se pidió que las tareas se puedan asignar a usuarios, que un agente solo vea las tareas asignadas a él y
las que él creó, que el administrador vea y gestione todas, y que el administrador pueda eliminar usuarios.
La operación de un BPO maneja información de clientes (ISO 27001, Ley 1581 de Habeas Data): el control de
acceso no puede depender solo de la interfaz.

## Decisiones

| # | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| 1 | Columna `Tasks.AssignedTo` (NULL = sin asignar), un solo responsable por tarea | Tabla N:M de responsables | Cubre el caso de uso con un modelo simple; N:M queda como evolución |
| 2 | La visibilidad se aplica **en la API y también en los Stored Procedures** (`@ViewerId`) | Filtrar solo en el frontend o solo en la API | Defensa en profundidad: aunque se llame al SP saltándose la API, un agente no ve tareas ajenas |
| 3 | Tarea no visible → **404**, no 403 | Responder 403 | No revela que la tarea existe |
| 4 | Permisos: ADMIN ve, crea, edita, asigna y reasigna todo. AGENT ve lo asignado o creado por él, crea tareas (quedan asignadas a él), edita solo las que creó y no reasigna | El agente edita todo lo que ve | El responsable de una tarea asignada por un supervisor no debe poder cambiar su definición |
| 5 | Índices `(AssignedTo, StatusId, CreatedAt, TaskId)` y `(CreatedBy, StatusId, CreatedAt, TaskId)` | Un solo índice | El filtro del agente es un OR de dos columnas: con un índice por condición SQL Server combina dos Index Seek en lugar de recorrer la tabla |
| 6 | **Eliminación lógica** de usuarios (`Users.DeletedAt`) | `DELETE` físico | Las FK de tareas e historial apuntan al usuario; borrarlo obligaría a perder o falsear la auditoría. El usuario eliminado no inicia sesión, no aparece en la administración ni como responsable posible |
| 7 | Al eliminar, sus tareas **abiertas** quedan sin asignar; las cerradas conservan el responsable | Reasignar automáticamente | El administrador decide a quién reasignar; el historial de lo ya cerrado se mantiene intacto |
| 8 | Nadie se elimina a sí mismo y siempre queda ≥1 administrador activo (conteo con `UPDLOCK, HOLDLOCK`) | Validar solo en la interfaz | Evita dejar el sistema sin administración, también ante dos operaciones simultáneas |
| 9 | La sesión se **revalida en cada petición** contra la BD (usuario activo, rol vigente y "versión" de contraseña en el token) | Confiar solo en el JWT hasta que expire | Desactivar, eliminar, cambiar el rol o la contraseña tiene efecto inmediato y no hasta 1 h después. Costo: una lectura por clave primaria por petición |

## Consecuencias
- (+) Un agente nunca recibe datos de tareas ajenas: ni en el listado, ni en los indicadores, ni al editar o cambiar estado.
- (+) La trazabilidad se conserva aunque se eliminen usuarios.
- (−) El nombre de usuario de un usuario eliminado sigue reservado (no se puede reutilizar). Es intencional para que la auditoría no sea ambigua.
- (+) Actualización: los cambios de responsable se registran en `TaskAssignmentHistory` y se muestran en el seguimiento de la tarea, junto con los avances (`TaskNotes`) y los cambios de estado.
