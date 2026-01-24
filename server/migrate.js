import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getPool, sql } from "./db.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "db", "migrations");

const ensureMigrationsTable = async (pool) => {
  await pool.request().batch(`
    IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.schema_migrations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        filename NVARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME2 NOT NULL
      );
    END;
  `);
};

const getAppliedMigrations = async (pool) => {
  const { recordset } = await pool.request().query("SELECT filename FROM dbo.schema_migrations");
  return new Set(recordset.map((row) => row.filename));
};

const applyMigration = async (pool, filename, sqlText) => {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction).batch(sqlText);
    await new sql.Request(transaction)
      .input("filename", sql.NVarChar(255), filename)
      .query("INSERT INTO dbo.schema_migrations (filename, applied_at) VALUES (@filename, SYSUTCDATETIME())");
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const main = async () => {
  const pool = await getPool();
  await ensureMigrationsTable(pool);

  const files = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const applied = await getAppliedMigrations(pool);

  for (const filename of files) {
    if (applied.has(filename)) {
      continue;
    }
    const fullPath = path.join(migrationsDir, filename);
    const sqlText = await fs.readFile(fullPath, "utf8");
    await applyMigration(pool, filename, sqlText);
    console.log(`Applied ${filename}`);
  }

  console.log("Migrations complete");
  await pool.close();
};

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
