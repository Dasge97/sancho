# 08 · Correcciones futuras

Capacidad solicitada para una fase posterior. Este documento conserva la intención; no autoriza implementarla en V1.

## Flujo recomendado

1. Un usuario autorizado responde a un hallazgo del bot con un comando, por ejemplo /revisor corregir.
2. El sistema identifica el hallazgo, la PR, el SHA actual y el autor mediante UUID remoto.
3. Comprueba que el problema sigue existiendo y que la PR permite trabajar en su rama origen.
4. Crea un trabajo aislado, limitado a ese hallazgo.
5. El agente propone un parche mínimo y ejecuta las comprobaciones configuradas.
6. Si cumple los criterios acordados, entrega el cambio según la política seleccionada.
7. Responde en el hilo con commit o PR alternativa, cambios, pruebas ejecutadas y limitaciones.
8. El revisor examina el nuevo commit sin iniciar otra corrección automáticamente.

No aceptar órdenes de cualquiera que pueda comentar. Vincular cuentas del panel a UUID de Bitbucket y comprobar membresía y permisos actuales. Ignorar órdenes del propio bot. Deduplicar comando + versión y no interpretar instrucciones libres como autorización ilimitada.

## Decisiones para antes de implementar

- Aplicar un commit a la rama origen o abrir una PR alternativa.
- Quién puede solicitar correcciones y si necesitan aprobación adicional.
- Qué se hace si no existen pruebas o no se pueden ejecutar.
- Límites de archivos, intentos, tiempo y coste.
- Cómo operar sobre forks y ramas protegidas.
- Acceso a dependencias privadas sin exponer credenciales al código ejecutado.
- Cuándo se puede declarar un hallazgo corregido.

Recomendación inicial: un hallazgo por trabajo y ninguna fusión automática. En caso de tests ausentes o fallidos, entregar parche revisable sin afirmar éxito; política concreta pendiente.

## Aislamiento

Ejecutar código de una PR requiere un entorno aislado más fuerte que simplemente compartir el contenedor del worker. Sin acceso al host, Docker socket, base de datos, claves maestras ni secretos del revisor. Recursos acotados y salida de red controlada. Credenciales de publicación separadas del agente que ejecuta el código.

Instalar dependencias también puede ejecutar código; aplicar la misma política a Composer y scripts. Guardar comandos y resultados verificables, no razonamiento privado del modelo.

## Concurrencia y entrega

Partir de SHA concreto. Antes de publicar el cambio, comprobar que la rama no avanzó. Si avanzó, abortar o regenerar sobre el nuevo estado dentro del límite; nunca force-push ni sobreescritura.

PR cerrada, borrador o repositorio pausado cancelan nuevas publicaciones. Un cambio del bot provoca revisión normal, pero no un ciclo de reparaciones. Límite inicial propuesto: un intento y una validación por solicitud.

## Aceptación futura

Una orden no autorizada no modifica nada. Una orden válida para un fallo reproducible produce un cambio mínimo y evidencia de comprobaciones. Una carrera de commits no pisa trabajo humano. Un fallo informa al hilo y al panel sin afirmar que corrigió la PR.
