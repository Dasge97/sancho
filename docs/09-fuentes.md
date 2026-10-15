# 09 · Fuentes y comprobaciones técnicas

Consulta: 15 de octubre de 2026. Son referencias oficiales de integración; el diseño del producto y los límites propuestos son decisiones de este plan, no requisitos de los proveedores.

[S1] Atlassian — Manage webhooks
https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/
Base para creación de webhooks y firma mediante X-Hub-Signature.

[S2] Atlassian — Event payloads
https://support.atlassian.com/bitbucket-cloud/docs/event-payloads/
Catálogo de eventos Cloud y campos de payload. Confirmar transiciones draft, eventos de push y comportamiento real antes de cerrar el adaptador.

[S3] Atlassian — Pullrequests REST API
https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/
Lectura de PR, cambios y comentarios; creación/actualización de comentarios. Revisar campos de anclaje y permisos exactos. No utilizar APIs de aprobar, solicitar cambios ni fusionar en V1.

[S4] Atlassian — API tokens
https://support.atlassian.com/bitbucket-cloud/docs/api-tokens/
Los tokens API con scopes son la alternativa vigente a App passwords. No diseñar una integración nueva alrededor de App passwords.

[S5] Atlassian — Using API tokens
https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/
Autenticación de REST con correo Atlassian y API token. No insertar credenciales en URLs o logs.

[S6] Atlassian — API token permissions
https://support.atlassian.com/bitbucket-cloud/docs/api-token-permissions/
Los permisos de PR no sustituyen automáticamente los de lectura de repositorios. Verificar endpoints usados y permisos mínimos. Gestión de webhooks puede requerir capacidades adicionales.

[S7] OpenAI — Structured model outputs
https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses
Salida conforme a un esquema, con manejo de respuestas incompletas y rechazos. No acredita que los hallazgos sean verdaderos.

## Comprobaciones pendientes al implementar

- Versiones de librerías y APIs soportadas en ese momento.
- Modelo disponible para la cuenta y compatibilidad con el esquema elegido.
- Precios oficiales del modelo elegido; no hay estimación de gasto mensual validada.
- Identidad técnica, permisos, expiración y política de credenciales de la empresa.
- Campos exactos para comentarios en línea y comportamiento ante cambios de commit.
- Eventos de actualización de código y de transición de borrador.
- Límites de diff, paginación y cuotas efectivas del workspace.
- Fecha de retención y condiciones del proveedor aplicables a la cuenta.

No convertir estas comprobaciones en excusa para dejar sin implementar funcionalidades que sí pueden probarse con simuladores. Registrar cualquier bloqueo real y continuar con tareas independientes.
