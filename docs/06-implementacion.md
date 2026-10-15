# 06 · Fases y tareas para un modelo implementador

Trabajar en orden. Una tarea puede ocupar varias sesiones; ninguna autoriza publicar, desplegar en producción ni modificar repositorios del usuario sin el encargo correspondiente. No estimar plazos precisos sin conocer al implementador y el entorno.

## Fase 0 · Cerrar base técnica y contratos

T00. Revisar D01–D18 y P01–P10. Usar el stack confirmado en D17; concretar la identidad Bitbucket antes de conectar. Crear ADR breve de las elecciones y resolver bibliotecas concretas durante esta fase.
T01. Elegir versiones mantenidas, cola PostgreSQL y migraciones. Crear estructura, scripts, lockfile y CI local.
T02. Construir simuladores Bitbucket/OpenAI y fixtures sintéticos PHP sin secretos. Verificar contratos de endpoints, permisos y webhooks Cloud actuales.
T03. Registrar cómo se comprobará compatibilidad de modelo y cómo se compararán candidatos con PR etiquetadas.

Salida: instalación reproducible, typecheck y una prueba de contrato realista. Documento de permisos exactos y decisiones abiertas actualizado. No se necesitan claves reales para esta fase.

## Fase 1 · Acceso, equipo y configuración

T10. Migraciones iniciales, sesiones y bootstrap de administrador.
T11. Login/logout, activación, recuperación y administración de cuentas.
T12. Shell del panel, navegación y roles; estados vacío/error/carga.
T13. Configuración versionada, almacenamiento cifrado de secretos y auditoría.

Aceptación:
- Miembro no puede usar endpoints admin aunque modifique el frontend.
- Token de recuperación no reutilizable; sesiones revocadas.
- Último admin protegido y secretos ausentes de API/logs.
- Reiniciar Compose conserva cuentas/configuración.

Entrega demostrable con usuarios ficticios; ningún dato de ejemplo se presenta como conexión real.

## Fase 2 · Bitbucket y captura de trabajos

T20. Adaptador con autenticación, paginación, timeout y errores normalizados.
T21. Panel de conexión, prueba de permisos, catálogo y activación por repositorio.
T22. Gestión de webhook, firma y persistencia del evento.
T23. Cola, debounce, deduplicación, cancelación por PR cerrada y reconciliación periódica.
T24. Recuperación de PR/diff/archivos a commits fijos, incluidos origen y destino distintos.

Aceptación:
- Duplicar entrega no duplica trabajo ni coste.
- Borrador no se analiza; preparado sí.
- Push y transición de borrador cubiertos con fixtures y una prueba real controlada cuando exista conexión.
- Reiniciar worker recupera trabajo sin perderlo.
- Eventos firmados para repositorios no autorizados no ejecutan análisis.

## Fase 3 · Revisión visible solo en panel

T30. Selección de archivos, exclusiones y construcción acotada de contexto.
T31. Adaptador OpenAI con salida estructurada y manejo de rechazo/truncamiento.
T32. Detección, verificación dirigida y validación determinista.
T33. Historial, detalle de revisión, cobertura y feedback.
T34. Registro de tokens y costes; avisos mensuales sin corte.

Aceptación:
- Proveedor simulado permite pruebas sin gasto.
- Un caso con permiso ausente genera evidencia; su variante corregida no.
- Archivo excluido no aparece en ninguna entrada enviada.
- Presupuesto mensual superado sigue permitiendo revisión.
- Una limitación de contexto aparece como parcial, no como revisión limpia.

Evaluar con PR etiquetadas antes de activar publicación. Un conjunto sintético no demuestra calidad general; registrar falsos positivos y corregir los casos más ruidosos.

## Fase 4 · Publicación en Bitbucket

T40. Resumen único por PR y comentarios válidos en diff.
T41. Asociación de hallazgos entre versiones, deduplicación y estados.
T42. Outbox, reconciliación de timeout y reintentos de publicación.
T43. Protección contra resultado obsoleto y pausas durante ejecución.
T44. Historial enlazado a comentarios remotos.

Aceptación:
- Un reintento tras respuesta perdida no duplica comentarios en la prueba de reconciliación.
- Publicación parcial reintenta sin volver a gastar en análisis.
- Un nuevo commit impide sobrescribir resumen más reciente.
- No se invocan APIs de approve, request-changes ni merge.
- No se modifica código del repositorio.

## Fase 5 · Operación y puesta en uso

T50. Docker Compose, HTTPS, backups y restauración documentada.
T51. Limpieza/retención, cuotas técnicas, alertas y errores accionables.
T52. Pruebas E2E de panel y recorrido de PR; accesibilidad básica y móvil.
T53. Evaluación con una muestra acordada de PR reales, primero sin publicar.
T54. Manual de instalación, configuración, recuperación y actualización.

Aceptación:
- Instalación limpia siguiendo README de implementación.
- Restauración en entorno separado conserva datos y secretos descifrables con la clave correcta.
- Se demuestra una PR real y su actualización en repositorio de prueba autorizado.
- Calidad y coste observados quedan registrados, sin fingir que pasan por no existir errores técnicos.

## Fase 6 · Correcciones, fuera de V1

Ver 08-correcciones.md. Solo comienza después de evaluar la revisión y concretar permisos, pruebas por repositorio y forma de entrega del cambio.

## Formato de entrega por tarea

1. ID y objetivo.
2. Cambios realizados.
3. Comandos ejecutados y resultado.
4. Pruebas omitidas y motivo.
5. Capturas solo cuando sean útiles para revisar UI.
6. Limitaciones y siguiente tarea.

Actualizar PROGRESS.md. No marcar «terminado» cuando hay TODO en una ruta principal, datos falsos en una pantalla conectada o errores ignorados.
