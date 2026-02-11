import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const distDir = path.join(repoRoot, "dist");
const outPath = path.join(distDir, "build-info.json");

const buildInfo = {
  hash: "",
  message: "",
  author: "",
  date: "",
  builtAt: new Date().toISOString(),
};

try {
  const stdout = execFileSync(
    "git",
    ["-C", repoRoot, "log", "-1", "--pretty=format:%H%n%s%n%an%n%ad", "--date=iso-strict"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const [hash = "", message = "", author = "", date = ""] = stdout.trim().split("\n");
  buildInfo.hash = hash;
  buildInfo.message = message;
  buildInfo.author = author;
  buildInfo.date = date;
} catch {
  // Keep fields empty when git metadata is unavailable.
}

await mkdir(distDir, { recursive: true });
await writeFile(outPath, JSON.stringify(buildInfo, null, 2), "utf8");
console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
