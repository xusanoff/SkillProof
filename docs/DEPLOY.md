# Deployment

## Vercel frontend and backend on a separate server

The frontend can build on Vercel with Root Directory `frontend`, Node.js 22,
and Build Command `pnpm build`. A frontend-only deployment is suitable for
reviewing public UI; login, jobs, chat and interviews still require a reachable API.
Set `API_INTERNAL_URL` to the backend's HTTPS origin, without `/api/v1`.
Browser requests keep the default `/api` proxy prefix.

Do not treat setting `NEXT_PUBLIC_WS_URL` as a complete split-host deployment.
Interview sockets authenticate with the `sp_access` host-only cookie. A cookie
set through the frontend proxy is not sent to a different backend hostname,
even when the two hosts are subdomains of the same domain. The existing
production Compose/Caddy setup below keeps pages and sockets on one hostname
and supports that authentication flow. Split hosting needs a reviewed socket
authentication/routing change and an HTTPS login → interview → reconnect check
before candidates can use it. Changing CORS alone does not fix this.

Production startup rejects unimplemented LLM providers, missing LLM connection
settings/model, unimplemented S3 storage, and a missing Judge0 authentication
token. These checks validate configuration, not live provider connectivity.

One Linux server with Docker Compose 2.24 or newer. Caddy gets HTTPS certificates by itself; nothing else is reachable from outside.

## Before you start
- Real LLM, speech and SMTP settings: production refuses to start on a mock. To try the setup without them, use `ENVIRONMENT=staging`. Staging results are invented, so do not use it for real hiring.
- A domain whose A record points at the server, and ports 80 and 443 open.
- SMTP credentials.
- 4 GB of RAM or more: Judge0 runs candidates' code.
- Before real candidates: LLM and speech providers on terms that allow their data. Free and trial tiers may not, and Gemini's free tier says content is used to improve Google's products. Its limit was also 3 transcriptions a minute when tested.
- A live interview gives the LLM 4 s (`stage2.live_llm_timeout_s`). A slower provider still works, but candidates then get ready-made questions and no follow-ups.

Judge0 runs privileged containers, as its isolation needs. Use a server that holds nothing else.

## First start
```sh
git clone <repo> && cd hr-platform
cp .env.production.example .env   # fill it in
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api \
  python -m app.cli create-admin you@example.com "Your Name" 'a-long-password'
```
Migrations run when the API starts. `NEXT_PUBLIC_WS_URL` is built into the frontend, so changing `DOMAIN` needs `--build`.

## Update
```sh
scripts/backup.sh
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Backups
`scripts/backup.sh [dir]` saves the database and uploaded files, checks them, and deletes backups older than `BACKUP_KEEP_DAYS` (14). Run it from cron:

```cron
17 2 * * * cd /srv/hr-platform && COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml" scripts/backup.sh /srv/backups >> /var/log/skillproof-backup.log 2>&1
```

Backups stay on the same server unless you copy them elsewhere, so a lost server loses them too. Copy them off the server, encrypted: they hold personal data.

Restoring replaces current data:
```sh
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml" scripts/restore.sh /srv/backups/<stamp> --yes
```
To try a backup without touching live data, create an empty database and set `RESTORE_DB` to its name. This restores the database only.

## Data retention
A daily job deletes editing telemetry and recordings older than `privacy.retention_days` (180, changeable in the admin panel). Scores, reports, final code and transcripts stay. A deleted account stays in backups until they age out.

## What runs where
| Path | Goes to |
| ---- | ------- |
| `/api/v1/interview-sessions/*/events`, `.../stage2/events`, `/api/v1/telegram/webhook` | API directly |
| everything else, including `/api/api/v1/...` | Next.js, which proxies `/api/*` to the API |

The API trusts `X-Forwarded-For` only with `TRUST_FORWARDED_FOR=true`, which the production file sets. Caddy overwrites that header, and the API port is not published. Do not publish it, or anyone could choose their own rate limit identity.
