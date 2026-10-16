<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/logo-oscuro.png">
  <img src="docs/img/logo.png" alt="Sancho logo: a squire with a hat and beard looking at a laptop, inside a yellow circle, with the word Sancho underneath" width="210">
</picture>

### The squire for your pull requests

AI code review for **Bitbucket Cloud**.<br>
It finds security flaws and regressions before you merge, and points at the exact line.

**English** · [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.1.0-2e7d5b)](https://github.com/Dasge97/sancho/commits/main)
[![License](https://img.shields.io/badge/license-not%20set-lightgrey)](#license)
[![Last commit](https://img.shields.io/github/last-commit/Dasge97/sancho?label=last%20commit&color=2e7d5b)](https://github.com/Dasge97/sancho/commits/main)
<br>
[![Bitbucket Cloud](https://img.shields.io/badge/Bitbucket-Cloud-0052CC?logo=bitbucket&logoColor=white)](https://bitbucket.org)
[![Claude Agent SDK](https://img.shields.io/badge/Claude-Agent%20SDK-D97757?logo=claude&logoColor=white)](https://code.claude.com/docs/en/agent-sdk)
[![Node.js 22](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](#installation)

[![Install](https://img.shields.io/badge/Install-2e7d5b?style=for-the-badge)](#installation)
&nbsp;
[![How it works](https://img.shields.io/badge/How%20it%20works-0f2d23?style=for-the-badge)](#how-it-works)
&nbsp;
[![Screenshots](https://img.shields.io/badge/Screenshots-f4b942?style=for-the-badge)](#screenshots)

</div>

<br>

<img src="docs/img/detalle.png" alt="A review in the Sancho dashboard: pull request 41 of api-facturas, completed and published to Bitbucket, with Sancho's conclusion and two high-severity problems; the first one, an SQL injection in the search, with its file, line and fix." width="100%">

<br>

> **Status:** V1 working and deployed. It reviews real Bitbucket Cloud pull requests. Before letting it comment on its own in every repository, try it on real pull requests from your team. What is done and verified is in [PROGRESS.md](PROGRESS.md) (Spanish).
>
> The dashboard and the review comments are in Spanish.

## Why Sancho

Every adventure needs someone to ask the awkward question: **"What if this user tries to read someone else's data?"**

| 🎯 Only what matters | 📍 On the exact line | 🤝 You decide |
| --- | --- | --- |
| Security flaws, authorization gaps and regressions it can prove. No style nitpicks, no opinions. | Three sentences per problem: what is wrong, why it matters and how to fix it, on the line that causes it. | Sancho comments. It never approves, blocks or merges: merging stays your team's call. |

It is built for teams working with **PHP (Laravel, Symfony), JavaScript and TypeScript (Node, React, Vue) and Python (Django, Flask, FastAPI)** on Bitbucket Cloud, and it is especially useful when the code is also written by an AI.

## What it looks like in your pull request

A comment on the line with the problem:

> 🔴 **Inyección SQL en la búsqueda**
>
> Un usuario puede eludir el filtro y leer facturas de otros usuarios.
>
> **Arreglo:** usa parámetros enlazados en `DB::select` para `q`. · [Detalle](#)

And one summary per pull request, updated on every change instead of repeated:

> **Sancho · 2 problemas** (2 altos)
> 1. 🔴 Inyección SQL en la búsqueda · `InvoiceController.php:28`
> 2. 🔴 Descarga de facturas ajenas por id · `InvoiceController.php:33`
>
> 3 ficheros revisados · commit `a41c09e` · [Ver revisión completa](#)

When the fix fits on the line, it proposes it as a suggested change:

> ```suggestion
> $invoice = Invoice::findOrFail($id);
> $this->authorize('view', $invoice);
> ```

And if you reply, it answers in the same thread:

> **Ana:** Esta ruta solo la usan administradores, no es un problema.
>
> **Sancho:** Tienes razón: la ruta lleva el middleware `can:admin`. Retiro el comentario.<br>
> 📝 Lo tendré en cuenta en este repositorio: _las rutas de admin/ ya exigen can:admin._

## What it does

| | |
| --- | --- |
| **Reviews every pull request on its own** | As soon as it is opened or updated, through one webhook per repository. Drafts are skipped. |
| **Knows your project** | The first time, it studies the whole repository and writes a profile: how it is organised, how it is protected and what to watch. It reads it before every review and proposes it as a pull request in `.sancho/proyecto.md` so the team can correct it. |
| **Reads the code like a person would** | A Claude agent works on a checkout of the repository and decides what to open: routes, policies, models and callers of what changed. |
| **Uses tools that run nothing** | gitleaks looks for secrets in added lines, `php -l` checks that the changed PHP files compile, and Opengrep flags unsafe patterns, which the model checks before anything is published. |
| **Double-checks itself** | A second agent tries to knock down every finding before it is published, and Sancho checks that it sits on an added line. |
| **Proposes the fix** | When the change fits on the commented line, it leaves it as a code suggestion. |
| **Answers in the pull request** | It replies in the thread of its comments, withdraws what is not a problem, and handles `@sancho revisa`, `pausa`, `reanuda` and `ayuda`. |
| **Learns from your team** | What you explain in pull requests, and false positives marked with a reason, become rules for that repository. |
| **Follows each problem to the end** | On a new commit it focuses on what changed; when a problem is fixed, it says so in the thread and marks it resolved. |
| **Tells "clean" from "not reviewed"** | A partial or failed review is shown as such, never as a review without problems. |
| **Configured from the repository** | A `.sancho.yml` with context, per-folder rules, exclusions, a minimum severity, a profile and merge checks, read from the target branch. |
| **Standard or strict review** | The strict profile also comments on minor details (🔵), at most five per pull request, never style. |
| **Checks before merging** | The team writes its own, and the summary says whether each one is met, not met or does not apply. |
| **A summary that helps share the work** | Review effort from 1 to 5 with estimated minutes, and the open pull requests that touch the same files. |
| **Adapts to your team** | Global and per-repository rules, and the AI instructions editable from the dashboard, with version history. |
| **Measures how often it is right** | The Calidad (Quality) screen shows the hit rate by type, repository and instructions version. `npm run eval` also runs labelled cases. |
| **Keeps spending in check** | Cost per review and per day, and a monthly budget that warns without stopping the work. |
| **One dashboard for the whole team** | Local accounts, two roles, an audit log, light and dark mode, and mobile-ready. |

## How it works

```mermaid
flowchart LR
    BB["Bitbucket Cloud"] -->|signed webhook| API["API · Node.js"]
    Panel["Dashboard · Vue"] --> API
    API --> DB[("PostgreSQL<br>job queue")]
    Worker["Review worker"] <--> DB
    Worker -->|task| Brain["Cerebro · Claude agent"]
    Brain -->|checkout of the commit| BB
    Worker -->|comments| BB
    Worker -.->|alternative| AI["OpenAI"]
```

1. **A pull request arrives.** Bitbucket sends a webhook; Sancho checks its signature and queues it.
2. **Sancho gets ready.** It reads `.sancho.yml` from the target branch, the project profile (writing it if there is none), what it has learned from the team and the comments still open. It runs gitleaks and `php -l`, which do not run the project.
3. **The agent reviews it.** The `cerebro` service downloads the repository at the pull request commit and runs a Claude Agent SDK agent with the instructions in [`prompts/`](prompts/) and your team's rules. The agent reads what it needs, and **it can only read, and only inside that checkout**.
4. **Another agent verifies it.** Every finding is checked against the code; the ones that do not hold up are dropped.
5. **Sancho publishes.** Before commenting, it confirms the pull request has not changed. Then it posts the summary and the inline comments, and closes earlier comments that are now fixed.
6. **Sancho handles replies.** When someone answers one of its comments or writes `@sancho`, it replies in the thread.

The agent uses the server's Claude subscription or an Anthropic key. As an alternative, Ajustes → Motor de revisión can send reviews straight to OpenAI. More in [docs/](docs/) (Spanish).

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/img/panel.png" alt="Reviews dashboard: queue, reviews in progress, AI analyses and monthly spend, with recent activity."><br><sub><b>Dashboard.</b> What was reviewed, what is running and what you have spent.</sub></td>
    <td width="50%"><img src="docs/img/revisiones.png" alt="Review history with tabs by result and each review's status in Bitbucket."><br><sub><b>Reviews.</b> Every pull request with its result and what was published.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/img/motor.png" alt="Settings, review engine: Claude agent connected through the subscription, or OpenAI."><br><sub><b>Review engine.</b> Claude agent on a subscription, an Anthropic key, or OpenAI.</sub></td>
    <td><img src="docs/img/instrucciones.png" alt="Editor for the AI instructions with a selector for detection, verification and agent."><br><sub><b>AI instructions.</b> Editable from the dashboard, with version history.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/img/reglas.png" alt="Global and per-repository review rules."><br><sub><b>Team rules.</b> What to watch and what to ignore, globally and per repository.</sub></td>
    <td><img src="docs/img/oscuro.png" alt="What a review covered, in dark mode, with the files the agent read."><br><sub><b>Dark mode.</b> And which files the agent opened in each review.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/img/conversaciones.png" alt="Conversations tab of a repository: team messages in pull requests and Sancho's replies, such as pausing a pull request or explaining why a parameter is properly validated."><br><sub><b>Conversations.</b> What the team tells it in pull requests, and its answers.</sub></td>
    <td><img src="docs/img/aprendido.png" alt="What it learned tab: a rule taken from a conversation, with a switch to turn it off and a Delete button."><br><sub><b>What it learned.</b> Rules that come from conversations and false positives.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/img/calidad.png" alt="Quality screen: hit rate, published problems, problems fixed by a commit and false positives, with tables by instructions version, type and severity."><br><sub><b>Quality.</b> How much of what it flags helps the team, by instructions version, type and repository.</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/img/movil-revisiones.png" alt="Review history on a phone, each review as a card." width="30%">
  &nbsp;&nbsp;
  <img src="docs/img/movil-detalle.png" alt="A review on a phone." width="30%">
</p>

## Installation

You need a server with **Docker Compose** and a public HTTPS address, so Bitbucket can send webhooks.

```bash
git clone https://github.com/Dasge97/sancho.git
cd sancho
cp .env.example .env
```

Fill the `.env` with your own values:

```bash
openssl rand -hex 32      # POSTGRES_PASSWORD, SESSION_SECRET and CEREBRO_TOKEN
openssl rand -base64 32   # SANCHO_ENCRYPTION_KEY (keep a copy off the server)
```

Set your domain in `PUBLIC_BASE_URL` and `CADDY_DOMAIN`, and the server's Claude Code session folder in `CLAUDE_DIR`. Then start it and create your account:

```bash
docker compose --profile production up --build -d
docker compose exec api node dist-server/admin.js you@example.com 'a-password-of-12-or-more'
```

The `production` profile adds Caddy, which gets the HTTPS certificate by itself. If you already have an HTTPS proxy, point it at `SANCHO_PORT` and start without the profile.

## Getting started

1. **Ajustes → Bitbucket** (Settings): save the workspace, the Atlassian account email and an API token, then click «Probar conexión» (Test connection).
2. **Ajustes → Motor de revisión** (Review engine): check that the Claude agent shows «Conectado» (Connected).
3. **Ajustes → Reglas de revisión** (Review rules): tell Sancho what each project is about. Optional, but it improves results a lot.
4. **Repositorios → Sincronizar con Bitbucket** (Repositories → Sync): enable the repositories you want and click «Instalar webhook».
5. Open a pull request. Within a few minutes the review shows up under **Revisiones** (Reviews).
6. Once you trust the comments, turn on **Ajustes → Publicación** (Publishing) so Sancho comments on its own. Until then, «Revisar y comentar» (Review and comment) publishes on demand.

**The Atlassian API token** is created at id.atlassian.com with "Create API token with scopes" and the Bitbucket app. It needs `read:repository`, `read:pullrequest`, `write:pullrequest`, `read:webhook` and `write:webhook`, and the account must administer the repositories. Add `write:repository` if you want Sancho to propose the project profile as a pull request; otherwise turn off «Proponer la ficha del proyecto como PR» in Ajustes → Publicación. Comments are posted under that account's name, so a dedicated account for Sancho is a good idea.

If a repository shows «Webhook antiguo» (old webhook), click «Actualizar webhook»: the new one also reports comments, and without it Sancho cannot answer in pull requests.

## Talking to Sancho in a pull request

Reply in the thread of one of its comments to explain why it is not a problem, or to say it is already fixed. Sancho answers in the same thread, withdraws the comment if you are right and, if it applies to the rest of the repository, saves it as a rule.

You can also write to it in any pull request comment (the commands are in Spanish):

| Message | What it does |
| --- | --- |
| `@sancho revisa` | Reviews the pull request again and publishes the result. |
| `@sancho pausa` | Stops reviewing this pull request on its own. `@sancho revisa` still works. |
| `@sancho reanuda` | Reviews it again on every change. |
| `@sancho ayuda` | Replies with this list. |
| `@sancho` and a question | Answers about the pull request or the project. |

What it learns is under **Repositorios → (repository) → Lo aprendido** (What it learned). It can be edited, switched off or deleted there.

## Configuration

| Variable | What it does |
| --- | --- |
| `POSTGRES_PASSWORD` | Database password. |
| `SESSION_SECRET` | Signs dashboard sessions. |
| `SANCHO_ENCRYPTION_KEY` | Encrypts stored credentials (32 bytes, base64). Without it, not even backups can be read. |
| `PUBLIC_BASE_URL` | Public URL of the dashboard, for webhooks and the links in comments. |
| `CADDY_DOMAIN` | Domain for the HTTPS certificate (`production` profile). |
| `SESSION_COOKIE_SECURE` | `true` with HTTPS; `false` only locally. |
| `CEREBRO_TOKEN` | Internal token between the worker and the agent. |
| `CLAUDE_DIR` | The server's Claude Code session, so the agent runs on the subscription. |
| `ANTHROPIC_API_KEY` | Optional: the agent uses this key (pay per use) instead of the subscription. |
| `SANCHO_PORT` | Local dashboard port (default `3000`, bound to `127.0.0.1` only). |
| `AI_EXCHANGE_RETENTION_DAYS` | Days to keep what was sent to the AI and its answer (default `30`). |

### From the repository: `.sancho.yml`

The team can configure Sancho next to the code with a `.sancho.yml` at the root. Sancho reads it from the target branch of each pull request, so a pull request cannot relax its own rules. Every field is optional; the keys are in Spanish.

```yaml
contexto: |            # what the project is
  Laravel 11 billing API for B2B customers.
  Each invoice belongs to one user; admins see all of them.
reglas: |              # rules for the whole repository
  Every action that changes data uses a FormRequest with authorize().
rutas:                 # rules for some paths only
  - ruta: "app/Http/Controllers/Admin/**"
    reglas: "Only reachable with the can:admin middleware."
excluir:               # paths not to review
  - "database/seeders/**"
gravedad_minima: medium   # minimum severity: low, medium, high or critical
perfil: exigente          # profile: estandar or exigente (also minor details)
comprobaciones:           # merge checks
  - nombre: Reversible migrations
    descripcion: Every new migration has a down() method that undoes it.
```

The project profile lives in `.sancho/proyecto.md`. If the team edits it in the repository, Sancho uses that version from the next review on.

## Security

- **The agent only reads.** It never runs the reviewed code, writes files or reaches the internet; a filter rejects any path outside the repository checkout.
- **The tools do not run anything either.** gitleaks reads text and `php -l` only compiles. The value of a secret it finds is never stored or shown.
- **Reviewed code is data, not instructions.** Whatever a file says does not change what Sancho does.
- **Secrets never reach the AI.** Lines with keys or passwords are masked before anything is sent.
- **Credentials are stored encrypted** (AES-256-GCM) and never sent back to the dashboard.
- **Sancho does not decide for you.** It never uses the approve, decline or merge APIs.

## Development

```bash
npm ci
npm test                         # unit tests
TEST_DATABASE_URL=postgres://… npm test   # plus the full flow with Bitbucket and the AI simulated
docker compose exec api node dist-server/simulator.js   # sample data without connecting anything
```

**Measuring quality with labelled cases.** [`evals/casos/`](evals/casos/) holds thirteen changes to Laravel, Express and Django projects and a browser script: eight with a known problem and five clean ones. `npm run eval` runs them through the same detection and verification as the worker and reports precision, recall and cost. It calls OpenAI for real:

```bash
OPENAI_API_KEY=… npm run eval -- --modelo gpt-6.1-sol --precios 2,10
npm run eval -- --modelo gpt-6.1-sol --prompts other-version/   # compare with other instructions
docker compose run --rm -e OPENAI_API_KEY worker node dist-server/eval.js --modelo gpt-6.1-sol   # on the server
```

To add cases, edit [`evals/generar.mjs`](evals/generar.mjs) and run `node evals/generar.mjs evals/casos`.

To see what was sent to the AI in a review: `docker compose exec api node dist-server/ai-log.js [review-id]`.
Backups: `sh scripts/backup.sh` and `sh scripts/restore.sh <file.dump>`.

## Documentation

In Spanish: [Decisions](docs/01-decisiones.md) · [Dashboard](docs/02-panel.md) · [Architecture](docs/03-arquitectura.md) · [Review engine](docs/04-revision.md) · [Data and contracts](docs/05-contratos.md) · [Validation and operations](docs/07-validacion-operacion.md) · [Future fixes](docs/08-correcciones.md) · [Progress](PROGRESS.md)

## License

No license yet. Until one is published, the code is visible but all rights are reserved.

---

<div align="center">

<img src="src/web/public/sancho-mark-96.png" alt="" width="48">

**Sancho. Common sense deserves a seat in the pull request too.**

<sub><i>"With your permission: that is not a giant. It is an unchecked null."</i></sub>

</div>
