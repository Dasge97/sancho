# Trabajar en Sancho

Sancho es un revisor de PR de Bitbucket Cloud. Este repositorio contiene una aplicación V1 en desarrollo; distingue funciones implementadas de planificadas y no confundas un simulador con una integración real.

1. Lee README.md, docs/01-decisiones.md, HANDOFF.md y PROGRESS.md antes de implementar.
2. Sigue las tareas y criterios de salida de docs/06-implementacion.md. Actualiza PROGRESS.md con lo que realmente se haya hecho y comprobado.
3. Stack confirmado: Node.js + TypeScript + Vue + PostgreSQL. No volver a preguntar decisiones D01–D18.
4. V1: panel, cuentas locales, revisión con OpenAI, comentarios en Bitbucket y consumo. Las correcciones quedan fuera de V1.
5. El presupuesto mensual avisa y permite continuar. No convertirlo en un corte.
6. Todos los miembros ven todos los repositorios conectados. Los permisos de configuración se validan en servidor.
7. No ejecutar código de los proyectos revisados ni modificarlo en V1. No aprobar, bloquear ni fusionar PR.
8. Priorizar evidencia, cobertura explícita, deduplicación y prevención de resultados obsoletos.
9. No guardar secretos, datos privados de clientes ni respuestas completas del proveedor en fixtures o logs.
10. Desarrollar con simuladores cuando falte configuración externa; concretar credenciales e identidad antes de conectar servicios reales.
11. Validar cada entrega con pruebas relevantes. Distinguir pruebas del servicio, integración real y evaluación del modelo.
12. Mantener el humor en la presentación del producto; los comentarios de revisión deben ser claros y profesionales.

La documentación es la especificación inicial. Ante cambios expresos del usuario, actualizar las decisiones y los documentos afectados para conservar una fuente coherente.
