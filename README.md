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
APP_ENV_LABEL=Test
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

# CRA desktop client in-app download
# Source: github (default) or local
CRA_CLIENT_RELEASE_SOURCE=github
CRA_CLIENT_RELEASE_ALLOW_LOCAL_FALLBACK=false
CRA_CLIENT_RELEASE_CACHE_SECONDS=60
CRA_CLIENT_RELEASE_NEGATIVE_CACHE_SECONDS=10

# GitHub source configuration
CRA_CLIENT_GITHUB_OWNER=RenoMO-lab
CRA_CLIENT_GITHUB_REPO=CRA_client
CRA_CLIENT_GITHUB_ASSET_PATTERN=windows-x64.exe
CRA_CLIENT_GITHUB_TOKEN=

# Local fallback configuration
CRA_CLIENT_INSTALLER_PATH=C:\CRA_Local_Main\artifacts\CRA-Client-latest.exe
CRA_CLIENT_INSTALLER_NAME=CRA-Client-latest.exe
CRA_CLIENT_INSTALLER_VERSION=v0.1.19
CRA_CLIENT_INSTALLER_SHA256=

# CRA desktop in-app update feed (tokenized, auth-protected)
CRA_CLIENT_UPDATE_SOURCE=github
CRA_CLIENT_UPDATE_CHANNEL=stable
CRA_CLIENT_UPDATE_TOKEN_TTL_SECONDS=600
CRA_CLIENT_UPDATE_TOKEN_SECRET=
CRA_CLIENT_GITHUB_UPDATE_ASSET_PATTERN=windows-x64.exe
CRA_CLIENT_GITHUB_UPDATE_SIG_PATTERN=.sha256
# Optional fixed external base URL used in update manifest links.
# If omitted, request host headers are used.
CRA_CLIENT_UPDATE_PUBLIC_BASE_URL=http://192.168.50.55:3000
CRA_CLIENT_LOCAL_UPDATE_ARTIFACT_PATH=C:\CRA_Local_Main\artifacts\CRA-Client-updater.exe
CRA_CLIENT_LOCAL_UPDATE_SIG_PATH=C:\CRA_Local_Main\artifacts\CRA-Client-updater.exe.sig
CRA_CLIENT_LOCAL_UPDATE_VERSION=v0.1.20
CRA_CLIENT_LOCAL_UPDATE_NOTES=

# Bootstrap admin (used only when app_users is empty)
BOOTSTRAP_ADMIN_NAME=Admin
BOOTSTRAP_ADMIN_EMAIL=r.molinier@sonasia.monroc.com
BOOTSTRAP_ADMIN_PASSWORD=123#56Rt9
```

Notes:
- Do not commit `.env`.
- `APP_ENV_LABEL` is optional. If omitted, UI falls back to `Production` when `NODE_ENV=production`, otherwise `Test`.
- `DB_INSTANCE` is optional for named instances.
- Use `DB_TRUST_CERT=true` for local dev only.

Authentication notes:
- Auth now uses server-side sessions stored in PostgreSQL.
- User accounts/roles are stored in table `app_users` (not browser localStorage).
- After upgrade, sign in with the bootstrap admin account and use **Settings > Users > Import legacy users** once if you need to migrate users from an old browser-local installation.

CRA Client download notes:
- Logged-in users can open `/downloads` to download the desktop installer.
- The file is served by authenticated API endpoints:
  - `GET /api/client/download-info`
  - `GET /api/client/download`
- In-app desktop update flow endpoints:
  - `POST /api/client/update/prepare` (authenticated)
  - `GET /api/client/update/manifest?token=...`
  - `GET /api/client/update/artifact?token=...`
  - `GET /api/client/update/signature?token=...`
  - Failure responses now include `reasonCode` for automation/debugging.
- Desktop runtime URL policy (canonical):
  - `APP_URL=http://192.168.50.55:3000`
  - `ALLOWED_HOSTS=192.168.50.55,cra-local`
  - `.nip.io` hostnames are compatibility-only, not the default runtime target.
- Proxy caveat:
  - Hostname URLs (for example `*.nip.io`) may be intercepted by local proxy tools and fail with `502`.
  - Use the raw LAN IP URL (`192.168.50.55`) as the canonical desktop runtime target.
- Desktop updater fallback policy:
  - If in-app updater fails due desktop IPC/security scope, route users to **Downloads** and perform a one-time manual installer update.
- Default mode (`CRA_CLIENT_RELEASE_SOURCE=github`) auto-tracks latest GitHub release from `RenoMO-lab/CRA_client`.
- Users still download from your server endpoint (`/api/client/download`), but bytes are streamed from latest GitHub asset.
- Local mode remains available by explicit opt-in:
  - set `CRA_CLIENT_RELEASE_SOURCE=local`, and provide local installer/update artifact paths.
  - keep `CRA_CLIENT_RELEASE_ALLOW_LOCAL_FALLBACK=false` during rollout validation to avoid stale artifact fallback.
- Admin diagnostics endpoint for release/update health:
  - `GET /api/admin/client-update-health`

## Local development

### Local Dev (Win11) With Docker Desktop (Recommended)

If the production server is down, you can still develop and test locally on your Windows 11 PC.

This will:
- Start a local PostgreSQL using Docker (`cra-pg`)
- Create a local `.env` (kept on your PC only; not committed to Git)
- Run migrations locally
- Start both API and UI dev servers

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\local-dev.ps1
```

Reset the local DB (deletes local test data):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\local-dev.ps1 -ResetDb
```

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
- Deploy script now performs post-restart health gates automatically:
  - Windows service state is `Running`
  - `http://localhost:3000/` returns `200`
  - `http://localhost:3000/api/admin/client-update-health` returns `200`
- Deploy script also installs/updates self-heal scheduled task `CRA_Local_SelfHeal` (SYSTEM, every 2 minutes).

### Status Integrity Gate (recommended before/after deploy)

Use these scripts to detect unexpected lifecycle regressions across deployments:

```powershell
# Pre-deploy snapshot
node scripts/request-status-snapshot.mjs --out .\tmp\status-before.json

# Run deploy / migration / restart

# Post-deploy snapshot
node scripts/request-status-snapshot.mjs --out .\tmp\status-after.json

# Fail if any request moved backwards in workflow rank
node scripts/request-status-snapshot-diff.mjs --before .\tmp\status-before.json --after .\tmp\status-after.json
```

Admin diagnostics endpoint (authenticated admin):

```text
GET /api/admin/request-status-integrity
```

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

Recommended: configure backups directly in **Settings > DB Monitor**.

In-app flow:
- Open **Settings > DB Monitor**
- Click **Setup backup credentials**
- Enter PostgreSQL admin credentials once (used only to create/update backup role)
- Save backup settings (default schedule: `01:00` daily)
- Click **Create backup** to test

After setup, app-managed backups include:
- `<prefix>.dump` (database schema + data)
- `<prefix>_globals.sql` (roles/grants from `pg_dumpall --globals-only`)
- `<prefix>_manifest.json` (metadata: files + tool versions)

Retention policy:
- `day`: latest backup from today
- `day-1`: latest backup from yesterday
- `week-1`: latest backup from 7 days ago
- all other backup artifacts are removed

Legacy scheduler/scripts are still available if needed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\CRA_Local_W2016_Main\deploy\install-daily-db-backup-task.ps1 `
  -TaskName CRA_Local_DailyDbBackup `
  -AppPath C:\CRA_Local_W2016_Main `
  -BackupDir C:\CRA_Local_W2016_Main\backups\postgres `
  -StartTime 01:00
```

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

Primary path: use **Restore** button in **Settings > DB Monitor > Manual Database Backups**.

Fallback CLI script is still available:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\CRA_Local_W2016_Main\app\deploy\db-restore.ps1 `
  -AppPath C:\CRA_Local_W2016_Main\app `
  -BackupDir C:\CRA_Local_W2016_Main\backups\postgres `
  -ServiceName CRA_Local_App `
  -Force
```
