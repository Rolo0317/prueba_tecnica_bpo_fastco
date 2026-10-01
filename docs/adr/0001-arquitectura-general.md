# ADR 0001 — Arquitectura general

- **Estado:** Aceptada
- **Fecha:** 2026-09-30

## Contexto
Prueba técnica fullstack (Vue 3 + Vuetify · Express + TypeScript · SQL Server · Docker Compose · Linux)
para un BPO con certificación ISO 27001. Plazo de 48 h. Se evalúan integración end-to-end con un solo
comando, calidad del SQL, seguridad básica y organización del código.

## Decisiones

| # | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| 1 | Backend **MVC por capas, modular por feature** (routes → controller → service → repository → SP) | Capas globales (`controllers/`, `services/` en la raíz) | Cada feature es autocontenida; escala y se lee mejor |
| 2 | Frontend **MVVM**: services (Model) · composables/stores (ViewModel) · `.vue` (View) | Lógica en los componentes | Componentes testeables y sin acceso directo a HTTP |
| 3 | Toda la lógica de datos en **Stored Procedures**; el backend solo ejecuta SPs parametrizados | ORM (Prisma/TypeORM) | Requisito explícito; control fino de transacciones e índices |
| 4 | Reglas de transición de estado en el **SP**, con historial en la misma transacción | Validación solo en el backend | Integridad garantizada aunque otro cliente use la BD; auditoría atómica |
| 5 | **Usuario de BD con mínimo privilegio** (solo EXECUTE) para la API | Conectar con SA | Principio de mínimo privilegio (ISO 27001) |
| 6 | Contenedor **`db-init` one-shot** con `sqlcmd` | Scripts en el arranque del backend | SQL Server no ejecuta scripts de inicio por sí solo; separa responsabilidades |
| 7 | **nginx** sirve el frontend y hace proxy de `/api` | CORS abierto entre puertos | Mismo origen, sin CORS en el navegador, un solo puerto publicado |
| 8 | Validación con **zod** (env y requests), tipos inferidos de los esquemas | class-validator / validación manual | Una sola fuente de verdad entre validación y tipos |
| 9 | Seed del usuario demo desde el backend con **bcrypt** a partir de variables de entorno | Hash fijo en un script SQL | Ninguna credencial ni hash en el repositorio |

## Consecuencias
- (+) Cumple cada criterio del PDF con responsabilidades claras y testeables.
- (+) La seguridad se aplica en varias capas (BD, API, red).
- (−) Más archivos que una solución mínima; se compensa con estructura predecible por feature.
- (−) La imagen de SQL Server es solo x86_64; en ARM requiere emulación (`platform: linux/amd64`).
