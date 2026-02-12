# CRA_Local

Production-ready Vite + React + TypeScript SPA with a Node API server and PostgreSQL backend.

## Table of contents

- Overview
- Architecture
- Prerequisites
- Configuration
- Local development
- Migrations
- Build and run
- Deployment (Windows + NSSM)
- CI/CD (GitHub Actions + SSH)
- Troubleshooting

## Overview

This repo hosts a single application that serves the frontend and the API on the same host/port. The API mirrors the former Cloudflare Worker routes and uses PostgreSQL as the datastore.

## Architecture

- Frontend: Vite + React SPA
- Backend: Node.js (Express) API under `/api`
- Database: PostgreSQL
- Static assets: built to `dist/` and served by Node

## Prerequisites

- Node.js 20 LTS
- Bun (recommended) or npm
- PostgreSQL (local instance)
- Git

## Configuration

Copy the template and edit values:

```sh
copy .env.example .env
```

Environment variables:

```
HOST=0.0.0.0
PORT=3000
VITE_API_PROXY=http://localhost:3000
# Option A (recommended)
DATABASE_URL=postgres://cra_app:password@localhost:5432/cra_local

# Option B (used if DATABASE_URL is not set)
PGHOST=localhost
PGPORT=5432
PGDATABASE=cra_local
PGUSER=cra_app
PGPASSWORD=your_postgres_password

# Session auth
SESSION_COOKIE_NAME=cra_sid
SESSION_TTL_HOURS=24

# Bootstrap admin (used only when app_users is empty)
BOOTSTRAP_ADMIN_NAME=Admin
BOOTSTRAP_ADMIN_EMAIL=r.molinier@sonasia.monroc.com
BOOTSTRAP_ADMIN_PASSWORD=123#56Rt9
```

Notes:
- Do not commit `.env`.
- `DB_INSTANCE` is optional for named instances.
- Use `DB_TRUST_CERT=true` for local dev only.

Authentication notes:
- Auth now uses server-side sessions stored in PostgreSQL.
- User accounts/roles are stored in table `app_users` (not browser localStorage).
- After upgrade, sign in with the bootstrap admin account and use **Settings > Users > Import legacy users** once if you need to migrate users from an old browser-local installation.

## Local development

Bun (recommended):

```sh
bun install
bun run migrate
bun run dev
bun run dev:api
```

Open `http://localhost:8080`.

Npm alternative:

```sh
npm install
npm run migrate
npm run dev
npm run dev:api
```

## Migrations

PostgreSQL migrations live in `server/db/migrations/`.
Run them with:

```sh
bun run migrate
```

The migration runner tracks applied files in `dbo.schema_migrations`.

## Build and run

```sh
bun install
bun run migrate
bun run build
bun run start
```

Open `http://localhost:3000`.

## Deployment (Windows + NSSM)

1) Copy the app to `C:\apps\CRA_Local`
2) Create `.env` with production values
3) Run migrations and build
4) Install service:

```sh
nssm install CRA_Local "C:\Program Files\nodejs\node.exe" "C:\apps\CRA_Local\server\index.js"
nssm set CRA_Local AppDirectory "C:\apps\CRA_Local"
nssm start CRA_Local
```

## CI/CD (GitHub Actions + SSH)

Workflow: `CRA_Local/.github/workflows/deploy.yml`

Secrets required:
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_KEY` (private key)
- `DEPLOY_PORT` (optional, defaults to 22)

Server setup:
- Install OpenSSH Server
- Create a deploy user
- Add public key to `C:\Users\deploy\.ssh\authorized_keys`
- Install Git, Node 20 LTS, NSSM

Deploy script: `CRA_Local/deploy/deploy.ps1`

## Troubleshooting

- API errors on load: check `.env` and PostgreSQL connectivity.
- `login failed`: verify SQL login permissions and database name.
- Port conflicts: update `PORT` (API) and `VITE_API_PROXY`.

## Backup And Disaster Recovery (RPO 24h / RTO 2h)

This app stores all business data in PostgreSQL (`PGDATABASE` or `DATABASE_URL`). If the VM/server is lost, **your recovery depends on having recent backups stored off the VM** (NAS).

Current VM note: the deploy script runs `pg_dump` before deployment. That backup is still tied to deploy activity and does not replace the fixed 1:00 AM daily backup schedule.

### Recommended Setup (Best Practice)

- Daily `pg_dump` backup to NAS (meets RPO 24h).
- Optional (recommended): WAL archiving / PITR if your RPO needs improve.
- Periodically test restore to a staging database (fire drill).
- Keep at least one off-VM backup copy (NAS) and test restores regularly.
- Test restore monthly to a separate DB name (fire drill).

### PostgreSQL Backups

Recommended: a Windows Scheduled Task that runs the built-in backup script nightly and copies results to NAS.

Install the built-in daily backup task (on the VM):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\CRA_Local_W2016_Main\deploy\install-daily-db-backup-task.ps1 `
  -TaskName CRA_Local_DailyDbBackup `
  -AppPath C:\CRA_Local_W2016_Main `
  -BackupDir C:\CRA_Local_W2016_Main\backups\postgres `
  -StartTime 01:00
```

Retention policy in app/backup script:
- `day`: latest backup from today.
- `day-1`: latest backup from yesterday.
- `week-1`: latest backup from 7 days ago.
- All other backup artifacts in the folder are removed.

Each backup set now includes:
- `<prefix>.dump` (database schema + data)
- `<prefix>_globals.sql` (roles/grants from `pg_dumpall --globals-only`)
- `<prefix>_manifest.json` (metadata: files + tool versions)

Run once immediately (optional):

```powershell
schtasks /Run /TN "CRA_Local_DailyDbBackup"
```

Check task status and latest backups:

```powershell
schtasks /Query /TN "CRA_Local_DailyDbBackup" /FO LIST /V
Get-ChildItem C:\CRA_Local_W2016_Main\backups\postgres -File | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

### One-Click Restore (Crash / Migration)

Use the built-in restore script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\CRA_Local_W2016_Main\app\deploy\db-restore.ps1 `
  -AppPath C:\CRA_Local_W2016_Main\app `
  -BackupDir C:\CRA_Local_W2016_Main\backups\postgres `
  -ServiceName CRA_Local_App `
  -Force
```

Optional:
- `-BackupPrefix <prefix>` to restore a specific backup set
- `-DumpFile <full path>` to restore one specific dump file
- `-SkipGlobals` to restore DB only (skip roles/grants)
- `-WhatIf` for dry run
