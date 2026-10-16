# 04 · Motor de revisión y publicación

## 1. Recepción y planificación

Recibir webhooks con cuerpo original, verificar firma y validar esquema antes de procesar. La firma de Bitbucket Cloud se recibe en X-Hub-Signature; implementar según documentación oficial, con comparación de tiempo constante y límite de tamaño [S1]. Un webhook no autorizado no produce llamadas a IA.

Suscribir creación/actualización de PR, cierre/fusión y pushes relevantes según catálogo Cloud vigente. No asumir que actualizar el texto de una PR equivale a nuevo código ni que todos los pushes generan el mismo evento. Registrar eventos reales de una PR de prueba para confirmar cobertura.

Ante push, localizar PR abiertas afectadas por ramas origen y destino; consultar estado actual antes de decidir. Una modificación de descripción no dispara una revisión del mismo código automáticamente. Pasar de borrador a preparada sí debe revisar el estado actual. Un cambio de base/destino requiere revaluación.

Añadir reconciliación periódica de PR abiertas en repositorios activos (propuesta: cada 10 minutos) para detectar eventos perdidos y cambios de forks que no generen un webhook local. Respetar paginación y cuotas; no revisar repetidamente hashes ya procesados.

Identidad automática: conexión + UUID repositorio destino + número PR + SHA origen + SHA destino + versión de configuración + versión de prompt. Diferenciar solicitudes manuales mediante una generación explícita. No basar la identidad en slugs que pueden cambiar.

Debounce propuesto de 30 segundos por PR. Al aparecer una versión nueva, invalidar trabajos anteriores pendientes; si ya están ejecutando, permitir contabilizar llamadas pero cancelar su publicación. Registrar cada decisión.

## 2. Snapshot y cobertura

Obtener estado de la PR, ambos commits, diff y lista de archivos. Mantener el mismo par de commits durante todo el análisis; no leer contenido desde nombres de rama móviles.

Para PR con fork, resolver origen y destino por separado y verificar lectura del origen. Si no se puede leer, informar revisión parcial/no realizable, nunca analizar silenciosamente otro repositorio.

Seleccionar archivos relevantes:
- Código de aplicación y cambios de configuración, rutas, esquema y dependencias.
- Excluir vendor, node_modules, builds, cachés, binarios y secretos.
- No excluir todos los archivos lock: composer.lock puede aportar contexto de compatibilidad; limitar su lectura.
- Respetar exclusiones del administrador antes de cualquier llamada al proveedor.

Construir contexto con imports, clases referenciadas, funciones llamadas, permisos, rutas y pruebas relacionadas. Extraer fragmentos con ruta, SHA y líneas. En PHP dinámico no prometer resolución perfecta. El modelo puede pedir contexto adicional mediante herramientas exclusivamente de lectura sobre el repositorio autorizado, con presupuesto fijo.

Topes iniciales propuestos y editables: 60 archivos modificados, 250 KB por archivo leído, 1 MB de contexto bruto acumulado, 6 llamadas al proveedor y 10 minutos por revisión. Ajustar al contexto del modelo y al conjunto de evaluación; no enviar automáticamente 1 MB. Contar o estimar tokens antes de cada llamada y reservar salida. Un límite alcanzado produce cobertura parcial explícita.

## 3. Detección

**Implementación (16-10-2026).** Las instrucciones del modelo están en `prompts/deteccion.md` y `prompts/verificacion.md`, versionadas con el código. Se envían en el campo `instructions` de la API de OpenAI; el diff y el contexto van en `input`, dentro de las etiquetas `<pull_request>`, `<diff>` y `<contexto>`, como datos no confiables. Cada línea del diff lleva su número en el fichero nuevo (`+L28|` añadida, ` L27|` sin cambios) para que el modelo no tenga que calcularlo.

Al final de las instrucciones se añaden, si existen, las reglas de Ajustes → Reglas de revisión: de qué va el proyecto, reglas generales y reglas del repositorio. La huella de las instrucciones completas se guarda en la cobertura de cada revisión (`prompt_version`).

Contexto que recibe el modelo (`src/context.ts`): hasta 8 ficheros cambiados (16 KB cada uno) y hasta 8 relacionados (12 KB cada uno), con un máximo de 60 000 caracteres. Los relacionados son las clases importadas con `use` y resueltas con el autoload PSR-4 de `composer.json`, la política de Laravel de cada modelo usado y, si cambia un controlador, los ficheros de rutas y `config/packages/security.yaml`. Todo pasa por el ocultado de secretos. Si se recorta algo, la revisión queda como parcial.

La verificación devuelve, además de la decisión, la gravedad que considera correcta; se publica esa. Lo enviado y la respuesta de cada llamada se guardan en `ai_exchanges` (D20) y se consultan con `node dist-server/ai-log.js [id-de-revisión]`.

Prioridades: errores introducidos o agravados por la PR, controles de autorización, separación de clientes/usuarios, validación, SQL inseguro, transacciones, migraciones, compatibilidad con versiones presentes y regresiones demostrables.

No informar fallos antiguos sin conexión con la PR, preferencias personales, falta de tests genérica ni problemas que requieren suposiciones no sustentadas.

La primera pasada devuelve candidatos estructurados: título, ubicación, categoría, severidad, escenario, impacto, evidencia y orientación de corrección. Pedir evidencia observable, no una transcripción del razonamiento interno.

Todo contenido del repositorio, PR y comentarios es dato no confiable. Instrucciones como «ignora el prompt», URLs o comandos dentro del código no cambian la política ni autorizan herramientas. Las reglas editadas por un administrador tienen precedencia sobre sugerencias del repositorio; ninguna amplía permisos del motor.

## 4. Verificación

Validaciones deterministas: ruta existente, SHA correcto, rango válido, fragmento coincidente, vínculo con los cambios y ubicación publicable.

Segunda comprobación IA de candidatos con contexto dirigido: buscar mitigaciones existentes, verificar escenario e impacto y descartar suposiciones. No se ejecuta si no hay candidatos. Puede usar el mismo modelo inicialmente; no es una garantía independiente ni demuestra que no quedan errores.

Publicable exige:
- Evidencia localizable que respalde el diagnóstico.
- Impacto concreto y severidad igual o superior al umbral.
- Relación con cambios de la PR.
- Verificador conforme y validación determinista satisfactoria.
- Ausencia de duplicado.

No usar un porcentaje inventado de confianza como único filtro. Si falta contexto, descartar el comentario acusatorio y mostrar la limitación en el resumen. Si falla la verificación, no publicar candidatos como confirmados.

## 5. Resultado y comentarios

Un resumen del bot por PR, actualizado: commit revisado, alcance, hallazgos, limitaciones y estado. No afirmar «PR segura» ni aprobar automáticamente.

Comentario en línea (decidido el 16-10-2026: breve, tres líneas; el detalle completo queda en el panel):

    🔴 **Registro ajeno accesible por su id**
    Un usuario autenticado puede leer registros de otras personas cambiando el id.
    **Arreglo:** aplica la política de autorización antes de devolverlo. · [Detalle](enlace al panel)

Resumen de la PR: índice numerado con gravedad, título corto y `fichero:línea`, sin repetir el texto de los comentarios; una línea final con ficheros revisados, commit y enlace a la revisión completa. Sin hallazgos, una sola línea. Si la revisión fue parcial, una línea de aviso. 🔴 = crítico o alto; 🟠 = medio.

El modelo devuelve campos cortos (`short_title` ≤ 60, `short_impact` ≤ 140, `short_fix` ≤ 140 caracteres) además del detalle largo; el servidor los recorta si se pasan. La marca para reconocer comentarios propios va en los parámetros del enlace «Detalle», porque Bitbucket muestra los comentarios HTML como texto.

Es un ejemplo ficticio, no un hallazgo real. Los comentarios definitivos deben contener evidencia del proyecto concreto.

Límite propuesto: 8 comentarios en línea nuevos por revisión; priorizar mayor impacto. El resumen indica si hay hallazgos adicionales y enlaza al detalle del panel. No ocultar silenciosamente hallazgos por superar un límite. No publicar código de corrección sin revisar en V1.

Una ubicación no admitida por Bitbucket puede mostrarse en el resumen con ruta y línea del snapshot; no inventar un anclaje ni desplazarlo a una línea no relacionada.

## 6. Duplicados, estados y cambios

Huella determinista aproximada: repositorio + PR + ruta normalizada + categoría + símbolo/fragmento estable normalizado. No usar solo línea ni título redactado por IA. Comparar también evidencia para no fusionar fallos distintos en una misma función. Conservar vínculo a comentarios remotos.

Estados de seguimiento: nuevo, persistente, aparentemente corregido, descartado por usuario y no reevaluado. La ausencia en una nueva respuesta del modelo no prueba que se corrigió. «Aparentemente corregido» exige comprobación dirigida con cobertura suficiente. No resolver automáticamente conversaciones de humanos en V1.

Ante renombre o cambio de líneas, usar evidencia y diff para asociar el hallazgo previo. Si no hay correspondencia clara, reflejarlo; no forzar deduplicación errónea.

## 7. Publicación robusta

Guardar operaciones de publicación en outbox antes de llamar a Bitbucket. Incluir marcador estable discreto en comentarios propios y almacenar IDs remotos. Ante timeout de una creación, consultar comentarios propios y reconciliar antes de repetir. No prometer exactly-once cuando el sistema remoto no ofrece esa garantía.

Revalidar hashes y estado inmediatamente antes de publicar. La API no proporciona necesariamente una transacción entre verificar PR y comentar: si cambia durante la publicación, detener operaciones restantes, marcar el resultado obsoleto y no sobrescribir el resumen de una revisión posterior.

El worker serializa publicaciones por PR. Un error publicando un comentario no relanza el análisis IA completo: reintentar solo la operación pendiente. Mostrar diferencias entre análisis completado y publicación parcial.

No responder a comentarios del bot ni disparar nuevas revisiones por sus propios mensajes.
