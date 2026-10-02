# ADR 0004 — Protección del login y recuperación de contraseña

- **Estado:** Aceptada
- **Fecha:** 2026-10-02

## Contexto
Se pidió un captcha sencillo ("No soy un robot") en el inicio de sesión, que el usuario vea el límite de
intentos, y que pueda restablecer su contraseña desde el login. La empresa está certificada en ISO 27001:
la solución no debe filtrar datos a terceros, revelar qué cuentas existen ni dejar secretos utilizables en la BD.

## Decisiones

| # | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| 1 | **Captcha propio por prueba de trabajo** (SHA-256, como ALTCHA / Friendly Captcha): el servidor firma con HMAC un desafío; el navegador busca el número (~1 s) | reCAPTCHA / hCaptcha / Turnstile | Sin claves externas ni envío de datos de los usuarios a terceros; funciona sin Internet dentro de Docker. Encarece los ataques automatizados sin pedirle nada a la persona |
| 2 | Desafío con expiración (5 min) y **de un solo uso** (registro en memoria) | Sin control de reutilización | Evita reutilizar una solución. Con varias instancias, el registro iría en Redis |
| 3 | SHA-256 en JavaScript puro en el navegador | `crypto.subtle` | `crypto.subtle` solo existe en HTTPS o localhost; la app puede servirse por HTTP en una red interna |
| 4 | Límite de intentos **visible**: la API devuelve `meta.attemptsRemaining` (401) y `meta.retryAfterSeconds` (429) | Solo el 429 | La persona sabe cuántos intentos le quedan y cuánto esperar; el bloqueo sigue en el servidor |
| 5 | Recuperación **por enlace de un solo uso enviado al correo**: token aleatorio de 256 bits; en la BD solo su hash SHA-256; vence en 30 min | Contraseña temporal por correo / preguntas de seguridad | Una copia de la BD no permite usar los enlaces; el token caduca y no se reutiliza. Al usarlo se actualiza `PasswordChangedAt` y se cierran las sesiones abiertas |
| 6 | Respuesta **idéntica** exista o no la cuenta, sin esperar el envío del correo | Avisar "usuario no encontrado" | No revela qué cuentas existen, ni por el mensaje ni por el tiempo de respuesta |
| 7 | Cuenta sin correo → queda una **solicitud para administración** (una abierta por persona) que aparece en Usuarios | Rechazar la solicitud | Realista en un BPO: no todo el personal operativo tiene correo corporativo |
| 8 | Mailpit como servidor SMTP de pruebas en el compose (bandeja solo en `127.0.0.1:8025`) | Simular el envío en el log | Permite probar el flujo completo de punta a punta (también en las pruebas E2E). En producción se configura el SMTP corporativo |

## Consecuencias
- (+) El flujo completo (solicitud → correo → enlace → contraseña nueva → login) está cubierto por pruebas E2E.
- (+) El captcha y el límite de intentos se pueden desactivar o ajustar por entorno (`AUTH_CAPTCHA`, `AUTH_MAX_FAILED_ATTEMPTS`).
- (−) La prueba de trabajo frena bots, pero no a un atacante dispuesto a gastar CPU; por eso convive con el *rate limit* por IP.
- (−) El registro de desafíos usados vive en memoria de la instancia: con varias réplicas debe compartirse (Redis).
