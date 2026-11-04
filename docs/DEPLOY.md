# Deployment

One Linux server with Docker Compose 2.24 or newer. Caddy gets HTTPS certificates by itself; nothing else is reachable from outside.

## Before you start
- **Not ready yet:** STT and TTS have only mock providers in the code, and production refuses to start on a mock. Connect the speech providers first. Until then, try the setup with `ENVIRONMENT=staging`, which allows mocks. Staging results are invented, so do not use it for real hiring.
- A domain whose A record points at the server, and ports 80 and 443 open.
- SMTP credentials.
- 4 GB of RAM or more: Judge0 runs candidates' code.

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
