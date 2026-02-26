import dotenv from "dotenv";
import { getPool } from "../server/db.js";
import { generateStatusIntegrityReport } from "../server/statusIntegrity.js";

dotenv.config();

const parseLimit = (raw) => {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, parsed));
};

const getArgValue = (flag) => {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
};

const main = async () => {
  const limit = parseLimit(getArgValue("--limit"));
  const pool = await getPool();
  try {
    const report = await generateStatusIntegrityReport(pool, { limit });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.mismatchCount > 0) {
      process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
