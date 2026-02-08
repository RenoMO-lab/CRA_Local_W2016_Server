/*
SQL Server Backup Jobs (SQL Agent)

Purpose:
- Provide a practical backup schedule for CRA_Local database.
- Default DB name: request_navigator
- Store backups on a NAS path (UNC) so VM loss does not delete backups.

IMPORTANT:
- The SQL Server service account must have write permission to the NAS share.
- If you enable log backups, set RECOVERY FULL and take a full backup first.

Edit these variables:
*/
DECLARE @DbName sysname = N'request_navigator';
DECLARE @BackupDir nvarchar(4000) = N'\\NAS\SQLBackups\CRA_Local'; -- <-- change

/*
Optional: enable FULL recovery for log backups.
If you do not want log backups, leave the DB in SIMPLE recovery.
*/
-- ALTER DATABASE [request_navigator] SET RECOVERY FULL;
-- GO

/*
Create a FULL backup job (daily).
Creates files like: request_navigator_FULL_20260208_010000.bak
*/
USE msdb;
GO

DECLARE @JobId uniqueidentifier;
DECLARE @JobName sysname = N'CRA_Local - Full Backup (Daily)';

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = @JobName)
BEGIN
  EXEC msdb.dbo.sp_delete_job @job_name = @JobName, @delete_unused_schedule = 1;
END;

EXEC msdb.dbo.sp_add_job
  @job_name = @JobName,
  @enabled = 1,
  @description = N'Daily FULL backup with CHECKSUM + VERIFYONLY',
  @start_step_id = 1,
  @owner_login_name = N'sa',
  @job_id = @JobId OUTPUT;

EXEC msdb.dbo.sp_add_jobstep
  @job_id = @JobId,
  @step_id = 1,
  @step_name = N'Full backup + verify',
  @subsystem = N'TSQL',
  @database_name = N'master',
  @command = N'
DECLARE @DbName sysname = N''' + REPLACE(@DbName,'''','''''') + N''';
DECLARE @BackupDir nvarchar(4000) = N''' + REPLACE(@BackupDir,'''','''''') + N''';
DECLARE @Stamp nvarchar(32) = REPLACE(CONVERT(varchar(19), GETDATE(), 120), '':'' , '''');
SET @Stamp = REPLACE(@Stamp, ''-'', '''');
SET @Stamp = REPLACE(@Stamp, '' '', ''_'');
DECLARE @File nvarchar(4000) = @BackupDir + N''\'' + @DbName + N''_FULL_'' + @Stamp + N''.bak'';

BACKUP DATABASE @DbName
TO DISK = @File
WITH COMPRESSION, CHECKSUM, INIT, STATS = 10;

RESTORE VERIFYONLY
FROM DISK = @File
WITH CHECKSUM;
',
  @on_success_action = 1,
  @on_fail_action = 2;

-- Schedule: daily at 01:00
EXEC msdb.dbo.sp_add_schedule
  @schedule_name = N'CRA_Local - Full Backup Daily 01:00',
  @enabled = 1,
  @freq_type = 4,           -- daily
  @freq_interval = 1,       -- every 1 day
  @active_start_time = 010000; -- 01:00:00

EXEC msdb.dbo.sp_attach_schedule
  @job_id = @JobId,
  @schedule_name = N'CRA_Local - Full Backup Daily 01:00';

EXEC msdb.dbo.sp_add_jobserver
  @job_id = @JobId,
  @server_name = N'(local)';
GO

/*
Optional: DIFFERENTIAL backup job (every 6 hours).
*/
DECLARE @DiffJobId uniqueidentifier;
DECLARE @DiffJobName sysname = N'CRA_Local - Differential Backup (Every 6h)';

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = @DiffJobName)
BEGIN
  EXEC msdb.dbo.sp_delete_job @job_name = @DiffJobName, @delete_unused_schedule = 1;
END;

EXEC msdb.dbo.sp_add_job
  @job_name = @DiffJobName,
  @enabled = 0, -- disabled by default; enable if wanted
  @description = N'DIFF backup with CHECKSUM + VERIFYONLY (every 6 hours)',
  @start_step_id = 1,
  @owner_login_name = N'sa',
  @job_id = @DiffJobId OUTPUT;

EXEC msdb.dbo.sp_add_jobstep
  @job_id = @DiffJobId,
  @step_id = 1,
  @step_name = N'Diff backup + verify',
  @subsystem = N'TSQL',
  @database_name = N'master',
  @command = N'
DECLARE @DbName sysname = N''' + REPLACE(@DbName,'''','''''') + N''';
DECLARE @BackupDir nvarchar(4000) = N''' + REPLACE(@BackupDir,'''','''''') + N''';
DECLARE @Stamp nvarchar(32) = REPLACE(CONVERT(varchar(19), GETDATE(), 120), '':'' , '''');
SET @Stamp = REPLACE(@Stamp, ''-'', '''');
SET @Stamp = REPLACE(@Stamp, '' '', ''_'');
DECLARE @File nvarchar(4000) = @BackupDir + N''\'' + @DbName + N''_DIFF_'' + @Stamp + N''.bak'';

BACKUP DATABASE @DbName
TO DISK = @File
WITH DIFFERENTIAL, COMPRESSION, CHECKSUM, INIT, STATS = 10;

RESTORE VERIFYONLY
FROM DISK = @File
WITH CHECKSUM;
',
  @on_success_action = 1,
  @on_fail_action = 2;

-- Schedule: every 6 hours (00:30, 06:30, 12:30, 18:30)
EXEC msdb.dbo.sp_add_schedule
  @schedule_name = N'CRA_Local - Diff Backup q6h',
  @enabled = 1,
  @freq_type = 4,
  @freq_interval = 1,
  @freq_subday_type = 8,        -- hours
  @freq_subday_interval = 6,
  @active_start_time = 003000;  -- 00:30:00

EXEC msdb.dbo.sp_attach_schedule
  @job_id = @DiffJobId,
  @schedule_name = N'CRA_Local - Diff Backup q6h';

EXEC msdb.dbo.sp_add_jobserver
  @job_id = @DiffJobId,
  @server_name = N'(local)';
GO

/*
Optional: LOG backup job (hourly). Requires RECOVERY FULL.
*/
DECLARE @LogJobId uniqueidentifier;
DECLARE @LogJobName sysname = N'CRA_Local - Log Backup (Hourly)';

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = @LogJobName)
BEGIN
  EXEC msdb.dbo.sp_delete_job @job_name = @LogJobName, @delete_unused_schedule = 1;
END;

EXEC msdb.dbo.sp_add_job
  @job_name = @LogJobName,
  @enabled = 0, -- disabled by default; enable if wanted
  @description = N'Hourly LOG backups with CHECKSUM + VERIFYONLY',
  @start_step_id = 1,
  @owner_login_name = N'sa',
  @job_id = @LogJobId OUTPUT;

EXEC msdb.dbo.sp_add_jobstep
  @job_id = @LogJobId,
  @step_id = 1,
  @step_name = N'Log backup + verify',
  @subsystem = N'TSQL',
  @database_name = N'master',
  @command = N'
DECLARE @DbName sysname = N''' + REPLACE(@DbName,'''','''''') + N''';
DECLARE @BackupDir nvarchar(4000) = N''' + REPLACE(@BackupDir,'''','''''') + N''';
DECLARE @Stamp nvarchar(32) = REPLACE(CONVERT(varchar(19), GETDATE(), 120), '':'' , '''');
SET @Stamp = REPLACE(@Stamp, ''-'', '''');
SET @Stamp = REPLACE(@Stamp, '' '', ''_'');
DECLARE @File nvarchar(4000) = @BackupDir + N''\'' + @DbName + N''_LOG_'' + @Stamp + N''.trn'';

BACKUP LOG @DbName
TO DISK = @File
WITH COMPRESSION, CHECKSUM, INIT, STATS = 10;

RESTORE VERIFYONLY
FROM DISK = @File
WITH CHECKSUM;
',
  @on_success_action = 1,
  @on_fail_action = 2;

-- Schedule: hourly at minute 15
EXEC msdb.dbo.sp_add_schedule
  @schedule_name = N'CRA_Local - Log Backup Hourly',
  @enabled = 1,
  @freq_type = 4,
  @freq_interval = 1,
  @freq_subday_type = 8,        -- hours
  @freq_subday_interval = 1,
  @active_start_time = 001500;  -- 00:15:00

EXEC msdb.dbo.sp_attach_schedule
  @job_id = @LogJobId,
  @schedule_name = N'CRA_Local - Log Backup Hourly';

EXEC msdb.dbo.sp_add_jobserver
  @job_id = @LogJobId,
  @server_name = N'(local)';
GO

/*
Cleanup (optional):
- Prefer NAS retention policy, or implement a separate cleanup job.
- You can use xp_delete_file for local paths (or UNC if service account has access).
*/

