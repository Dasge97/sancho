# 05 · Datos y contratos

Contratos de producto propuestos; no son código ya implementado. Aplicar validación de entrada y autorización en servidor.

## Modelo de datos mínimo

| Entidad | Campos esenciales y restricciones |
| --- | --- |
| users | UUID, correo normalizado único, password_hash, role admin/member, activo, fechas. |
| sessions | hash de token único, user_id, caducidad y revocación. |
| account_tokens | hash, user_id, propósito activation/reset, caducidad, used_at. |
| connections | proveedor bitbucket, workspace_uuid, email técnico, credencial cifrada, estado y fecha de comprobación. |
| repositories | connection_id, UUID remoto único por conexión, slug actual, activo, webhook_id, secreto cifrado, última sincronización. |
| config_versions | scope global/repository, número de versión, JSON validado, autor y fecha; inmutable. |
| pull_requests | repository_id + número únicos, source_repo_uuid, SHA origen/destino, estado, draft, summary_comment_id. |
| webhook_events | conexión, clave de entrega cuando exista, event_key, hash de cuerpo, received_at, processed_at, estado; sin guardar cuerpo completo por defecto. |
| review_runs | PR, snapshot, versión config/prompt, trigger, generation, status, coverage, modelo, timestamps, superseded_by y error_code. |
| findings | run_id, fingerprint, ruta/rango/lado, categoría, severidad, título, escenario, impacto, evidencia y disposición del verificador. |
| finding_threads | PR, huella, comentario remoto, primer/último run, estado de seguimiento. |
| publication_operations | run_id, op_key única, tipo create/update, estado, remote_id, intentos y error. |
| usage_calls | run_id, stage, provider_request_id, modelo, tokens de entrada/cache/salida, tarifa aplicada, coste nullable, estado y fecha. |
| feedback | finding_id, user_id, useful/false_positive, motivo opcional, fechas; un voto actual por usuario y hallazgo. |
| alerts | tipo, periodo, umbral, estado y dedup_key única. |
| audit_events | actor, acción, objeto, resultado y fecha; datos redactados. |

La cola añade sus tablas con la biblioteca elegida. Asegurar recuperación después de caída, lease y exclusión de ejecuciones por PR. La base de datos debe imponer las restricciones de unicidad; no depender solo de comprobaciones en código.

Estados de review_run:
queued → fetching → analyzing → verifying → ready_to_publish → publishing → completed.
Estados alternativos: partial, failed, cancelled, superseded.
La cobertura y la publicación tienen campos independientes: análisis completo no equivale a publicación completa.

## Contrato del proveedor IA

Entrada:
- run_id, SHA origen/destino y alcance;
- reglas efectivas y versión;
- diff y fragmentos con ruta, líneas y SHA;
- hallazgos previos relevantes;
- límites de salida y presupuesto restante.

Salida:
- summary: string;
- candidates: lista de candidatos;
- limitations: lista de motivos concretos;
- needs_context: solicitudes acotadas de lectura, si se usa ese paso.

Candidato:
- candidate_id, category y severity (medium/high/critical);
- title, scenario, impact y recommendation;
- location: path, side old/new, start_line y end_line;
- evidence: lista de path, SHA, líneas y fragmento;
- related_change: hunk o referencia al cambio analizado.

Verificación:
- candidate_id;
- disposition: supported/rejected/insufficient_context;
- reason: explicación breve y comprobable;
- checked_evidence: referencias a fragmentos.

El servidor calcula fingerprints y decide publicación. La IA no decide URLs de red, credenciales, permisos, gasto ilimitado ni endpoints. Salida estructurada no garantiza validez semántica. Truncamiento, rechazo o JSON incompleto se procesan como estados explícitos.

## API interna propuesta

Todas las rutas del panel requieren sesión salvo login/activación. Mutaciones con CSRF. Paginación por cursor o página estable y tamaño máximo.

| Método/ruta | Acceso y finalidad |
| --- | --- |
| POST /api/auth/login | Público con rate limit. |
| POST /api/auth/logout | Usuario; revoca sesión. |
| GET /api/me | Usuario; identidad y capacidades. |
| POST /api/auth/activate | Token de un solo uso. |
| POST /api/auth/reset | Token de un solo uso. |
| GET/POST /api/users | Admin; listar y crear. |
| PATCH /api/users/:id | Admin; rol/estado, proteger último admin. |
| POST /api/users/:id/reset-link | Admin; enlace de recuperación, no password. |
| GET/PUT /api/settings | Admin; versión y valores no secretos. |
| PUT /api/settings/openai-secret | Admin; respuesta solo máscara. |
| POST /api/settings/test-openai | Admin; comprobación acotada. |
| GET/POST /api/connections | Admin; consulta redactada/alta. |
| POST /api/connections/:id/test | Admin; comprobar capacidades. |
| POST /api/connections/:id/sync | Admin; sincronizar catálogo, no activar. |
| GET /api/repositories | Miembro; repositorios y estados. |
| PATCH /api/repositories/:id | Admin; activación/configuración con versión esperada. |
| GET /api/reviews | Miembro; historial filtrado. |
| GET /api/reviews/:id | Miembro; detalle y cobertura. |
| POST /api/repositories/:id/reviews | Miembro; número PR y publish true/false; idempotency key. |
| POST /api/findings/:id/feedback | Miembro; voto/motivo. |
| GET /api/usage | Miembro; consumo estimado. |
| GET /api/alerts | Miembro; avisos operativos. |
| GET /api/audit | Admin; auditoría redactada. |
| POST /webhooks/bitbucket/:connectionId | Firma válida, no cookie de usuario. |
| GET /health/live y /health/ready | Estado mínimo sin datos sensibles. |

Errores: code, mensaje seguro y request_id. 401 sin sesión, 403 sin permiso, 409 versión/conflicto, 422 validación, 429 límite temporal. Las operaciones largas devuelven 202 y job/run ID.

Cambios de configuración usan versión esperada para impedir que dos administradores se sobrescriban. Una revisión mantiene su copia efectiva aunque cambien ajustes mientras se ejecuta.

## Configuración inicial propuesta

Idioma es; publicación minimum_severity medium; max_inline_comments 8; debounce 30 segundos; reconciliación 10 minutos; modo de presupuesto warn_only obligatorio en V1.

Modelo y clave requieren configuración explícita; no hay modelo hardcodeado ni credenciales de demostración activas. Una instalación sin modelo válido permite gestionar usuarios y repositorios, pero muestra revisión no disponible.

Datos técnicos de despliegue: DATABASE_URL, clave maestra de cifrado, URL pública y secretos de sesión/arranque. Configuración cotidiana, conexiones, reglas, modelo y avisos se guardan desde el panel.

## Cálculo de costes

Registrar llamadas fallidas o reintentadas y consumo conocido. Tokens cacheados no se cobran dos veces dentro de la estimación: separar input no cacheado, input cacheado y output según la semántica del proveedor y modelo.

Coste estimado = suma de tokens facturables por categoría × tarifa por millón / 1 000 000.
Si hay cargos adicionales, incorporarlos explícitamente; no inventar precios. Guardar la tarifa de la fecha de ejecución, no recalcular todo el histórico con la actual.

Un timeout sin usage deja coste desconocido, no cero. Mostrar importe conocido y número de llamadas sin coste confirmado. No describir el panel como factura oficial de OpenAI.
