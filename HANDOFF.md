# Instrucción para el modelo implementador

Estamos construyendo Sancho, un revisor de pull requests para Bitbucket Cloud con un panel interno. La implementación V1 fue autorizada expresamente el 15-10-2026. Lee README.md, docs/01-decisiones.md y PROGRESS.md antes de continuar código. La documentación contiene decisiones del usuario y propuestas técnicas; no son equivalentes.

Tu objetivo es implementar la primera versión descrita en docs/06-implementacion.md, por tareas pequeñas. El producto revisa PHP/Symfony/Laravel con la API de OpenAI y comenta problemas fundamentados. No modifica código ni bloquea fusiones en V1.

## Antes de empezar

1. Lee los documentos 01–07; consulta 08 solo para evitar cerrar futuras extensiones.
2. Inspecciona el repositorio de destino y sus instrucciones. No sobrescribas trabajo existente.
3. Resume decisiones confirmadas y propuestas abiertas. Usa Node.js + TypeScript + Vue + PostgreSQL, ya confirmado en D17. Concreta la identidad Bitbucket antes de conectar; no repitas preguntas ya respondidas.
4. Actualiza PROGRESS.md con el estado real, sin marcar nada implementado por existir una especificación.
5. Continúa desde la primera tarea incompleta. Explica qué cambiarás y qué validará su funcionamiento.

## Reglas de trabajo

- Implementa verticalmente por fases. Primero una entrega ejecutable, después la siguiente.
- Reutiliza contratos y simuladores; no construyas un segundo sistema paralelo.
- No sustituyas Bitbucket por GitHub ni Cloud por Data Center.
- Respeta que todos los miembros ven los repositorios y que el presupuesto mensual avisa pero NO detiene revisiones.
- La lectura de un repositorio nunca autoriza a ejecutar su código.
- La IA propone hallazgos; el servidor valida, deduplica y publica.
- No conviertas un error de proveedor o cobertura en «sin hallazgos».
- No publiques comentarios desde tests de forma accidental. El modo de pruebas utiliza simuladores o una PR explícitamente autorizada.
- No uses secretos reales para rellenar ejemplos. Solicita configuración por canales seguros cuando sea imprescindible.
- No elijas un modelo por su nombre de memoria: comprueba disponibilidad y salida estructurada, registra coste y evalúa.
- No añadas chat, marketplace, SaaS multiempresa ni correcciones a V1.
- No despliegues, hagas merge o empujes cambios remotos sin autorización correspondiente.
- No inventes pruebas realizadas. Distingue simulador, integración real y evaluación del modelo.
- Si falta una dependencia externa, desarrolla lo comprobable localmente y documenta el bloqueo.
- Cuando surja una contradicción, prevalecen las decisiones expresas del usuario; propone corregir la documentación.

## Al terminar cada tarea

Ejecuta los controles relevantes, informa resultados y actualiza PROGRESS.md. Incluye archivos cambiados, comandos ejecutados, limitaciones y siguiente tarea. No vuelvas a diseñar todo el sistema en cada sesión.

La fase siguiente puede continuar cuando la anterior cumpla su criterio de salida y exista autorización de implementación. La presente carpeta es planificación: por sí sola no demuestra que ningún componente esté operativo.

## Criterio final

La aplicación debe arrancar con Docker, permitir que un administrador configure el equipo y conexiones, revisar una PR y sus cambios, publicar resultados útiles sin duplicados, mostrar consumo y continuar al superar el aviso mensual. Las pruebas de control de acceso, concurrencia y recuperación son parte del producto, no extras.
