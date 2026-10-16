# 01 · Decisiones y alcance

## Confirmado por el usuario

| ID | Decisión |
| --- | --- |
| D01 | Planificación inicial seguida de autorización expresa para implementar la V1 en este repositorio (15-10-2026). |
| D02 | Bitbucket Cloud, en bitbucket.org. |
| D03 | Panel central para toda la configuración habitual y consulta de datos. |
| D04 | Uso por varias personas del mismo equipo. |
| D05 | V1: panel y revisiones. Correcciones en una fase posterior. |
| D06 | Revisar PR al abrirse y con nuevas actualizaciones; omitir borradores. |
| D07 | OpenAI mediante una clave API del equipo. |
| D08 | Primeros repositorios PHP, Symfony y Laravel. |
| D09 | Despliegue Docker en VPS o servidor de empresa. |
| D10 | Volumen inicial previsto: hasta 10 revisiones al día. |
| D11 | Informar y comentar; la herramienta no decide ni bloquea fusiones. |
| D12 | Acceso con correo y contraseña; un administrador crea las cuentas. |
| D13 | Todos los miembros ven todos los repositorios conectados. |
| D14 | Al superar el presupuesto mensual configurado: avisar y continuar revisando. |
| D15 | Prioridad explícita: comentarios coherentes, útiles y sin basura. |
| D16 | Futuro deseado: ordenar una corrección desde un comentario de la PR. |
| D17 | Stack confirmado: Node.js + TypeScript + Vue + PostgreSQL. |
| D18 | Nombre del producto: Sancho. Repositorio de desarrollo: Dasge97/sancho en GitHub; integración de revisión: Bitbucket Cloud. |
| D19 | Las instrucciones del modelo viven en `prompts/` y administración añade reglas generales y por repositorio desde Ajustes → Reglas de revisión (16-10-2026). |
| D21 | Motor de revisión: un agente del Claude Agent SDK en el servicio interno `cerebro`, con la sesión de suscripción de Claude del servidor (la misma que usa podcaster). El agente decide qué leer con las herramientas del propio SDK; en revisión, solo `Read`, `Grep` y `Glob` dentro de una copia del repositorio en el commit de la PR. OpenAI se mantiene como alternativa en Ajustes. Sustituye a D07 como motor por defecto. El mismo motor servirá para las correcciones (fase 6) con herramientas de escritura (16-10-2026). |
| D20 | Se guarda en el servidor lo que se envía al modelo y su respuesta en cada revisión, para poder auditarla. Sin pantalla en el panel: solo por consola (`dist-server/ai-log.js`). Se borra a los 30 días (`AI_EXCHANGE_RETENTION_DAYS`) y lleva los secretos ya ocultados. Cambia la regla 9 de AGENTS.md (16-10-2026). |

## Propuestas de diseño, todavía no confirmadas expresamente

| ID | Propuesta base | Motivo y alternativa |
| --- | --- | --- |
| P01 | Detalles del stack confirmado: Express, Vue 3 y Vite | Node.js, TypeScript, Vue y PostgreSQL ya están confirmados en D17; estas bibliotecas y versiones son propuestas de implementación. |
| P02 | PostgreSQL para datos y cola; un worker inicial | Pocas operaciones; evita añadir Redis. |
| P03 | Roles administrador y miembro | El miembro consulta, solicita revisiones y da feedback; el administrador configura y gestiona cuentas. |
| P04 | Una conexión inicial con un workspace Bitbucket | Evita complejidad de varias credenciales. El esquema admite añadir conexiones posteriormente. |
| P05 | Token API de una identidad técnica del equipo, con permisos mínimos | Autenticación independiente de los usuarios del panel. Confirmar la política y disponibilidad de la identidad en la empresa. |
| P06 | Comentarios en español | Interfaz y usuarios actuales en español; configurable por repositorio. |
| P07 | Publicar impactos medios, altos y críticos sustentados; estilo fuera por defecto | Favorece la utilidad frente a la cantidad. |
| P08 | Cuentas activadas y recuperadas con enlaces de un solo uso que entrega el administrador | Evita exigir SMTP en V1; no habrá registro público. |
| P09 | Retención inicial: 90 días de revisiones y 24 horas de contenido temporal | Valores editables; ajustar a necesidades de empresa. |
| P10 | No ejecutar proyectos revisados en V1 | La lectura contextual funciona sin Composer, Artisan ni pruebas del cliente; ejecución aislada en fase posterior. |

No inventar la aprobación de estas propuestas. Se puede diseñar y probar localmente sobre ellas, manteniendo decisiones reversibles. El stack D17 está cerrado y no requiere nueva confirmación. Resolver los detalles de bibliotecas de P01 durante la fase 0. Antes de conectar Bitbucket, concretar P05 con el propietario; no volver a preguntar D01–D18.

## Pendientes que se configuran al desplegar

Dominio, workspace, repositorios a revisar, correo administrador, token Bitbucket, clave OpenAI, modelo disponible, importe de aviso mensual y tarifas de referencia. El nombre Sancho y el repositorio Dasge97/sancho ya están confirmados. No son bloqueos para desarrollar con simuladores. No incluir credenciales reales en este paquete.

El límite mensual es un aviso, no un corte. Habrá límites técnicos por trabajo (tiempo, tamaño y llamadas) para impedir bucles; superar uno produce revisión parcial o fallida con explicación. Estos límites no se usarán para introducir un corte mensual encubierto.

## Qué constituye una primera versión útil

Un administrador configura conexiones y activa un repositorio desde el panel; una PR real de prueba produce una revisión contextual, comentarios no duplicados y un consumo visible. Una actualización provoca una revisión nueva sin publicar resultados obsoletos. Un miembro puede consultar el resultado y solicitar repetición.

## Fuera de V1

Correcciones, escritura de código, aprobación o rechazo automático, merge, bloqueo de ramas, facturación SaaS, empresas aisladas, login federado, permisos individuales por repositorio, chat general, extensión IDE, GitHub/GitLab y avisos por correo o Slack.

Excluir una capacidad de V1 no equivale a prohibirla en el producto futuro.

## Cambio de alcance registrado

El usuario pidió «revisa este proyecto, e implementalo entero» el 15 de octubre de 2026. Esta instrucción actualiza D01 y autoriza implementar la V1 especificada. Las reglas de no desplegar, no publicar cambios remotos, no modificar código de repositorios revisados y no aprobar o fusionar PR permanecen vigentes.
