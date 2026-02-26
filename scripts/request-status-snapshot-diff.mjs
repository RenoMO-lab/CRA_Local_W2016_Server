import { promises as fs } from "node:fs";
import path from "node:path";
import { getStatusRank } from "../server/statusIntegrity.js";

const getArgValue = (flag) => {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
};

const loadSnapshot = async (inputPath) => {
  const fullPath = path.resolve(process.cwd(), inputPath);
  const raw = await fs.readFile(fullPath, "utf8");
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const byId = new Map();
  for (const item of items) {
    const id = String(item?.id ?? "").trim();
    if (!id) continue;
    byId.set(id, item);
  }
  return { fullPath, byId };
};

const main = async () => {
  const beforePath = getArgValue("--before");
  const afterPath = getArgValue("--after");
  if (!beforePath || !afterPath) {
    throw new Error("Missing required args: --before <path> --after <path>");
  }

  const [before, after] = await Promise.all([loadSnapshot(beforePath), loadSnapshot(afterPath)]);

  const regressions = [];
  for (const [id, oldEntry] of before.byId) {
    const newEntry = after.byId.get(id);
    if (!newEntry) continue;

    const oldStatus = String(oldEntry?.currentStatus ?? "").trim();
    const newStatus = String(newEntry?.currentStatus ?? "").trim();
    if (!oldStatus || !newStatus || oldStatus === newStatus) continue;

    const oldRank = getStatusRank(oldStatus);
    const newRank = getStatusRank(newStatus);
    if (oldRank >= 0 && newRank >= 0 && newRank < oldRank) {
      regressions.push({
        id,
        from: oldStatus,
        to: newStatus,
      });
    }
  }

  if (regressions.length > 0) {
    console.error(
      JSON.stringify(
        {
          regressionCount: regressions.length,
          regressions,
        },
        null,
        2
      )
    );
    process.exit(2);
    return;
  }

  console.log(
    JSON.stringify(
      {
        regressionCount: 0,
        message: "No status regressions detected",
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
