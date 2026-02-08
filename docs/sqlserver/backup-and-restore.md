# Backup And Restore Runbook (SQL Server)

Target:
- RPO: 24 hours (maximum acceptable data loss)
- RTO: 2 hours (maximum acceptable downtime)

Database (default):
- `request_navigator`

## What To Back Up

Minimum (meets RPO 24h):
- Full backup (`.bak`) once per day.

Recommended (best practice):
- Full backup daily.
- Differential backup every 6 hours.
- Transaction log backup every 1 hour (requires `RECOVERY FULL`).

## Storage Location (NAS)

Backups must be written to an off-VM path (NAS). Example UNC path:
- `\\NAS\SQLBackups\CRA_Local`

Important:
- The SQL Server service account must have write permissions to the share and NTFS path.
- If you cannot grant those permissions, use a local backup folder + a separate server-side copy job to NAS.

## Verify Backups

After each backup, run:
- `RESTORE VERIFYONLY ... WITH CHECKSUM`

This validates the backup structure (it is not a full restore test).

## Restore Procedure (Typical)

1. Stop the CRA app service (to prevent new writes).
2. Restore to the target DB name.
3. Start the CRA app service.

### Full Restore (minimum)

```sql
-- Run on SQL Server
USE master;
GO

-- Example:
-- RESTORE DATABASE [request_navigator]
-- FROM DISK = N'\\NAS\SQLBackups\CRA_Local\request_navigator_FULL_20260208_010000.bak'
-- WITH REPLACE, CHECKSUM, STATS = 10;
```

### Full + Differential + Log Restore (recommended)

```sql
USE master;
GO

-- 1) Restore FULL with NORECOVERY
-- RESTORE DATABASE [request_navigator]
-- FROM DISK = N'\\NAS\SQLBackups\CRA_Local\request_navigator_FULL_20260208_010000.bak'
-- WITH NORECOVERY, REPLACE, CHECKSUM, STATS = 10;

-- 2) Restore latest DIFF with NORECOVERY
-- RESTORE DATABASE [request_navigator]
-- FROM DISK = N'\\NAS\SQLBackups\CRA_Local\request_navigator_DIFF_20260208_070000.bak'
-- WITH NORECOVERY, CHECKSUM, STATS = 10;

-- 3) Restore LOG backups (in order). Last one uses RECOVERY.
-- RESTORE LOG [request_navigator]
-- FROM DISK = N'\\NAS\SQLBackups\CRA_Local\request_navigator_LOG_20260208_080000.trn'
-- WITH NORECOVERY, CHECKSUM, STATS = 10;

-- RESTORE LOG [request_navigator]
-- FROM DISK = N'\\NAS\SQLBackups\CRA_Local\request_navigator_LOG_20260208_090000.trn'
-- WITH RECOVERY, CHECKSUM, STATS = 10;
```

## Test Restores (Fire Drill)

Monthly recommended test:
- Restore latest FULL (and DIFF/LOG if enabled) into a separate DB name, e.g. `request_navigator_restore_test`.
- Point a non-production instance of the app at the restored DB.

## Notes For IT

- If transaction log backups are enabled, set:
  - `ALTER DATABASE [request_navigator] SET RECOVERY FULL;`
  - Then take a full backup to start the log chain.
- Ensure backup retention (at least 14 days) and monitoring/alerts on job failures.

