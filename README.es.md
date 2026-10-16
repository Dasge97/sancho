<div align="center">

<img src="src/web/public/sancho-mark-192.png" alt="Logotipo de Sancho: un escudero con sombrero y barba mirando un portátil, sobre un círculo amarillo" width="96">

# Sancho

**El escudero de tus pull requests.**<br>
Revisa con IA cada pull request de Bitbucket Cloud y comenta, en la línea exacta, los problemas que de verdad importan.

[English](README.md) · **Español**

[![Versión](https://img.shields.io/badge/versi%C3%B3n-0.1.0-2e7d5b)](https://github.com/Dasge97/sancho/commits/main)
[![Bitbucket Cloud](https://img.shields.io/badge/Bitbucket-Cloud-0052CC?logo=bitbucket&logoColor=white)](https://bitbucket.org)
[![OpenAI](https://img.shields.io/badge/OpenAI-API-412991?logo=openai&logoColor=white)](https://platform.openai.com)
[![Node.js 22](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](#instalación)
[![Licencia](https://img.shields.io/badge/licencia-sin%20definir-lightgrey)](#licencia)
[![Último cambio](https://img.shields.io/github/last-commit/Dasge97/sancho?label=%C3%BAltimo%20cambio)](https://github.com/Dasge97/sancho/commits/main)

<img src="docs/img/portada.png" alt="Panel de Sancho en modo claro: menú lateral verde oscuro con Panel activo, migas de pan arriba, cuatro cifras (en cola, en curso, análisis de IA e inversión del mes) y la tabla de actividad reciente con seis revisiones y su estado." width="100%">

[![Instalar](https://img.shields.io/badge/Instalar-2e7d5b?style=for-the-badge)](#instalación)
&nbsp;
[![Cómo funciona](https://img.shields.io/badge/C%C3%B3mo%20funciona-555?style=for-the-badge)](docs/04-revision.md)

</div>

> **Estado:** V1 desplegada y probada contra Bitbucket Cloud y OpenAI reales en un repositorio de prueba. Falta evaluar la calidad con pull requests reales del equipo antes de activar los comentarios automáticos. El detalle está en [PROGRESS.md](PROGRESS.md).

## Para qué sirve

Toda aventura necesita a alguien que haga la pregunta incómoda: **«¿Y si ese usuario intenta ver los datos de otro?»**

Sancho es esa segunda mirada para tus pull requests. Lee los cambios, consulta el código relacionado y comenta solo lo que puede demostrar: fallos de seguridad, de autorización y regresiones. Está pensado para equipos de **PHP, Symfony y Laravel** que trabajan en **Bitbucket Cloud**, y es especialmente útil cuando quien programa también es una IA.

Sancho informa y comenta. **La decisión de fusionar sigue siendo de tu equipo**: nunca aprueba, bloquea ni fusiona una pull request.

## Qué hace

- **Revisa solo cada pull request** en cuanto se abre o recibe cambios, gracias a un webhook por repositorio. Los borradores se omiten.
- **Lee antes de opinar**: el diff a commits fijos y los ficheros que cambian, con los secretos ocultados antes de enviar nada a la IA.
- **Se revisa a sí mismo**: una segunda llamada al modelo descarta lo que no puede justificar, y el servidor comprueba que cada problema está en una línea añadida.
- **Comenta con tres frases**: qué pasa, por qué importa y cómo se arregla, en la línea exacta. Un resumen por pull request, que se actualiza en lugar de repetirse.
- **No repite comentarios** entre versiones de la misma pull request y no publica resultados de un código que ya ha cambiado.
- **Separa «no he encontrado nada» de «no he podido revisarlo»**: una revisión parcial o fallida se ve como tal.
- **Controla el gasto**: coste por revisión y por día, y un presupuesto mensual que avisa sin frenar las revisiones.
- **Panel para todo el equipo**, con cuentas locales, dos roles (miembro y administración), auditoría de cambios y modo claro y oscuro.

| Comentario en la pull request | Detalle en el panel |
| --- | --- |
| 🔴 **Inyección SQL en la búsqueda**<br>Un usuario puede eludir el filtro y leer facturas ajenas.<br>**Arreglo:** usa parámetros enlazados en `DB::select`. · Detalle | <img src="docs/img/revision.png" alt="Detalle de una revisión: subpestañas Problemas, Qué se ha revisado y Consumo; un problema de gravedad alta con su título, fichero y línea, impacto y arreglo." width="420"> |

<div align="center">

<img src="docs/img/revisiones.png" alt="Historial de revisiones con subpestañas Todas, En curso, Completadas y Con incidencias, y una tabla con el resultado de cada pull request y lo que se ha publicado en Bitbucket." width="100%">

<img src="docs/img/modo-oscuro.png" alt="El detalle de una revisión en modo oscuro, con fondo verde muy oscuro y textos claros." width="49%">
<img src="docs/img/movil.png" alt="El historial de revisiones en un móvil: cada revisión es una tarjeta con su repositorio, resultado, estado en Bitbucket y fecha." width="22%">

</div>

## Instalación

Necesitas Docker con Docker Compose. Node.js 22.12 o superior solo hace falta para desarrollar fuera de Docker.

```bash
git clone https://github.com/Dasge97/sancho.git
cd sancho
cp .env.example .env
```

Rellena el `.env` con valores propios:

```bash
openssl rand -hex 32      # para POSTGRES_PASSWORD y SESSION_SECRET
openssl rand -base64 32   # para SANCHO_ENCRYPTION_KEY (guárdala fuera del servidor)
```

Arranca y crea la primera cuenta de administración:

```bash
docker compose up --build -d
docker compose exec api node dist-server/admin.js tu@correo.com 'una-contraseña-de-12-o-más'
```

Abre `http://localhost:3000` y entra.

**Para publicarlo en internet** (necesario para que Bitbucket envíe los webhooks): pon tu dominio en `PUBLIC_BASE_URL` y `CADDY_DOMAIN`, cambia `SESSION_COOKIE_SECURE=true` y arranca con `docker compose --profile production up --build -d`. Caddy se encarga del certificado HTTPS. Si ya tienes un proxy con HTTPS, apúntalo al puerto `SANCHO_PORT` y no uses el perfil `production`.

## Uso

1. **Ajustes → Bitbucket**: guarda el workspace, el correo de la cuenta de Atlassian y un API token, y pulsa «Probar conexión».
2. **Ajustes → OpenAI**: guarda la clave de la API. En **Modelo y costes**, elige el modelo y sus tarifas, y comprueba que responde.
3. **Repositorios → Sincronizar con Bitbucket**: activa los repositorios que quieras y pulsa «Instalar webhook» en cada uno.
4. Abre una pull request en Bitbucket. En menos de un minuto tendrás la revisión en **Revisiones**.
5. Cuando los comentarios te convenzan, activa **Ajustes → Publicación** para que Sancho comente en Bitbucket él solo. Mientras tanto, «Revisar y comentar» en Repositorios publica a mano.

<div align="center">
<img src="docs/img/ajustes.png" alt="Ajustes con las subpestañas Bitbucket, OpenAI, Modelo y costes y Publicación; abierta la de Publicación con el interruptor de comentarios automáticos." width="100%">
</div>

## Configuración

| Variable | Para qué sirve |
| --- | --- |
| `POSTGRES_PASSWORD` | Contraseña de la base de datos. |
| `SESSION_SECRET` | Firma de las sesiones del panel. |
| `SANCHO_ENCRYPTION_KEY` | Cifra las credenciales de Bitbucket y OpenAI (32 bytes en base64). Sin ella no se pueden leer ni las copias de seguridad. |
| `SESSION_COOKIE_SECURE` | `true` con HTTPS; `false` solo en local. |
| `PUBLIC_BASE_URL` | URL pública del panel. Hace falta para instalar webhooks y para los enlaces «Detalle» de los comentarios. |
| `CADDY_DOMAIN` | Dominio para el certificado HTTPS de Caddy (perfil `production`). |
| `SANCHO_PORT` | Puerto local del panel (por defecto `3000`, solo en `127.0.0.1`). |
| `OPENAI_MAX_OUTPUT_TOKENS` | Límite de salida por llamada a OpenAI (por defecto `16000`; incluye el razonamiento). |

**Permisos del API token de Atlassian** (créalo en id.atlassian.com con «Create API token with scopes» y la aplicación Bitbucket): `read:repository:bitbucket`, `read:pullrequest:bitbucket`, `write:pullrequest:bitbucket`, `read:webhook:bitbucket` y `write:webhook:bitbucket`. La cuenta tiene que ser administradora de los repositorios para instalar el webhook. Los comentarios salen con el nombre de esa cuenta, así que conviene una cuenta solo para Sancho.

**Copias de seguridad**: `sh scripts/backup.sh [carpeta]` guarda un volcado de PostgreSQL y `sh scripts/restore.sh <fichero.dump>` lo restaura.

**Pruebas**: `npm test`. Con `TEST_DATABASE_URL` apuntando a una base de datos desechable, también se prueba el recorrido webhook → revisión → publicación con Bitbucket y OpenAI simulados. Para ver el panel con datos de ejemplo sin conectar nada: `docker compose exec api node dist-server/simulator.js`.

## Cómo funciona

```mermaid
flowchart LR
    BB["Bitbucket Cloud"] -->|webhook firmado| API["API · Node.js"]
    Panel["Panel · Vue"] --> API
    API --> DB[("PostgreSQL<br>cola de trabajos")]
    Worker["Worker de revisión"] <--> DB
    Worker <-->|diff y comentarios| BB
    Worker <-->|detección y verificación| IA["OpenAI"]
```

El API recibe los webhooks, comprueba su firma y deja un trabajo en una cola de PostgreSQL. El worker lee el diff, pide a la IA los posibles problemas, le pide después que los verifique y comprueba él mismo que cada uno está en una línea añadida. Antes de publicar, confirma que la pull request no ha cambiado de commit. El código y los comentarios de los repositorios se tratan como datos, nunca como instrucciones, y Sancho no ejecuta nunca el código que revisa.

El detalle está en [docs/](docs/): [arquitectura](docs/03-arquitectura.md), [motor de revisión](docs/04-revision.md), [datos y contratos](docs/05-contratos.md) y [validación y operación](docs/07-validacion-operacion.md).

## Documentación

| Documento | Contenido |
| --- | --- |
| [Decisiones y alcance](docs/01-decisiones.md) | Qué está decidido y qué sigue siendo propuesta. |
| [Panel y experiencia](docs/02-panel.md) | Pantallas, acciones, roles y estados. |
| [Arquitectura](docs/03-arquitectura.md) | Componentes, integraciones y secretos. |
| [Motor de revisión](docs/04-revision.md) | Contexto, verificación, comentarios y concurrencia. |
| [Datos y contratos](docs/05-contratos.md) | Entidades, API interna y consumo. |
| [Implementación](docs/06-implementacion.md) | Fases, tareas y criterios de aceptación. |
| [Validación y operación](docs/07-validacion-operacion.md) | Pruebas, evaluación de calidad y despliegue. |
| [Correcciones futuras](docs/08-correcciones.md) | «Sancho, arréglalo»: lo que vendrá después de la V1. |
| [Progreso](PROGRESS.md) | Qué está hecho y comprobado de verdad. |

## Licencia

Todavía sin licencia. Mientras no se publique una, el código está visible pero todos los derechos están reservados.

---

<div align="center">

**Sancho. El sentido común también merece un sitio en la pull request.**

*«Con su permiso: eso no es un gigante. Es un null sin comprobar.»*

</div>
