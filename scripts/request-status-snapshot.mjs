import { promises as fs } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { getPool } from "../server/db.js";
import { generateStatusSnapshot } from "../server/statusIntegrity.js";

dotenv.config();

const getArgValue = (flag) => {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
};

const main = async () => {
  const outPath = getArgValue("--out");
  if (!outPath) {
    throw new Error("Missing --out <path>");
  }

  const pool = await getPool();
  try {
    const snapshot = await generateStatusSnapshot(pool);
    const fullPath = path.resolve(process.cwd(), outPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, JSON.stringify(snapshot, null, 2), "utf8");
    console.log(`Snapshot written: ${fullPath}`);
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
