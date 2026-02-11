import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getPool } from "./db.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "db", "migrations");

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
};

const getAppliedMigrations = async (client) => {
  const { rows } = await client.query("SELECT filename FROM schema_migrations");
  return new Set(rows.map((row) => row.filename));
};

const applyMigration = async (client, filename, sqlText) => {
  await client.query("BEGIN");
  try {
    await client.query(sqlText);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const main = async () => {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const files = (await fs.readdir(migrationsDir))
      .filter((name) => name.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    const applied = await getAppliedMigrations(client);

    for (const filename of files) {
      if (applied.has(filename)) continue;
      const fullPath = path.join(migrationsDir, filename);
      const sqlText = await fs.readFile(fullPath, "utf8");
      await applyMigration(client, filename, sqlText);
      console.log(`Applied ${filename}`);
    }

    console.log("Migrations complete");
  } finally {
    client.release();
    // Note: do not pool.end() in long-running processes; migrate is a one-shot.
    await pool.end();
  }
};

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

