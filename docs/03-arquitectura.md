# 03 · Arquitectura propuesta

El usuario ha confirmado Node.js + TypeScript + Vue + PostgreSQL (D17). La distribución en componentes, las bibliotecas concretas y la cola descritas a continuación son propuestas técnicas P01–P02.

## Componentes

| Componente | Responsabilidad |
| --- | --- |
| Panel Vue | Pantallas y formularios; nunca llama a Bitbucket/OpenAI con claves desde el navegador. |
| API Express/TypeScript | Sesiones, permisos, configuración, endpoints de panel y recepción de webhooks. |
| Worker TypeScript | Recuperación de contexto, revisión IA, validación y publicación. |
| PostgreSQL | Configuración, sesiones, revisiones, consumo, auditoría y cola persistente. |
| Proxy HTTPS | Único acceso público al panel y webhook; certificados y límites de petición. |

API y worker comparten módulos de dominio, pero son procesos separados. Una imagen de aplicación puede arrancar en modo API o worker. Un worker inicial; trabajos serializados por PR. Usar una cola PostgreSQL mantenida que soporte reintentos, leases y recuperación, elegida y fijada en fase 0; no construir un sistema distribuido nuevo.

Docker Compose: proxy, API, worker y PostgreSQL. Persistir base de datos y copias de seguridad. Red interna para base de datos. Comprobar salud de procesos; no confundir liveness con que OpenAI esté disponible.

## Organización prevista

    apps/api/
    apps/worker/
    apps/web/
    packages/domain/
    packages/bitbucket/
    packages/reviewer/
    packages/db/
    packages/contracts/
    tests/fixtures/
    tests/integration/
    tests/e2e/
    docs/
    docker/

npm workspaces, TypeScript estricto, Zod para contratos, Vitest para lógica y Playwright para recorridos del panel. SQL versionado o herramienta de migraciones mantenida. Elegir versiones compatibles al implementar y fijarlas en lockfile; no usar «latest» en despliegue.

No introducir microservicios adicionales, búsqueda vectorial ni entrenamiento en V1. Contexto mediante lectura acotada y búsqueda textual/símbolos. Si el monorepo resulta excesivo, conservar las mismas fronteras como módulos de una aplicación.

## Autenticación y secretos

Sesión opaca del servidor en cookie HttpOnly, Secure y SameSite; protección CSRF para mutaciones del panel. Contraseñas con biblioteca de Argon2id y parámetros apropiados al servidor. Rate limit de login y tokens aleatorios de activación/restablecimiento, guardados como hash, de un solo uso y con caducidad. Restablecer contraseña revoca sesiones.

Credenciales Bitbucket/OpenAI cifradas en servidor con cifrado autenticado y clave maestra externa a la base de datos. No devolverlas en respuestas API; solo máscara y fecha de cambio. La clave maestra y las copias de seguridad requieren custodia independiente. Registro de auditoría redactado.

No compartir la contraseña del panel con Bitbucket. El acceso compartido a repositorios es una política interna confirmada, no una sincronización automática de permisos personales de Bitbucket.

## Integraciones

Bitbucket: adaptador para consultar repositorios, PR, diff, archivos y comentarios; publicar/actualizar únicamente comentarios propios. Conexión inicial propuesta con correo de identidad técnica y API token con scopes. Confirmar permisos reales para lectura, comentarios y gestión opcional de webhooks en fase 0; no usar documentación de GitHub ni de Bitbucket Data Center.

OpenAI: SDK oficial, Responses API y salida estructurada en modelo compatible. Separar ReviewProvider del dominio para pruebas y posible extensión. Guardar modelo, versión del prompt, configuración y consumo por ejecución. El proveedor simulado debe cumplir el mismo contrato.

Se enviarán a OpenAI los fragmentos necesarios para la revisión. Excluir secretos y archivos sensibles antes de construir contexto. No prometer que una lista de exclusiones o un detector elimina todos los secretos posibles.

## Lectura del repositorio

V1 trabaja con contenido obtenido por APIs de Bitbucket a commits fijos. No ejecutar scripts, PHP, Composer, Artisan, hooks ni tests del proyecto. Permitir lectura de manifiestos como composer.json/composer.lock para inferir dependencias sin instalarlas.

Validar rutas y límites de respuesta. No seguir enlaces de archivos, URLs del código ni URLs de paginación fuera del origen permitido. Tokens no se transmiten a hosts arbitrarios ni aparecen en URLs registradas.

El adaptador puede adquirir un snapshot local de solo lectura en una evolución posterior; no es imprescindible para V1. Los límites de API, archivos binarios y diffs truncados se reflejan como cobertura parcial.

## Fallos y concurrencia

Persistir eventos antes de responder aceptación. Eventos repetidos no crean trabajos equivalentes. Reintentos con backoff y jitter solo para fallos transitorios; respetar Retry-After. Credencial inválida requiere intervención.

Al reiniciar, recuperar trabajos con lease vencido. Antes de publicar, revalidar estado de PR, activación de repositorio y hashes. Un trabajo antiguo no debe sobrescribir el resumen del más reciente.

Cada llamada HTTP tiene timeout y tamaño máximo. Configurar topes de coste técnico por trabajo mediante cantidad de llamadas/tokens; el presupuesto mensual sigue siendo un aviso.

## Observabilidad

Logs estructurados con run_id, repository_id y PR. Sin cuerpos completos, claves, passwords ni razonamiento interno del modelo. Medir tiempos, cola, fallos, reintentos, tokens, publicaciones y cobertura.

Las pruebas del servicio validan la integración; no sustituyen la evaluación de la calidad de las revisiones.
