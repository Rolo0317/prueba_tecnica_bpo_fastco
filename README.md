# Gestor de Tareas Operativas

[![CI](https://github.com/Rolo0317/prueba_tecnica_bpo_fastco/actions/workflows/ci.yml/badge.svg)](https://github.com/Rolo0317/prueba_tecnica_bpo_fastco/actions/workflows/ci.yml)

Aplicación fullstack para que **cualquier área o equipo** (operaciones, TI, talento humano, finanzas, calidad…)
gestione sus tareas de forma ordenada: los usuarios inician sesión, ven las tareas con filtro por estado y
paginación, crean tareas nuevas y cambian su estado.
Cada cambio queda registrado en un historial de auditoría. Las tareas pertenecen a **áreas** y se **asignan a
responsables**. El acceso es **configurable**: los roles se arman con permisos (ver todas las tareas, las del
área, editar, asignar, administrar usuarios, áreas o roles) y a cada usuario se le asigna un rol y un área.
Cada tarea tiene un **seguimiento**: línea de tiempo con avances, cambios de estado y de responsable. Incluye
panel de indicadores (por área, con tiempo promedio de cierre), buscadores y filtros, login protegido
(captcha propio "No soy un robot" y límite de intentos visible), recuperación de contraseña por correo y
modo claro/oscuro. Arranca con **datos de un BPO en operación** (17 áreas, 55 personas, ~4 meses de tareas).

**Stack:** Vue 3 (Composition API) + Vuetify · Node.js + Express + TypeScript · SQL Server 2022 · Docker Compose · Linux

| Login | Tareas e indicadores | Modo oscuro |
|---|---|---|
| ![Login](docs/images/login.webp) | ![Tareas e indicadores](docs/images/tareas.webp) | ![Modo oscuro](docs/images/oscuro.webp) |

| Administración de usuarios | Móvil |
|---|---|
| ![Usuarios](docs/images/usuarios.webp) | ![Vista móvil](docs/images/movil.webp) |

---

## Contenido

1. [Ejecución en Linux](#1-ejecución-en-linux)
2. [Arquitectura](#2-arquitectura)
3. [Base de datos](#3-base-de-datos)
4. [API REST](#4-api-rest)
5. [Frontend](#5-frontend)
6. [Seguridad](#6-seguridad)
7. [Pruebas](#7-pruebas)
8. [Desarrollo local sin Docker](#8-desarrollo-local-sin-docker)
9. [Respuestas a las preguntas](#9-respuestas-a-las-preguntas)

---

## 1. Ejecución en Linux

### Requisitos

- Docker Engine 24+ con el plugin **Docker Compose v2** (`docker compose version`).
- CPU **x86_64** y al menos **2 GB de RAM libres** (requisito de SQL Server).
  En ARM (Apple Silicon, Raspberry Pi) la imagen de SQL Server corre emulada y arranca más lento.
- Puerto **8080** libre (configurable con `FRONTEND_PORT`).

### Pasos

```bash
git clone https://github.com/Rolo0317/prueba_tecnica_bpo_fastco.git
cd prueba_tecnica_bpo_fastco

# 1. Variables de entorno (plantilla documentada, sin secretos reales)
cp .env.example .env
#    Opcional pero recomendado: reemplazar los valores "cambiar_..." de .env, por ejemplo:
#    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48)|" .env

# 2. Levantar todo (base de datos, inicialización, API y frontend)
docker compose up --build -d

# 3. Verificar que todo quedó sano (db-init termina con "Exited (0)", es normal)
docker compose ps
```

Abrir **http://localhost:8080** e iniciar sesión con el usuario demo definido en `.env`
(`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`; con la plantilla: `admin` / `cambiar_Admin123!`).

El primer arranque tarda 1–2 minutos (descarga de imágenes y arranque de SQL Server).

### Datos de demostración (un BPO en operación)

Con `SEED_DEMO_DATA=true` (valor de la plantilla), la base nace con 17 áreas reales de un contact center
(Operaciones, Back Office, Calidad, Formación, WFM, Innovación, Cartera, Retención, Experiencia del Cliente…),
roles configurados (Gerente de operaciones, Supervisor, Analista de calidad, Formador, Analista WFM, Agente…),
55 personas y 460 tareas de los últimos 4 meses con su historial completo: asignaciones, reasignaciones,
756 avances, cierres y cancelaciones con tiempos creíbles por área. Los clientes y campañas son ficticios.

Todas las cuentas demo usan la contraseña `SEED_DEMO_PASSWORD` (en la plantilla: `cambiar_Demo2026`).
Sin esa variable quedan bloqueadas: ninguna contraseña está escrita en el repositorio.

| Usuario | Rol · área | Qué permite ver |
|---|---|---|
| `sandra.mejia` | Gerente de operaciones | Todas las áreas: ve, edita y asigna |
| `laura.gomez` | Supervisor · Calidad | Las tareas de Calidad y su equipo |
| `alejandro.franco` | Líder de innovación · Innovación | Todas las áreas; asigna proyectos transversales |
| `camila.vargas` | Analista de calidad | Todas las áreas (solo consulta) |
| `claudia.hoyos` | Gestor de talento humano | Administra usuarios, sin poder crear administradores |
| `kevin.zapata` | Agente · Operaciones | Solo lo asignado a él y lo que crea |

### Correo de pruebas (recuperar contraseña)

"¿Olvidaste tu contraseña?" envía un enlace de un solo uso. En local, los correos llegan a **Mailpit**
(servidor de pruebas incluido en el compose): **http://localhost:8025**. En producción se configura el SMTP
corporativo con `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASSWORD`.

### Qué ocurre al ejecutar `docker compose up`

```
db (SQL Server) ──healthy──▶ db-init (crea BD, tablas, índices, SPs, catálogos, datos demo y usuario de app)
                                  │ completed_successfully
                                  ▼
            mail (Mailpit) ──▶ backend (API) ──healthy──▶ frontend (nginx :8080)
```

1. **db**: SQL Server 2022 con volumen persistente y healthcheck.
2. **db-init**: ejecuta en orden los scripts de `db/scripts` con `sqlcmd`. Son **idempotentes**: se ejecutan en cada arranque sin duplicar nada.
3. **backend**: la API se conecta con un **usuario de mínimo privilegio** (nunca SA), crea el administrador (contraseña con bcrypt) y activa las cuentas demo con `SEED_DEMO_PASSWORD`.
4. **mail**: Mailpit, servidor de correo de pruebas (solo en la máquina local).
5. **frontend**: nginx sirve la aplicación y hace de proxy de `/api` hacia la API.

Solo se publican el frontend (8080) y la bandeja de Mailpit (8025, solo en `127.0.0.1`): la base de datos y la API
quedan en la red interna de Docker.

### Comandos útiles

| Acción | Comando |
|---|---|
| Ver logs | `docker compose logs -f backend` |
| Detener (conserva los datos) | `docker compose down` |
| Reiniciar desde cero (borra la BD) | `docker compose down -v && docker compose up --build -d` |
| Probar la API | ver [ejemplos con curl](#ejemplos-con-curl) |

---

## 2. Arquitectura

```
db/            Scripts SQL numerados (idempotentes) + script de inicialización
backend/       API REST · Express 5 + TypeScript · patrón MVC por módulos
frontend/      SPA · Vue 3 + Vuetify 4 · patrón MVVM por módulos · nginx
e2e/           Pruebas end-to-end (Playwright) contra el entorno de Docker
docs/adr/      Decisiones de arquitectura
docker-compose.yml · .env.example
```

### Backend — MVC por capas, modular por funcionalidad

```
routes → controller → service → repository → Stored Procedure
```

| Capa | Responsabilidad | Ejemplo |
|---|---|---|
| Routes | Rutas, middlewares y validación | `task.routes.ts` |
| Controller | Solo HTTP: lee la petición validada y responde | `task.controller.ts` |
| Service | Casos de uso | `task.service.ts` |
| Repository (Model) | Ejecuta SPs con parámetros tipados | `task.repository.ts` |
| Mapper (View) | Forma del JSON de respuesta | `task.mapper.ts` |

- `container.ts` es el *composition root*: único lugar donde se crean las implementaciones concretas (inyección de dependencias → todo es testeable sin base de datos).
- `database/procedure-executor.ts` es el **único punto** que habla con SQL Server.
- `config/env.ts` valida todas las variables de entorno con zod al iniciar; si falta algo, la API no arranca.

### Frontend — MVVM

| Capa | Responsabilidad | Ejemplo |
|---|---|---|
| Model | Llamadas HTTP tipadas | `services/taskService.ts` |
| ViewModel | Estado reactivo, carga, errores, acciones | `composables/useTasks.ts` |
| View | Solo presentación | `components/TaskTable.vue` |

Las decisiones y sus alternativas están en [docs/adr/0001](docs/adr/0001-arquitectura-general.md),
[docs/adr/0002](docs/adr/0002-control-de-acceso-y-eliminacion-de-usuarios.md),
[docs/adr/0003](docs/adr/0003-roles-configurables-y-areas.md) y
[docs/adr/0004](docs/adr/0004-proteccion-del-login-y-recuperacion-de-contrasena.md).

### Áreas, roles y permisos

Cada usuario tiene **un rol y (opcionalmente) un área**; cada tarea pertenece a un área. Un rol es una
combinación de permisos de un catálogo fijo (cada permiso lo hace cumplir el código):

| Permiso | Qué habilita |
|---|---|
| `TASKS_VIEW_ALL` | Ver las tareas de todas las áreas (y elegir o cambiar el área de una tarea) |
| `TASKS_VIEW_AREA` | Ver las tareas de su área |
| `TASKS_EDIT_ANY` | Editar cualquier tarea que pueda ver (sin él, solo las que creó) |
| `TASKS_ASSIGN` | Asignar o reasignar responsables (sin `TASKS_VIEW_ALL`, solo a personas de su área) |
| `USERS_MANAGE` | Crear, editar, desactivar, eliminar usuarios y restablecer contraseñas |
| `AREAS_MANAGE` | Crear, editar y desactivar áreas |
| `ROLES_MANAGE` | Crear y editar roles y sus permisos |

Sin ningún permiso, una persona ve y gestiona las tareas asignadas a ella y las que creó. Roles iniciales:

| Acción | Administrador | Supervisor | Colaborador |
|---|---|---|---|
| Ver tareas e indicadores | Todas las áreas | Las de su área + las suyas | Las asignadas a él y las que creó |
| Crear tareas | Sí, eligiendo área y responsable | En su área, asignándolas a su equipo | Sí; quedan asignadas a él, en su área |
| Editar tareas | Cualquiera | Las de su área | Solo las que creó |
| Cambiar estado / registrar avances | Las que ve | Las que ve | Las que ve |
| Administrar usuarios, áreas y roles | Sí | No | No |
| Cambiar su propia contraseña | Sí | Sí | Sí |

- **Administrador** está protegido: siempre tiene todos los permisos y no se edita ni se elimina. Supervisor y
  Colaborador son editables, y se pueden crear roles nuevos (p. ej. "Auditor" con solo `TASKS_VIEW_ALL`).
- **Sin escalada de privilegios:** nadie otorga permisos que no tiene, ni gestiona a alguien con más permisos,
  ni edita su propio rol; siempre queda al menos un Administrador activo.
- Rol, área y permisos se leen de la BD **en cada petición**: un cambio aplica de inmediato, sin volver a iniciar sesión.
- Todo se valida en la API **y** en los Stored Procedures (defensa en profundidad). Una tarea que alguien no
  puede ver responde 404, para no revelar que existe.

---

## 3. Base de datos

Detalle completo, modelo y evidencia del índice en [db/README.md](db/README.md).

| Script | Contenido |
|---|---|
| `01_database.sql` | Base de datos + `READ_COMMITTED_SNAPSHOT` (las lecturas no bloquean escrituras) |
| `02_tables.sql` | `Tasks`, `TaskStatuses`, `TaskStatusTransitions`, `Users`, `TaskStatusHistory`, `TaskNotes`, `TaskAssignmentHistory` |
| `02a_access_control.sql` | `Permissions` (catálogo), `Roles`, `RolePermissions`, `Areas` + migración idempotente desde el rol de texto anterior |
| `03_indexes.sql` | Índices justificados por las consultas reales |
| `04_views.sql` | `tvf_UserAccess` (permisos efectivos de un usuario: fuente única de autorización en SQL), `vw_TaskDetails`, `vw_Users` |
| `05_procedures.sql` | Stored Procedures de tareas y estados |
| `05_procedures_access.sql` | Permisos, roles (sin escalada de privilegios) y áreas |
| `05_procedures_followup.sql` | Avances y línea de tiempo de una tarea |
| `05_procedures_users.sql` | Stored Procedures de usuarios (login, sesión, administración, contraseñas) |
| `05_procedures_stats.sql` | Estadísticas para los indicadores |
| `06_seed_catalogs.sql` | Estados y transiciones permitidas |
| `07_security.sql` | Usuario de aplicación con permiso **solo de EXECUTE** |

**Stored Procedures:** todos con `SET NOCOUNT ON`, `SET XACT_ABORT ON` y `TRY/CATCH` (`ROLLBACK` + `THROW`).

| SP | Transacción | Qué hace |
|---|---|---|
| `usp_Tasks_List` | — | Filtros opcionales por estado y área + alcance según permisos + paginación `OFFSET/FETCH` + total (`OUTPUT`) |
| `usp_Tasks_Create` | ✅ | Crea la tarea en `PENDING` (área y responsable según permisos) y registra el historial |
| `usp_Tasks_Update` | ✅ | Edita datos, responsable y área según permisos (50403 si no corresponde) y registra la reasignación |
| `usp_TaskNotes_Create` | — | Registra un avance (solo inserción: no se edita ni se borra) |
| `usp_Tasks_Timeline` | — | Línea de tiempo: creación, estados, responsables y avances en orden cronológico |
| `usp_Tasks_ChangeStatus` | ✅ | Bloquea la fila (`UPDLOCK`), valida existencia y transición, actualiza e inserta historial |
| `usp_TaskStatuses_List` | — | Catálogo de estados con sus transiciones permitidas |
| `usp_Tasks_Stats` | — | Conteo por estado (incluye estados en 0), vencidas, que vencen hoy y alta prioridad abiertas |
| `usp_Users_GetByUsername` / `usp_Users_GetCredentialsById` | — | Login y verificación de la contraseña actual (solo usuarios activos) |
| `usp_Users_List` / `usp_Users_Create` | — | Listado paginado y alta (solo acepta hashes bcrypt) |
| `usp_Users_Update` / `usp_Users_SetActive` | ✅ | Edición (nombre, rol, área) y activación: sin escalada de privilegios, nadie se desactiva ni se cambia el rol a sí mismo y siempre queda un Administrador activo (conteo con `UPDLOCK, HOLDLOCK` contra condiciones de carrera) |
| `usp_Roles_Create` / `usp_Roles_Update` / `usp_Roles_Delete` | ✅ | Roles como combinación de permisos; Administrador bloqueado; solo se elimina un rol creado y sin usuarios |
| `usp_Areas_List` / `usp_Areas_Save` | — | Áreas con conteo de personas y tareas abiertas; crear, editar, activar/desactivar |
| `usp_Users_UpdatePassword` | — | Cambio o restablecimiento de contraseña (registra `PasswordChangedAt`) |

**Reglas de negocio en datos:** las transiciones permitidas están en la tabla `TaskStatusTransitions`
(`Pendiente → En progreso | Cancelada`, `En progreso → Pendiente | Completada | Cancelada`; `Completada` y `Cancelada` son finales).
El SP las valida y el frontend las lee de la API: la regla existe en un solo lugar.

Los errores de negocio se lanzan con `THROW 50400 | 50403 | 50404 | 50409` y la API los traduce a HTTP 400 / 403 / 404 / 409.

---

## 4. API REST

Base: `/api/v1`. Todas las rutas de tareas requieren `Authorization: Bearer <token>`.

| Método | Ruta | Éxito | Errores |
|---|---|---|---|
| `GET` | `/auth/captcha` (desafío "No soy un robot") | 200 `{ enabled, challenge, salt, maxNumber, signature }` | — |
| `POST` | `/auth/login` `{ username, password, captcha }` | 200 `{ token, tokenType, expiresIn, user }` | 400 · 401 (`meta.attemptsRemaining`) · 429 (`meta.retryAfterSeconds`) |
| `POST` | `/auth/password-reset-requests` `{ username, captcha }` (usuario o correo) | 202 (misma respuesta exista o no la cuenta) | 400 · 429 |
| `POST` | `/auth/password-resets` `{ token, newPassword }` (enlace del correo) | 204 | 400 · 429 |
| `GET` | `/tasks?status=&areaId=&priority=&search=&page=&pageSize=` | 200 `{ data, pagination }` | 400 · 401 |
| `POST` | `/tasks` `{ title, description?, priority, dueDate?, assignedTo?, areaId? }` | 201 + cabecera `Location` | 400 · 401 · 403 |
| `PATCH` | `/tasks/:id` (editar; `assignedTo` con `TASKS_ASSIGN`, `areaId` con `TASKS_VIEW_ALL`) | 200 | 400 · 401 · 403 · 404 |
| `PATCH` | `/tasks/:id/status` | 200 | 400 · 401 · 404 · 409 |
| `GET` | `/tasks/:id/timeline` (seguimiento) | 200 `TimelineEvent[]` | 401 · 404 |
| `POST` | `/tasks/:id/notes` `{ body }` (registrar avance) | 201 | 400 · 401 · 404 |
| `GET` | `/tasks/stats?today=AAAA-MM-DD&areaId=` | 200 `{ total, overdue, dueToday, highPriorityOpen, byStatus }` | 400 · 401 |
| `GET` | `/task-statuses` | 200 | 401 |
| `GET` | `/account/me` (rol, área y permisos vigentes) | 200 | 401 |
| `PUT` | `/account/password` (cualquier rol) | 200 sesión nueva `{ token, … }` (las demás quedan cerradas) | 400 · 401 · 429 |
| `GET` | `/users?search=&roleId=&areaId=&status=&pendingReset=&page=&pageSize=` (`USERS_MANAGE`) | 200 | 401 · 403 |
| `POST` | `/users` `{ username, fullName, roleId, areaId?, password }` (`USERS_MANAGE`) | 201 | 400 · 403 · 409 |
| `GET` | `/users/assignable` (`TASKS_ASSIGN`; todos o los de su área) | 200 | 401 · 403 |
| `DELETE` | `/users/:id` (`USERS_MANAGE`, eliminación lógica) | 200 `{ unassignedTasks }` | 403 · 404 · 409 |
| `PATCH` | `/users/:id` `{ fullName, roleId, areaId? }` · `/users/:id/status` (`USERS_MANAGE`) | 200 | 400 · 403 · 404 · 409 |
| `PUT` | `/users/:id/password` (`USERS_MANAGE`, restablecer) | 204 | 400 · 403 · 404 |
| `GET` | `/roles` (`USERS_MANAGE` o `ROLES_MANAGE`) · `/permissions` (`ROLES_MANAGE`) | 200 | 401 · 403 |
| `POST` · `PUT` · `DELETE` | `/roles` · `/roles/:id` `{ name, description?, permissions[] }` (`ROLES_MANAGE`) | 201 · 200 · 204 | 400 · 403 · 404 · 409 |
| `GET` | `/areas?includeInactive=` (cualquier usuario autenticado) | 200 | 401 |
| `POST` · `PATCH` | `/areas` · `/areas/:id` (`AREAS_MANAGE`) | 201 · 200 | 400 · 403 · 404 · 409 |
| `GET` | `/health` | 200 / 503 | — |

Formato único de error:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Los datos enviados no son válidos.",
  "details": [{ "field": "title", "message": "El título es obligatorio." }] } }
```

### Ejemplos con curl

```bash
BASE=http://localhost:8080/api/v1
TOKEN=$(curl -s -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"cambiar_Admin123!"}' $BASE/auth/login | sed -E 's/.*"token":"([^"]+)".*/\1/')

# Listar tareas pendientes (página 1, 5 por página)
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/tasks?status=PENDING&page=1&pageSize=5"

# Crear una tarea
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Devolver llamada a cliente","priority":"HIGH","dueDate":"2026-12-15"}' $BASE/tasks

# Cambiar su estado (usar el id devuelto)
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"IN_PROGRESS"}' $BASE/tasks/1/status
```

---

## 5. Frontend

- **Composables propios:** `useAsyncState` (patrón loading/error reutilizable que ignora respuestas viejas),
  `useFormSubmit` (envío con errores del servidor por campo), `useTasks` (listado, filtros en la URL, creación,
  cambio de estado), `useTaskStats`, `useTaskStatuses`, `useTaskForm`, `useUsers`, `useUserForm`, `useRoles`, `useAreas`,
  `useChangePassword`, `useLoginForm`, `useThemeMode`, `useNotifier`.
- **Indicadores:** un círculo "líquido" por estado (SVG + CSS, el nivel del agua es el porcentaje) más KPI de total,
  vencidas, que vencen hoy y prioridad alta abiertas. Hacer clic en un círculo filtra la tabla. Se calculan en SQL
  con la fecha local del usuario y se actualizan al crear o cambiar una tarea.
- **Seguimiento:** al hacer clic en el título de una tarea se abre un panel lateral con su resumen (estado, prioridad,
  responsable, "vence en 2 días"), un campo para registrar avances y la línea de tiempo (lo más reciente arriba).
  La fila muestra cuántos avances tiene.
- **Áreas y asignación:** columnas "Responsable" y "Área", filtro por área (en la URL; los indicadores se recalculan
  para esa área), selectores con búsqueda en el formulario según los permisos, y edición desde la fila.
- **Usuarios:** crear con **rol y área** (si el área no existe, se escribe y se crea al guardar), editar,
  activar/desactivar, **eliminar** (con confirmación) y restablecer contraseñas. Los roles con permisos que quien
  administra no tiene aparecen deshabilitados. **Cualquier usuario** cambia su propia contraseña desde su menú.
- **Roles y permisos:** tarjetas por rol con sus permisos y cuántas personas lo tienen; formulario con los permisos
  agrupados y descritos. **Áreas:** tabla con personas y tareas abiertas por área.
- **Menú según permisos:** cada sección aparece solo si el rol la permite (y la ruta también lo exige); en móvil
  la navegación queda en íconos con `aria-label`. Los permisos se refrescan al entrar (`/account/me`).
- **Modo claro / oscuro:** botón en la barra y en el login; recuerda la elección y, si no hay, usa la del sistema.
  El tema oscuro ajusta los colores de marca para mantener contraste AA.
- **Estados visibles:** esqueleto de carga, barra de progreso al recargar, error con botón *Reintentar*, estado vacío con acción, botones con *loading* y avisos de confirmación.
- **Buscadores y filtros:** tareas por título, estado, prioridad y área (en la URL: `/tasks?q=llamada&priority=HIGH&page=2`,
  se pueden compartir y sobreviven a una recarga); usuarios por nombre, usuario o correo, rol, área, estado y
  solicitudes de contraseña pendientes; áreas por nombre y estado. Los buscadores esperan a que se deje de
  escribir (*debounce*) para no enviar una petición por tecla.
- **Prioridad con semáforo:** rojo (alta), ámbar (media), verde (baja), con ícono, texto y una guía de qué significa cada una.
- **Desempeño por área:** abiertas, vencidas, cerradas en 30 días y tiempo promedio de cierre; clic en un área para filtrar.
- **Login:** captcha "No soy un robot", intentos restantes ("Te quedan 3 intentos") y bloqueo temporal con cuenta
  regresiva; "¿Olvidaste tu contraseña?" con enlace por correo y página para crear la contraseña nueva.
- **Accesibilidad:** cada estado se muestra con ícono + texto (no solo color), `aria-label` en botones de ícono, `aria-pressed` en el filtro, enlace "Saltar al contenido", foco gestionado al cambiar de página y en errores de formulario, contraste AA, respeto a `prefers-reduced-motion`.
- **Rendimiento:** vistas con carga diferida, íconos SVG con *tree-shaking*, fuente alojada localmente, imágenes WebP.
- **Animación de marca** en el login: SVG + CSS, sin librerías.

---

## 6. Seguridad

| Medida | Dónde |
|---|---|
| Ninguna credencial en el código: todo por `.env` (ignorado por git) y validado al arrancar | `.env.example`, `backend/src/config/env.ts` |
| La API usa un usuario de BD con permiso **solo de EXECUTE** sobre los SPs (no puede leer tablas directamente) | `db/scripts/07_security.sql` |
| Consultas siempre parametrizadas (solo SPs con parámetros tipados, sin SQL concatenado) | `procedure-executor.ts` |
| Contraseñas con bcrypt; la BD rechaza cualquier valor que no sea un hash bcrypt | `password-hasher.ts`, `usp_Users_Create` |
| JWT con algoritmo fijo (HS256), emisor, audiencia y expiración | `token.service.ts` |
| Login: mismo mensaje y tiempo de respuesta si el usuario no existe; *rate limit* de intentos fallidos con los intentos restantes y el tiempo de bloqueo visibles | `auth.service.ts`, `rate-limit.ts` |
| **Captcha propio por prueba de trabajo** (como ALTCHA): el navegador resuelve un SHA-256 (~1 s), el desafío va firmado con HMAC, vence en 5 min y es de un solo uso. Sin terceros: no envía datos a Google y funciona sin Internet | `captcha.service.ts`, `useCaptcha.ts` |
| **Recuperación de contraseña**: token aleatorio de 256 bits; en la BD solo su hash SHA-256; vence en 30 min, sirve una vez y al usarse cierra las sesiones abiertas. La respuesta es igual exista o no la cuenta y no espera al envío del correo (no revela cuentas por tiempo). Sin correo, queda una solicitud para administración | `auth.service.ts`, `usp_PasswordResets_*` |
| **Sesiones revalidadas en cada petición** (`usp_Users_GetSessionState`, búsqueda por clave primaria): desactivar o eliminar a un usuario lo saca de inmediato, un cambio de rol aplica en la siguiente petición y cambiar o restablecer la contraseña cierra las sesiones abiertas (el token lleva la "versión" de la contraseña) | `authenticate.ts` |
| Validación de toda entrada con zod (campos desconocidos rechazados) | `*.schemas.ts` |
| Errores 500 sin detalles internos; logs estructurados sin contraseñas ni tokens (`[REDACTED]`) | `error-handler.ts`, `logger.ts` |
| `helmet`, CORS con lista blanca, límite de tamaño del cuerpo | `app.ts` |
| nginx: CSP, `X-Frame-Options`, `nosniff`, versión oculta; contenedores sin root | `frontend/nginx/` |
| Frontend: redirección post-login solo a rutas internas; sesión en `sessionStorage` | `safeRedirect.ts` |
| Permisos: `requirePermission(...)` responde 403; rol, área y permisos se leen de la BD en cada petición (no viajan en el JWT); el frontend solo oculta lo que no corresponde | `authorize.ts`, `authenticate.ts`, `router/index.ts` |
| Sin escalada de privilegios: no se otorgan permisos que no se tienen, no se gestiona a alguien con más permisos ni el propio rol; Administrador bloqueado (validado en el SP) | `05_procedures_access.sql`, `05_procedures_users.sql` |
| Política de contraseñas (10+ caracteres, mayúscula, minúscula y número) igual en API y UI; el cambio propio exige la contraseña actual y tiene el mismo *rate limit* que el login | `user.schemas.ts`, `passwordRules.ts` |

---

## 7. Pruebas

| Suite | Cantidad | Comando |
|---|---|---|
| Backend: unitarias + integración HTTP (supertest) | 135 | `cd backend && npm ci && npm test` |
| Frontend: unitarias (composables, cliente HTTP, store, router, componentes) | 108 | `cd frontend && npm ci && npm test` |
| End-to-end (Playwright, escritorio y móvil) contra `docker compose` | 66 | ver abajo |

```bash
# Las pruebas hacen logins fallidos a propósito: se sube el límite anti fuerza bruta solo para esta corrida.
AUTH_MAX_FAILED_ATTEMPTS=500 docker compose up --build -d
cd e2e && npm ci && npx playwright install chromium && npm test
```

**Integración continua** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): en cada *push* y *pull request*,
lint, tipos, pruebas y auditoría de dependencias del backend y del frontend en paralelo; si pasan, levanta todo con
`docker compose up --build` en un runner Linux y corre las pruebas E2E (con los logs y el reporte como evidencia si algo falla).

Además: `npm run lint` y `npm run typecheck` en backend y frontend (TypeScript `strict` en todo el proyecto).
Los scripts SQL se probaron conectados como el usuario de aplicación, ejecutándolos dos veces (idempotencia) y midiendo el índice con 200 000 filas ([evidencia](db/README.md#índice-principal--evidencia)).

---

## 8. Desarrollo local sin Docker

Requiere Node.js 22+ y un SQL Server accesible (por ejemplo, solo el servicio `db` publicado temporalmente).

```bash
cd backend && npm ci && npm run dev     # API en :3000 (lee ../.env; ajustar DB_HOST=localhost)
cd frontend && npm ci && npm run dev    # Vite en :5173 con proxy de /api → :3000
```

---

## 9. Respuestas a las preguntas

### 1. ¿Qué consulta optimiza tu índice y cómo verificarías que SQL Server lo está usando?

**Consulta:** el listado principal de la aplicación (`usp_Tasks_List`), filtrado por estado, ordenado por fecha de creación y paginado:

```sql
SELECT TaskId, CreatedAt
FROM dbo.Tasks
WHERE StatusId = @StatusId
ORDER BY CreatedAt DESC, TaskId DESC
OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
```

**Índice:** `IX_Tasks_StatusId_CreatedAt (StatusId, CreatedAt DESC, TaskId DESC) INCLUDE (AreaId, AssignedTo, CreatedBy)`

- `StatusId` va primero porque es un filtro de igualdad: permite un **Index Seek** directo al rango del estado pedido.
- `CreatedAt DESC, TaskId DESC` coinciden exactamente con el `ORDER BY`: las filas salen ya ordenadas (**sin operador Sort**) y la lectura se detiene al completar la página. `TaskId` además desempata para que la paginación sea determinista.
- Es **cubriente** para esa consulta: el SP primero pagina solo las claves con el índice y después trae el detalle completo de las 10 filas de la página (*deferred join*), en lugar de leer el detalle de todas las filas que salta el `OFFSET`.
- `INCLUDE (AreaId, AssignedTo, CreatedBy)`: son las columnas del filtro de visibilidad ("su área, o asignadas a él, o creadas por él"). Así ese filtro se evalúa dentro del índice, sin ir a la tabla por cada fila.
- Un segundo índice, `IX_Tasks_CreatedAt`, cubre el mismo listado sin filtro ("Todas"), y los índices por área, responsable y creador cubren el alcance de supervisores y colaboradores.

**Medición real** (200 000 tareas, página 50, estado `COMPLETED`):

| | Plan | Lecturas lógicas |
|---|---|---|
| Con el índice | `Index Seek … ORDERED FORWARD`, sin Sort | **8** |
| Sin el índice (forzando el índice clustered) | Scan completo + Sort | **2 135** |

El mismo índice sostiene el conteo del total y el alcance por permisos. Con los 200 000 registros, el SP completo
(conteo + página) lee 193 + 38 páginas para el administrador y 190 + 33 para un supervisor filtrando por estado
(sin las columnas incluidas, ese caso leía 2 135: la tabla entera). El conteo se guarda en una tabla variable y no
con `SELECT @Total = COUNT(*)`, porque SQL Server no aplica la optimización de `OPTION (RECOMPILE)` a sentencias
que asignan variables: sin ella, el filtro de permisos no se simplifica y el conteo recorre la tabla.

**Cómo verificar que SQL Server lo usa:**

1. **Plan de ejecución real** (SSMS: *Include Actual Execution Plan*, o `SET STATISTICS XML ON`): debe aparecer `Index Seek` sobre `IX_Tasks_StatusId_CreatedAt` y ningún `Sort`. Al estar el SP con `OPTION (RECOMPILE)`, el plan corresponde a los parámetros reales de cada ejecución.
2. **`SET STATISTICS IO ON`**: comparar las lecturas lógicas con y sin el índice (`WITH (INDEX(PK_Tasks))`), como en la tabla anterior.
3. **En producción:** `sys.dm_db_index_usage_stats` (`user_seeks` creciendo y `user_scans` bajos) y **Query Store** para ver el plan y la duración históricos de `usp_Tasks_List`; `sys.dm_db_missing_index_details` para detectar índices faltantes.

### 2. Si la tabla creciera a 5 millones de tareas, ¿qué cambiarías?

1. **Paginación por cursor (*keyset*) en lugar de `OFFSET`.** `OFFSET` lee y descarta todas las filas anteriores: la página 10 000 es mucho más lenta que la 1. Con keyset se pide "las 10 siguientes después de `(CreatedAt, TaskId)` de la última fila vista", que es siempre un Index Seek de costo constante. El mismo índice ya sirve para eso.
2. **No contar el total exacto en cada petición.** `COUNT(*)` sobre millones de filas en cada página es costoso. Opciones: una **vista indexada** con `COUNT_BIG(*)` agrupado por estado (SQL Server la mantiene sola y el conteo es instantáneo), un conteo cacheado, o una interfaz de "siguiente / anterior" que no necesite el total.
3. **Índices filtrados** para lo que realmente se consulta a diario: la mayoría de tareas terminarán `Completada`/`Cancelada`, y la operación trabaja sobre las abiertas. Un índice `WHERE StatusId IN (1, 2)` es mucho más pequeño y rápido.
4. **Archivado y particionado por fecha.** Particionar `Tasks` y sobre todo `TaskStatusHistory` (que crece varias veces más rápido) por `CreatedAt`/`ChangedAt`, y mover lo antiguo a tablas de archivo con *partition switching* (operación de metadatos, sin bloquear). El historial antiguo puede ir en **columnstore** para reportes.
5. **Mantenimiento y monitoreo:** actualización de estadísticas, reorganizar/reconstruir índices según fragmentación, *fill factor* adecuado, Query Store activo con alertas por regresión de planes.
6. **Separar lectura de escritura:** reportes y exportaciones contra una réplica de solo lectura (Always On *readable secondary*), y caché del catálogo de estados en la API.
7. **Si se agrega búsqueda por texto,** usar un índice *full-text* en lugar de `LIKE '%texto%'`.

### 3. ¿Qué agregarías o cambiarías para llevar esta aplicación a producción?

**Seguridad**
- Secretos en un gestor (Azure Key Vault, AWS Secrets Manager o Docker/Kubernetes secrets) en lugar de un archivo `.env`, con rotación.
- HTTPS en todo el recorrido: TLS en el balanceador/nginx con HSTS, y certificado válido en SQL Server (`DB_TRUST_SERVER_CERTIFICATE=false`).
- Token de acceso corto + *refresh token* en cookie `HttpOnly`, `Secure`, `SameSite` (en vez de `sessionStorage`). La revocación ya existe (sesión revalidada en cada petición); con mucho tráfico, ese estado se cachearía unos segundos en Redis.
- Roles configurables, áreas, asignación y seguimiento ya existen; agregaría SSO corporativo (Entra ID / OAuth2) con MFA (mapeando grupos del directorio a roles), cambio obligatorio de la contraseña inicial y auditoría de los cambios de roles y permisos.
- *Rate limit* compartido entre instancias (Redis), WAF, escaneo de imágenes (Trivy) y de dependencias (Dependabot/Renovate) en el pipeline, y pruebas de penetración.
- Cumplimiento de la **Ley 1581 de 2012 (Habeas Data)** y alineación con ISO 27001: clasificación de datos, retención y auditoría de accesos.

**Base de datos**
- Migraciones versionadas (Flyway, DbUp o sqlpackage) en lugar de scripts de inicialización, ejecutadas por el pipeline.
- Alta disponibilidad (Always On AG o Azure SQL), backups completos/diferenciales/de log con **pruebas de restauración** periódicas y objetivos RPO/RTO definidos.
- La imagen ya está fijada por *digest* (SQL Server 2022 CU27); en producción, edición con licencia (no Developer) y un proceso para aplicar cada CU nuevo tras probarlo.

**Operación**
- CI/CD: lint, pruebas unitarias, de integración y E2E, build de imágenes firmadas y despliegue gradual (*blue/green* o *canary*) con *rollback* automático.
- Observabilidad: logs centralizados (ELK, Loki o Azure Monitor), métricas (Prometheus/Grafana: latencia, errores, uso del pool de conexiones) y trazas con OpenTelemetry, con alertas.
- Orquestación (Kubernetes o un servicio administrado) con *readiness/liveness probes*, límites de CPU/memoria y escalado horizontal de la API (ya es *stateless*).

**Producto**
- Áreas jerárquicas (sub-áreas), personas en varias áreas y permisos por área (p. ej. supervisor de dos equipos):
  el modelo lo admite con una tabla `UserAreas` y la misma función `tvf_UserAccess` como único punto a cambiar.
- Adjuntos en los avances (con antivirus y almacenamiento de objetos), notificaciones de vencimiento (correo o Teams) e indicadores por persona, área y periodo.
- Con millones de tareas, los indicadores se servirían desde una vista indexada con `COUNT_BIG` por estado (o un conteo cacheado) en lugar de agregarse en cada consulta.
