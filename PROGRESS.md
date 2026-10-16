# Estado de implementación

Actualizado: 16 de octubre de 2026.

## Estado real

La V1 está implementada para validación en entorno local/simulado. El recorrido de instalación, login, permisos, revisión sintética, detalle/feedback, consumo y publicación simulada se ejecutó en Docker Compose. La integración remota con Bitbucket Cloud y OpenAI no se probó con credenciales reales. Tampoco se hizo evaluación de calidad con PR etiquetadas; el simulador sirve para comprobar el flujo, no la calidad del modelo.

## Decisiones y límites

- [x] Stack Node.js + TypeScript + Vue + PostgreSQL (D17).
- [x] Usuario autorizó implementar V1 el 15-10-2026 (D01 actualizado).
- [x] Correcciones de código quedan fuera de V1 (fase 6).
- [x] El presupuesto mensual informa al 80 % y al superarlo; no bloquea trabajos.
- [x] Todos los miembros ven los repositorios conectados; servidor valida acciones administrativas.
- [x] Sin ejecución de código revisado, aprobación, bloqueo ni fusión de PR.
- [ ] El propietario debe concretar identidad/permisos Bitbucket, clave/modelo OpenAI y tarifas verificadas antes de activar servicios reales.
- [ ] Evaluar falsos positivos y cobertura con una muestra de PR acordada antes de habilitar publicación real.

## Fases

- [x] Fase 0 · Node 22, TypeScript, Vue, PostgreSQL, migraciones idempotentes, Docker, CI y simulador sintético.
- [x] Fase 1 · Sesiones PostgreSQL, bcrypt, CSRF, roles validados en API, administración bootstrap, activación/reset de un uso, revocación de sesiones, secreto cifrado AES-GCM, auditoría y panel.
- [x] Fase 2 · Conexión Bitbucket Cloud, prueba/sincronización paginada, configuración de webhook y firma HMAC del cuerpo original, deduplicación de entregas, cola recuperable, cierre/borrador, reconciliación y commits fijos.
- [x] Fase 3 · Límites/exclusiones y redacción de secretos, contexto limitado de archivos, salida estructurada, verificación dirigida, ubicación en líneas añadidas, historial, cobertura, feedback y consumo/tarifas configurables.
- [x] Fase 4 · Comentario resumen actualizable, hallazgos en línea, seguimiento por fingerprint, outbox, reintentos/reconciliación y comprobaciones de PR/commits antes de publicar. Flujo real pendiente de integración con cuenta de prueba.
- [~] Fase 5 · Compose, health/readiness, Caddy con HTTPS opcional, puertos privados, README de instalación, CI con PostgreSQL y scripts de copia/restauración. Retención y evaluación real quedan pendientes antes de operación.
- [ ] Fase 6 · Correcciones, fuera de V1.

## Entrega

**T00–T02, T10–T13, T20–T24, T30–T34 y T40–T44 implementadas. T03, T50–T54 parcialmente pendientes por validación externa y preparación operativa.** El simulador no se siembra al iniciar: se activa explícitamente con `docker compose exec api node dist-server/simulator.js`. Los datos generados se marcan como simulados.

Los análisis incompletos/fallidos se distinguen de una revisión sin hallazgos. La publicación sintética queda marcada `simulated`. Secretos no se escriben en fixtures ni logs; la API tampoco devuelve las credenciales guardadas. Las correcciones quedan fuera del producto.

## Validación ejecutada

- `docker compose up --build -d` con Node 22: typecheck, 7 pruebas unitarias y build Vue/TypeScript pasaron.
- `GET /health/ready`: `{"ok":true}`.
- Recorrido Compose: bootstrap de admin, siembra sintética, revisión PR #7, hallazgo sintético, publicación simulada y detalle; se verificaron endpoints de consumo y dashboard.
- Acceso: sesión member recibió HTTP 403 en `/api/users`; dicho member vio el mismo repositorio conectado que admin.
- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilidades de producción.
- Las llamadas reales a OpenAI, webhooks/REST Bitbucket, publicación remota, restauración de backup y evaluación del modelo no se ejecutaron; faltan credenciales/entorno acordado.

## Correcciones del 16-10-2026 (revisión previa al despliegue)

Una revisión del código encontró que el recorrido real con Bitbucket no podía funcionar, aunque el simulador sí. Corregido:

- Webhooks: el middleware CSRF rechazaba con 403 todos los avisos de Bitbucket. `/api/webhooks/` y `/health/` ya no usan sesión ni CSRF; el resto del API sigue exigiendo token.
- Número de PR: Bitbucket Cloud lo envía como `id` y el código leía `number`, así que fallaban la revisión manual, los webhooks y la reconciliación. `normalizePullRequest` en `src/domain.ts` lo resuelve.
- Publicación automática: webhook y reconciliación publicaban siempre. Nuevo ajuste `auto_publish`, desactivado por defecto, en el panel «IA y consumo». La publicación manual sigue reservada a administración.
- Gasto repetido: la reconciliación relanzaba cada 10 minutos las revisiones fallidas. Ahora una revisión automática fallida no se repite para los mismos commits; se puede repetir a mano.
- OpenAI: `max_output_tokens` pasa de 2500 a 16000 (configurable con `OPENAI_MAX_OUTPUT_TOKENS`), el timeout a 180 s y el bloqueo de trabajos huérfanos a 15 min.
- El worker no recibía `PUBLIC_BASE_URL`, así que el comentario resumen no enlazaba al panel.
- Nuevos `scripts/backup.sh` y `scripts/restore.sh`.

Validación ejecutada:

- `npm run typecheck`: sin errores.
- `npm test` con `TEST_DATABASE_URL` (PostgreSQL 16 en Docker): 15 pruebas pasan. 10 unitarias y 5 de integración del recorrido webhook firmado → revisión con OpenAI → publicación en Bitbucket, con ambas APIs simuladas en `fetch`. Las de integración fallan con el código anterior a la corrección (comprobado).
- `docker compose up --build -d` en un proyecto aparte: imagen construida, health `200`, webhook sin CSRF responde 404 por repositorio inexistente en lugar de 403, POST sin CSRF a `/api/users` sigue en 403, `auto_publish` se guarda desde la API, y copia → borrado → restauración recupera usuarios y repositorios.
- Sigue sin probarse contra Bitbucket Cloud y OpenAI reales.

## Despliegue y primera prueba real (16-10-2026)

- Desplegado en un servidor propio detrás de un proxy con HTTPS (Traefik), sin el Caddy del repositorio. La guía de esa instalación vive fuera del repositorio.
- Modelo `gpt-6.1-sol` (2 / 10 USD por millón de tokens de entrada / salida, tarifa oficial consultada el 16-10-2026). Elegido tras probar `gpt-5.4-mini`, `gpt-5.5`, `gpt-6-sol` y `gpt-6.1-sol` con el esquema de detección: todos respetaron la salida estructurada; `gpt-6.1-sol` y `gpt-6-sol` ubicaron la línea exacta.
- Repositorio de prueba privado en Bitbucket con una aplicación Laravel mínima. PR #1 introduce una inyección SQL y una descarga sin autorización.
- Resultado: el webhook llegó firmado y lanzó la revisión sin intervención. Sancho encontró los dos fallos en la línea correcta, sin falsos positivos, por 0,014 USD. Con «Revisar y comentar» publicó un resumen y dos comentarios en línea; la PR siguió abierta y sin aprobar.
- Limitación observada: entre dos revisiones del mismo código, el modelo tituló distinto el mismo hallazgo. El fingerprint usa el título, así que tras un nuevo commit podría repetirse un comentario en línea. Pendiente de evaluar con más PR.
- Una sola PR sintética no mide la calidad general; falta la evaluación con PR reales del equipo.
- Formato de comentarios rediseñado: comentario en línea de tres líneas, resumen como índice sin repetir texto, marca contra duplicados dentro del enlace «Detalle» (la marca HTML anterior se veía en Bitbucket). El panel abre la revisión desde ese enlace. 17 pruebas pasan; desplegado y republicado en la PR #1 del repositorio de prueba.

## Rediseño del panel (16-10-2026)

Panel rehecho según la skill global `diseno-web`, con los colores de la guía de marca de `assets/`:

- Variables de diseño en `src/web/styles/tokens.css`, con modo claro y oscuro (sigue al sistema; selector claro / oscuro / sistema en el menú).
- Componentes reutilizables en `src/web/ui` (botón, campo, insignia, tarjeta, aviso, lista vacía, esqueleto de carga, cifra, interruptor, avisos emergentes y ventana de confirmación). Sin `alert()` ni `confirm()`.
- Una pantalla por fichero en `src/web/views`; la pantalla va en la URL (`#/revisiones/<id>`). «IA y consumo» se separa en Consumo (todos) y Ajustes (administración, con todas las conexiones).
- Cada pantalla tiene sus estados de carga, vacía y error; la revisión en marcha se actualiza sola.
- Iconos Lucide, fuente DM Sans servida por el propio panel y logo como favicon.
- `GET /api/settings` ya no devuelve el token cifrado de Bitbucket.
- Comprobado con Playwright: 8 pantallas y la entrada, en 375, 768, 1280 y 1440 px y en los dos modos, sin desplazamiento horizontal; menú móvil, validación y ventana de enlace probados.
- Segunda vuelta a petición del propietario: barra superior con migas de pan y acción rápida, contenido a todo el ancho (márgenes de 32 px), estado activo con líneas en degradado (estilo de Hangar), subpestañas en Ajustes (Bitbucket, OpenAI, Modelo y costes, Publicación), Repositorios (activos/pausados), Revisiones (por resultado), detalle de revisión (problemas, qué se ha revisado, consumo) y Equipo, y textos de producto.

## Identidad visual

- [x] Incorporados el logotipo y la paleta de tonos tierra proporcionados en `assets/`; aplicados al acceso, navegación, botones, tarjetas y estados del panel.
- [x] Diseño responsive refinado para escritorio y móvil.
- [x] `docker compose up --build -d`: typecheck, 7 pruebas unitarias y build completados. Health `200`, panel `200` y logotipo PNG `200`.

## Próximos pasos antes de activar producción

1. Concretar y configurar la identidad técnica Bitbucket con permisos mínimos; probar sincronización, webhook, comentarios y reintento en repositorio controlado.
2. Confirmar modelo OpenAI, salida estructurada y tarifas; ejecutar compatibilidad y revisar el coste observado.
3. Evaluar un conjunto acordado de PR con etiquetas, primero en modo sin publicar.
4. Programar copias periódicas con `scripts/backup.sh`, definir retención y validar la operación en el entorno de destino.

## Instrucciones, reglas y contexto de la IA (16-10-2026)

- Instrucciones del modelo en `prompts/deteccion.md` y `prompts/verificacion.md`: qué buscar en Laravel y Symfony, qué no comentar, criterios de gravedad y formato de cada hallazgo. Se envían en `instructions`, separadas de los datos (`input`).
- Diff con el número de línea del fichero nuevo en cada línea, para que el modelo no lo calcule.
- Reglas del equipo en Ajustes → Reglas de revisión: generales (texto y rutas excluidas) y por repositorio (de qué va el proyecto, reglas propias y rutas excluidas). Se añaden al final de las instrucciones.
- Contexto ampliado (`src/context.ts`): hasta 8 ficheros cambiados y 8 relacionados (clases usadas según el autoload de composer.json, políticas de Laravel, rutas y reglas de acceso de Symfony).
- La verificación también corrige la gravedad; se publica la suya.
- Registro de lo enviado y la respuesta en `ai_exchanges` (D20), sin pantalla: `node dist-server/ai-log.js [id]`. Se borra a los 30 días.
- 25 pruebas pasan (8 nuevas de contexto e instrucciones; la de integración comprueba lo que llega a OpenAI).
