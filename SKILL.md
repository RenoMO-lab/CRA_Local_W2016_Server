---
name: cra-deploy-windows
description: Deploy CRA safely to local localhost:3000 and Windows production (192.168.50.55) with commit-hash pinning, NSSM restart, and verification; includes known SSH/quoting/PATH pitfalls and fixed command patterns.
---

# CRA Deployment Skill (Windows)

Use this skill whenever the user asks to commit/push/deploy to:
- local dev host `http://localhost:3000`
- remote production host `Administrator@192.168.50.55`

## Locked Environment (current)

- Local workspace repo: `C:\Users\Administrator\Desktop\Dev_App\CRA_Local_W2026\CRA_Local_W2016_Server`
- Production app path: `C:\CRA_Local_Main\app`
- Production service: `CRA_Local_App` (NSSM-managed)
- Production tooling:
  - Git: `C:\CRA_Local_Main\tools\git\cmd\git.exe`
  - Node/NPM: `C:\CRA_Local_Main\tools\node\npm.cmd`

## Non-negotiable Rules

1. Always deploy the exact local commit hash to production (no drift).
2. Always rebuild before restart so `dist/build-info.json` matches deployed hash.
3. Always verify both:
   - repo hash
   - runtime HTTP health (`200`)
4. Local test runtime authority is `:3000`.

## Local Deployment Workflow (`:3000`)

1. Verify clean scope:
   - `git status --short`
2. Commit and push:
   - `git add ...`
   - `git commit -m "..."`
   - `git push origin main`
3. Build locally:
   - `npm run build`
4. Restart local API runtime:
   - stop listener on port 3000
   - start `node server/index.js` from workspace root
5. Verify:
   - `Invoke-WebRequest http://localhost:3000/` returns `200`
   - `dist/build-info.json` hash equals `git rev-parse HEAD`

## Production Deployment Workflow (SSH)

1. Record target hash from local:
   - `git rev-parse HEAD`
2. Fetch and pin production repo to target hash:
   - `git.exe -C C:/CRA_Local_Main/app fetch --prune origin`
   - `git.exe -C C:/CRA_Local_Main/app checkout main`
   - `git.exe -C C:/CRA_Local_Main/app reset --hard <target-hash>`
3. Install dependencies (use fallback ladder below if needed):
   - Preferred:
     - `C:\CRA_Local_Main\tools\node\npm.cmd --prefix C:/CRA_Local_Main/app ci --include=dev`
   - If npm lifecycle scripts fail with `'node' is not recognized`:
     - `C:\CRA_Local_Main\tools\node\node.exe C:\CRA_Local_Main\tools\node\node_modules\npm\bin\npm-cli.js --prefix C:/CRA_Local_Main/app ci --include=dev --ignore-scripts`
     - `C:\CRA_Local_Main\tools\node\node.exe C:\CRA_Local_Main\app\node_modules\esbuild\install.js`
4. Run migrations (known-good, independent from npm PATH issues):
   - `cd /d C:\CRA_Local_Main\app && C:\CRA_Local_Main\tools\node\node.exe server\migrate.js`
5. Build (known-good, independent from npm PATH issues):
   - `cd /d C:\CRA_Local_Main\app && C:\CRA_Local_Main\tools\node\node.exe node_modules\vite\bin\vite.js build && C:\CRA_Local_Main\tools\node\node.exe scripts\write-build-info.mjs`
6. Restart service:
   - `C:\CRA_Local_Main\tools\nssm.exe restart CRA_Local_App`
7. Verify production:
   - `git.exe -C C:/CRA_Local_Main/app rev-parse --short HEAD`
   - `type C:\CRA_Local_Main\app\dist\build-info.json`
   - `sc query CRA_Local_App` is `RUNNING`
   - `Invoke-WebRequest http://localhost:3000/` returns `200` (executed on remote host)

## Fallback Ladder (Mandatory When Remote Shell Is Fragile)

Use this order and stop at first successful path:

1. `npm.cmd --prefix ... ci --include=dev`
2. If lifecycle scripts cannot find `node`:
   - run npm via explicit `node.exe` + `npm-cli.js` with `--ignore-scripts`
   - then execute required postinstall manually (`esbuild/install.js`)
3. Never skip migrate/build after fallback install.
4. Always verify `dist/build-info.json` hash before restart confirmation.

## SSH Command Patterns That Avoid Past Failures

Use these patterns to avoid Windows quoting/parser issues:

1. Prefer direct executable calls over PowerShell scriptblocks when possible:
   - Good: `ssh host "C:\...\git.exe -C C:/... rev-parse --short HEAD"`
2. Avoid `&&` in PowerShell contexts.
3. In `cmd /c` remote strings, escape command separators with `^&` when required.
4. Use forward slashes in `-C` git paths (`C:/CRA_Local_Main/app`) to avoid backslash parsing surprises.
5. Do not assume `git` or `node` are in PATH on remote host.
   - Use absolute tool paths.
6. If `npm ci` fails with `'node' is not recognized` inside install scripts, do not rely only on PATH injection.
   - Switch to explicit `node.exe npm-cli.js --ignore-scripts` + manual `esbuild` install.
7. Prefer direct remote `cmd` execution for build/migrate:
   - `ssh host "cd /d C:\CRA_Local_Main\app && C:\...\node.exe server\migrate.js"`
   - `ssh host "cd /d C:\CRA_Local_Main\app && C:\...\node.exe node_modules\vite\bin\vite.js build && C:\...\node.exe scripts\write-build-info.mjs"`

## Quick Triage Map

- Error: `git is not recognized`
  - Use `C:\CRA_Local_Main\tools\git\cmd\git.exe`
- Error: `node is not recognized` during `npm ci`
  - Use fallback ladder step 2 (`node.exe npm-cli.js --ignore-scripts` + manual `esbuild` install)
- Error: `Missing required env vars: PGHOST...` during migration
  - Run migration from app folder with `cd /d C:\CRA_Local_Main\app && ...node.exe server\migrate.js` (loads local `.env`)
- Error: PowerShell parse error for `&` or `&&`
  - Switch to separate commands, or use `cmd /c` with escaped `^&`
- Service restarted but UI unchanged
  - Re-check `dist/build-info.json` hash and `rev-parse HEAD`

## Final Delivery Checklist (must report)

1. Committed hash
2. Pushed branch and remote
3. Local `:3000` health status
4. Production pinned hash
5. Production service status
6. Production `:3000` health status
