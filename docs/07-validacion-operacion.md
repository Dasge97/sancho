# 07 · Validación y operación

## Matriz mínima de pruebas

| Caso | Resultado exigido |
| --- | --- |
| Login erróneo y rate limit | No revelar existencia del correo; limitar intentos. |
| Miembro modifica configuración por API | 403; sin cambios. |
| Activación/restablecimiento repetido | Segundo uso rechazado. |
| Firma ausente/alterada | Rechazo sin encolar ni llamar a OpenAI. |
| Evento repetido | Un trabajo automático para la misma identidad. |
| Borrador → preparado | Omisión inicial y revisión al prepararse. |
| Tres pushes seguidos | Revisar último snapshot tras debounce; versiones previas no publican. |
| Push al destino de PR | Detectar cambio del par de commits y revaluar. |
| PR de fork sin acceso al origen | Limitación explícita, sin usar código de otro origen. |
| Cambio de nombre del repositorio | Identidad por UUID conservada. |
| Diff grande/truncado/binario | Cobertura parcial o exclusión documentada. |
| Archivo con instrucciones maliciosas | No cambia permisos, herramientas ni política. |
| Secretos en archivos excluidos | No se envían al proveedor ni se registran. |
| Proveedor timeout/429/5xx | Reintento acotado; consumo conocido y desconocido distinguido. |
| JSON incompleto/rechazo | Resultado no publicable; error explicable. |
| Hallazgo sin evidencia/línea inválida | Descartado o reformulado en resumen sin anclaje falso. |
| Comentario creado pero respuesta perdida | Reconciliación remota antes de repetir. |
| PR cambia durante publicación | Resultado antiguo no sobrescribe el nuevo. |
| Fallo solo al publicar | No repetir la revisión IA. |
| Presupuesto mensual superado | Aviso visible; siguiente revisión se ejecuta. |
| Tarifa desconocida | Coste desconocido, nunca cero ficticio. |
| Worker se cae y reinicia | Recuperar trabajo persistente y conservar idempotencia. |
| Pausa de repositorio en curso | Impedir publicaciones nuevas; contabilizar llamadas iniciadas. |
| Fallo de cobertura en nueva revisión | No declarar corregidos todos los hallazgos anteriores. |

## Evaluación de calidad

Crear al menos 20 pares de fixtures: versión defectuosa y variante corregida. Repartir entre autorización, validación, transacciones, migraciones, compatibilidad y falsos positivos frecuentes de PHP/Symfony/Laravel. Cada caso tiene explicación humana esperada, líneas relevantes y contexto.

Incluir mitigaciones indirectas: middleware, voter/policy, validación previa y restricciones de base de datos. El revisor debe consultar contexto para no denunciar como fallo un control que existe en otra capa.

La evaluación no compara frases exactas: compara problema, impacto y evidencia. Las pruebas unitarias con simuladores evalúan software; las llamadas al modelo real evalúan calidad variable.

Métricas:
- Precisión: hallazgos correctos / hallazgos publicados evaluados.
- Recuperación: errores conocidos detectados / errores conocidos incluidos.
- Tasa de comentarios duplicados.
- Hallazgos obsoletos publicados.
- Porcentaje de revisiones parciales.
- Coste mediano y máximo observado; tiempo mediano y percentil 95.
- Feedback útil/falso positivo, con denominador y muestra.

Propuesta de puerta inicial: al menos 90 % de precisión en la muestra etiquetada y al menos 70 % de recuperación de fallos graves incluidos, además de cero duplicados/obsoletos en los escenarios deterministas. Son objetivos propuestos, no rendimiento demostrado. Registrar resultados por modelo y versión de prompt. No conseguir «precisión perfecta» evitando publicar cualquier hallazgo.

Después evaluar un grupo de PR reales autorizado, inicialmente sin publicación, y revisar manualmente los resultados antes de generalizar. Nunca usar automáticamente código privado como fixture público.

## Operación

- HTTPS obligatorio; webhook público y autenticado por firma.
- Desplegar inicialmente un worker y una base de datos con backups.
- No fijar recursos mínimos sin medir repositorios representativos; registrar RAM, disco y tiempos en fase 5.
- Llamadas salientes limitadas a servicios necesarios. Base de datos no expuesta a Internet.
- Una revisión fallida no equivale a PR aprobada y no altera reglas de fusión.
- Credenciales revocadas muestran aviso y repositorios afectados; evitar bucles de reintento.
- Reintentos propuestos: máximo 3 en fallos transitorios, separados por backoff; no repetir validaciones fallidas de forma indefinida.
- Retención propuesta: revisiones 90 días, archivos temporales 24 horas; conservar agregados de coste sin código y auditoría según configuración.
- Pausar no borra comentarios. Borrar una conexión desactiva nuevos trabajos; no eliminar comentarios históricos automáticamente.
- Comprobar reinicios, actualización de migraciones y rollback de versión compatible.

## Backup y restauración

Backup periódico cifrado de PostgreSQL. Custodiar la clave maestra fuera del backup de datos; sin ella no pueden recuperarse credenciales. Probar restauración en entorno aislado con publicaciones y llamadas IA deshabilitadas.

Tras restaurar, reconciliar comentarios y jobs antes de habilitar publicación para impedir duplicados. No reutilizar de inmediato una cola restaurada como si reflejara el estado actual remoto.

## Límites de V1

No ejecutar tests del proyecto revisado significa que las afirmaciones son basadas en análisis de código, no en reproducción dinámica. Mostrarlo en el panel. Ni la doble revisión ni un modelo caro eliminan falsos positivos o garantizan ausencia de fallos.

La herramienta no concede al equipo nuevos permisos remotos. Si Bitbucket u OpenAI rechazan una operación, reflejar el motivo sin intentar eludirlo.
