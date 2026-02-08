# CRA_Local

Production-ready Vite + React + TypeScript SPA with a Node API server and SQL Server backend.

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

This repo hosts a single application that serves the frontend and the API on the same host/port. The API mirrors the former Cloudflare Worker routes and uses SQL Server as the datastore.

## Architecture

- Frontend: Vite + React SPA
- Backend: Node.js (Express) API under `/api`
- Database: SQL Server (SQL login)
- Static assets: built to `dist/` and served by Node

## Prerequisites

- Node.js 20 LTS
- Bun (recommended) or npm
- SQL Server (local instance)
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
DB_SERVER=localhost
DB_INSTANCE=
DB_PORT=1433
DB_NAME=request_navigator
DB_USER=your_sql_login
DB_PASSWORD=your_sql_password
DB_ENCRYPT=false
DB_TRUST_CERT=true
```

Notes:
- Do not commit `.env`.
- `DB_INSTANCE` is optional for named instances.
- Use `DB_TRUST_CERT=true` for local dev only.

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

SQL Server migrations live in `server/db/migrations/`.
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

- API errors on load: check `.env` and SQL Server connectivity.
- `login failed`: verify SQL login permissions and database name.
- Port conflicts: update `PORT` (API) and `VITE_API_PROXY`.

## Backup And Disaster Recovery (RPO 24h / RTO 2h)

This app stores all business data in SQL Server (`DB_NAME`, defaults to `request_navigator`). If the VM/server is lost, **your recovery depends on having recent `.bak` backups stored off the VM** (NAS).

Current VM note: the deploy script performs a `BACKUP DATABASE` before deployment, but that backup is only useful if it is stored/copied to a safe location (NAS) and restores are tested.

### Recommended Setup (Best Practice)

- Daily full backup to NAS (meets RPO 24h).
- Optional (recommended): differential backups every 6 hours + transaction log backups hourly (improves RPO/RTO).
- Always use `WITH CHECKSUM` and run `RESTORE VERIFYONLY`.
- Keep at least 14 days of backups on NAS (or follow your company policy).
- Test restore monthly to a separate DB name (fire drill).

### SQL Server Edition

The production VM is running **Enterprise Evaluation Edition (64-bit)** which includes SQL Server Agent. Use SQL Agent jobs for scheduled backups.

### SQL Scripts For IT

- SQL Agent jobs (full + optional diff/log + cleanup): `CRA_Local/docs/sqlserver/backup-jobs.sql`
- Restore runbook (step-by-step): `CRA_Local/docs/sqlserver/backup-and-restore.md`

Important: the SQL Server service account (or SQL Agent proxy) must have write permissions to the NAS share path used for backups (example: `\\\\NAS\\SQLBackups\\CRA_Local`).
