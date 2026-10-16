<div align="center">

<img src="src/web/public/sancho-mark-192.png" alt="Sancho logo: a squire with a hat and beard looking at a laptop, on a yellow circle" width="96">

# Sancho

**The squire for your pull requests.**<br>
AI review for every Bitbucket Cloud pull request, with comments on the exact line for the problems that really matter.

**English** · [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.1.0-2e7d5b)](https://github.com/Dasge97/sancho/commits/main)
[![Bitbucket Cloud](https://img.shields.io/badge/Bitbucket-Cloud-0052CC?logo=bitbucket&logoColor=white)](https://bitbucket.org)
[![OpenAI](https://img.shields.io/badge/OpenAI-API-412991?logo=openai&logoColor=white)](https://platform.openai.com)
[![Node.js 22](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](#installation)
[![License](https://img.shields.io/badge/license-not%20set-lightgrey)](#license)
[![Last commit](https://img.shields.io/github/last-commit/Dasge97/sancho?label=last%20commit)](https://github.com/Dasge97/sancho/commits/main)

<img src="docs/img/portada.png" alt="Sancho dashboard in light mode: dark green sidebar with Panel active, breadcrumbs at the top, four figures (queued, in progress, AI analyses and monthly spend) and the recent activity table with six reviews and their status." width="100%">

[![Install](https://img.shields.io/badge/Install-2e7d5b?style=for-the-badge)](#installation)
&nbsp;
[![How it works](https://img.shields.io/badge/How%20it%20works-555?style=for-the-badge)](#how-it-works)

</div>

> **Status:** V1 deployed and tested against real Bitbucket Cloud and OpenAI on a test repository. Quality still has to be measured on the team's real pull requests before automatic comments are switched on. Details in [PROGRESS.md](PROGRESS.md) (Spanish).
>
> The interface and the review comments are in Spanish. The design documents in [docs/](docs/) are in Spanish too.

## What it is for

Every adventure needs someone to ask the awkward question: **"What if this user tries to read someone else's data?"**

Sancho is that second pair of eyes for your pull requests. It reads the changes, checks related code and only comments on what it can prove: security flaws, authorization gaps and regressions. It is built for **PHP, Symfony and Laravel** teams working on **Bitbucket Cloud**, and it is especially useful when the code is also written by an AI.

Sancho reports and comments. **Merging is still your team's call**: it never approves, blocks or merges a pull request.

## What it does

- **Reviews every pull request on its own** as soon as it is opened or updated, through one webhook per repository. Drafts are skipped.
- **Reads before it speaks**: the diff at fixed commits, the changed files and the code they use (models, policies, routes and access rules), with secrets masked before anything is sent to the AI.
- **Follows your team's rules**: under Ajustes → Reglas de revisión you tell it what each project is about, what to watch and what to ignore.
- **Double-checks itself**: a second model call drops what it cannot justify, and the server checks that each problem sits on an added line.
- **Comments in three sentences**: what is wrong, why it matters and how to fix it, on the exact line. One summary per pull request, updated instead of repeated.
- **Does not repeat itself** across versions of the same pull request and never publishes results for code that has since changed.
- **Tells "nothing found" apart from "could not review"**: a partial or failed review is shown as such.
- **Keeps spending in check**: cost per review and per day, and a monthly budget that warns without stopping reviews.
- **Dashboard for the whole team**, with local accounts, two roles (member and admin), an audit log and light and dark mode.

| Comment on the pull request | Detail in the dashboard |
| --- | --- |
| 🔴 **Inyección SQL en la búsqueda**<br>Un usuario puede eludir el filtro y leer facturas ajenas.<br>**Arreglo:** usa parámetros enlazados en `DB::select`. · Detalle | <img src="docs/img/revision.png" alt="Review detail: Problems, What was reviewed and Usage tabs; one high-severity problem with its title, file and line, impact and fix." width="420"> |

<div align="center">

<img src="docs/img/revisiones.png" alt="Review history with All, In progress, Completed and With issues tabs, and a table with each pull request's result and what was published to Bitbucket." width="100%">

<img src="docs/img/modo-oscuro.png" alt="The review detail in dark mode, with a very dark green background and light text." width="49%">
<img src="docs/img/movil.png" alt="The review history on a phone: each review is a card with its repository, result, Bitbucket status and date." width="22%">

</div>

## Installation

You need Docker with Docker Compose. Node.js 22.12 or later is only needed to develop outside Docker.

```bash
git clone https://github.com/Dasge97/sancho.git
cd sancho
cp .env.example .env
```

Fill the `.env` with your own values:

```bash
openssl rand -hex 32      # for POSTGRES_PASSWORD and SESSION_SECRET
openssl rand -base64 32   # for SANCHO_ENCRYPTION_KEY (keep a copy off the server)
```

Start it and create the first admin account:

```bash
docker compose up --build -d
docker compose exec api node dist-server/admin.js you@example.com 'a-password-of-12-or-more'
```

Open `http://localhost:3000` and sign in.

**To put it on the internet** (needed so Bitbucket can send webhooks): set your domain in `PUBLIC_BASE_URL` and `CADDY_DOMAIN`, set `SESSION_COOKIE_SECURE=true` and start with `docker compose --profile production up --build -d`. Caddy handles the HTTPS certificate. If you already have an HTTPS proxy, point it at `SANCHO_PORT` and skip the `production` profile.

## Usage

1. **Ajustes → Bitbucket** (Settings): save the workspace, the Atlassian account email and an API token, then click «Probar conexión» (Test connection).
2. **Ajustes → OpenAI**: save the API key. Under **Modelo y costes** (Model and costs), pick the model and its prices, and check that it answers.
3. **Repositorios → Sincronizar con Bitbucket** (Repositories → Sync): enable the repositories you want and click «Instalar webhook» on each one.
4. Open a pull request in Bitbucket. Within a minute the review shows up under **Revisiones** (Reviews).
5. Once you trust the comments, turn on **Ajustes → Publicación** (Publishing) so Sancho comments in Bitbucket by itself. Until then, «Revisar y comentar» (Review and comment) in Repositories publishes on demand.

<div align="center">
<img src="docs/img/ajustes.png" alt="Settings with the Bitbucket, OpenAI, Model and costs and Publishing tabs; Publishing is open with the automatic comments switch." width="100%">
</div>

## Configuration

| Variable | What it does |
| --- | --- |
| `POSTGRES_PASSWORD` | Database password. |
| `SESSION_SECRET` | Signs dashboard sessions. |
| `SANCHO_ENCRYPTION_KEY` | Encrypts the Bitbucket and OpenAI credentials (32 bytes, base64). Without it, not even backups can be read. |
| `SESSION_COOKIE_SECURE` | `true` with HTTPS; `false` only locally. |
| `PUBLIC_BASE_URL` | Public URL of the dashboard. Needed to install webhooks and for the «Detalle» links in comments. |
| `CADDY_DOMAIN` | Domain for Caddy's HTTPS certificate (`production` profile). |
| `SANCHO_PORT` | Local dashboard port (default `3000`, bound to `127.0.0.1` only). |
| `OPENAI_MAX_OUTPUT_TOKENS` | Output limit per OpenAI call (default `16000`; includes reasoning). |
| `AI_EXCHANGE_RETENTION_DAYS` | Days to keep what was sent to OpenAI and its answer (default `30`; `0` to not keep it). Read it with `docker compose exec api node dist-server/ai-log.js [review-id]`. |

**Atlassian API token scopes** (create it at id.atlassian.com with "Create API token with scopes" and the Bitbucket app): `read:repository:bitbucket`, `read:pullrequest:bitbucket`, `write:pullrequest:bitbucket`, `read:webhook:bitbucket` and `write:webhook:bitbucket`. The account must be an admin of the repositories to install the webhook. Comments are posted under that account's name, so a dedicated account for Sancho is a good idea.

**Backups**: `sh scripts/backup.sh [folder]` saves a PostgreSQL dump and `sh scripts/restore.sh <file.dump>` restores it.

**Tests**: `npm test`. With `TEST_DATABASE_URL` pointing at a throwaway database, it also runs the webhook → review → publishing flow with Bitbucket and OpenAI simulated. To see the dashboard with sample data without connecting anything: `docker compose exec api node dist-server/simulator.js`.

## How it works

```mermaid
flowchart LR
    BB["Bitbucket Cloud"] -->|signed webhook| API["API · Node.js"]
    Panel["Dashboard · Vue"] --> API
    API --> DB[("PostgreSQL<br>job queue")]
    Worker["Review worker"] <--> DB
    Worker <-->|diff and comments| BB
    Worker <-->|detection and verification| AI["OpenAI"]
```

The API receives the webhooks, checks their signature and puts a job in a PostgreSQL queue. The worker reads the diff, asks the AI for possible problems, asks it again to verify them and checks by itself that each one is on an added line. Before publishing, it confirms the pull request has not moved to a new commit. Repository code and comments are treated as data, never as instructions, and Sancho never runs the code it reviews.

**How the AI reviews.** The model's instructions live in [`prompts/deteccion.md`](prompts/deteccion.md) and [`prompts/verificacion.md`](prompts/verificacion.md) (Spanish): what to look for in Laravel and Symfony, what not to comment on, how to rate severity and how to write each finding. They are sent apart from the code, which gets a number on every line, and end with the rules your team writes in the dashboard.

More in [docs/](docs/) (Spanish): [architecture](docs/03-arquitectura.md), [review engine](docs/04-revision.md), [data and contracts](docs/05-contratos.md) and [validation and operations](docs/07-validacion-operacion.md).

## License

No license yet. Until one is published, the code is visible but all rights are reserved.

---

<div align="center">

**Sancho. Common sense deserves a seat in the pull request too.**

*"With your permission: that is not a giant. It is an unchecked null."*

</div>
