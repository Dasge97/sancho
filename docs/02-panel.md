# 02 · Panel y experiencia

## Principios

Interfaz en español, escritorio primero y usable en móvil. Mostrar resultados y acciones claras. Nunca etiquetar una revisión fallida o parcial como «todo correcto». Los gráficos iniciales deben servir para consumo y actividad; no crear métricas ficticias de productividad o dinero ahorrado. La identidad visual usa el logotipo de `assets/Seis logotipos de Sancho y programación.png` y la paleta del dosier: verde pino `#0F2D23`, verde `#2E7D5B`, acento `#46C278`, amarillo `#F4B942`, fondo crema `#FFF8E9`, superficies `#E6EDE6`, texto `#1A1D23` y texto secundario `#64748B`.

## Pantallas

### Acceso y primer arranque

El primer administrador se crea mediante un comando de instalación de un solo uso; no hay credenciales predeterminadas ni registro abierto. Después, el administrador crea cuentas desde el panel con rol y correo. Un enlace de activación permite que el usuario establezca su contraseña. Una cuenta deshabilitada pierde sus sesiones.

Estados: credenciales inválidas sin revelar si existe el correo, exceso de intentos, enlace caducado, cuenta deshabilitada y sesión caducada. Recuperación por enlace emitido por administrador; no prometer envío de correo sin SMTP.

### Inicio

Tarjetas: trabajos en cola, en curso, revisiones completadas, fallidas y parciales; coste estimado del mes. Lista de revisiones recientes con repositorio, PR, autor, commit corto, estado y enlace a Bitbucket.

Avisos persistentes: conexión inválida, token próximo a caducar cuando se conozca su fecha, presupuesto superado, tarifa desconocida y trabajos atascados. El aviso de presupuesto dice expresamente que las revisiones continúan.

### Repositorios

Lista obtenida de la conexión elegida con paginación, búsqueda y activación. Conectar no activa todos los repositorios. Mostrar estado del webhook, última actividad y última sincronización.

Activar: verificar lectura y capacidad de comentar; crear el webhook con secreto cuando haya permiso. Si falta permiso de administración, mostrar instrucciones concretas para que un administrador de Bitbucket lo cree y comprobar la conexión después. La interfaz no debe afirmar «conectado» basándose solo en haber guardado una clave.

Pausar: impedir nuevos trabajos y nuevas publicaciones; las llamadas ya iniciadas pueden terminar y contabilizarse. No borrar resultados anteriores. Permitir revisión manual tras reactivar.

### Configuración del repositorio

Secciones:
- Contexto del proyecto: propósito, versiones de PHP/framework si se conocen, arquitectura y reglas de negocio.
- Revisión: idioma, categorías, severidad mínima, cantidad de comentarios en línea.
- Exclusiones: rutas, archivos generados y límites de tamaño.
- Reglas específicas: texto revisable con ejemplos y fecha de modificación.
- Operación: activación, estado de sincronización y límites por trabajo.

Distinguir «heredado de configuración general» de «personalizado». Guardar una versión y ofrecer vista de configuración efectiva. Probar configuración sobre una PR sin publicar comentarios desde el panel.

No exponer una caja de «prompt del sistema» editable por miembros. El contexto de negocio es entrada de revisión, no capacidad para ejecutar comandos.

### Revisiones

Filtros por repositorio, PR, estado, fecha y severidad. No filtrar por solo «problemas encontrados» de forma que desaparezcan errores operativos.

Detalle:
- PR y enlaces; hashes origen/destino y fecha del análisis.
- Resumen, archivos considerados y exclusiones con motivo.
- Hallazgos con impacto, evidencia, ubicación y orientación de solución.
- Publicación: pendiente, publicada, parcial, obsoleta o fallida.
- Consumo por análisis y validación, modelo y versiones de reglas.
- Comprobaciones ejecutadas por nuestra herramienta, separadas de pruebas del proyecto.
- Acciones: repetir revisión, abrir PR y marcar hallazgo como útil/falso positivo.

Repetir es una acción con consumo: mostrar confirmación breve con el último coste como referencia, no como presupuesto garantizado. Deshabilitar repeticiones simultáneas equivalentes.

Una revisión sin publicación de prueba sigue mostrando resultados y consumo. El feedback no borra comentarios ni convierte automáticamente un caso en una regla universal.

### IA y consumo

Clave OpenAI enmascarada y no recuperable desde el navegador después de guardarla. Botón de comprobación con aviso de que puede realizar una llamada mínima facturable. Modelo configurado de forma explícita y validado para salida estructurada; nada de aceptar cualquier ID como compatible sin comprobar.

Resumen diario y por repositorio: tokens, número de llamadas, coste estimado y fallos. Registrar tarifas con fecha y moneda; usar USD inicialmente para evitar conversión implícita. Si falta tarifa, mostrar «coste desconocido» en vez de cero.

Umbral mensual editable: aviso al aproximarse y al superarse, sin pausar. Propuesta: alertas al 80 % y 100 %, deduplicadas por mes y umbral. Calendario de presupuesto Europe/Madrid, fechas almacenadas en UTC.

### Equipo y auditoría

Administrador: crear, desactivar, cambiar rol y emitir enlaces de activación/restablecimiento. No permitir quitar el último administrador activo.

Miembro: ver todos los repositorios, revisiones y consumo; solicitar revisiones y dar feedback. No leer claves, cambiar conexiones, modificar presupuestos, gestionar usuarios ni configurar reglas. Propuesta P03, pendiente de ratificación.

Registro de cambios de configuración, roles, solicitudes manuales y credenciales rotadas. Registrar actor y fecha sin guardar secretos.

## Criterios visuales de aceptación

Estados de carga, vacío, error y reintento para cada pantalla conectada a datos. Formularios conservan los valores no secretos tras un error. Indicadores no dependen solo del color. Navegación por teclado, etiquetas de formulario y contraste legible.

Probar a 1440 px y 390 px. Datos de muestra claramente identificados y nunca mezclados con datos reales.
