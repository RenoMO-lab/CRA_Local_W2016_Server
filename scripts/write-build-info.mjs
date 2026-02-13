import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
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
  // Prefer git on PATH, but fall back to known bundled Git locations (Windows server deployment).
  const args = ["-C", repoRoot, "log", "-1", "--pretty=format:%H%n%s%n%an%n%ad", "--date=iso-strict"];
  const candidates = [];

  if (process.env.GIT_EXECUTABLE) candidates.push(process.env.GIT_EXECUTABLE);
  candidates.push("git");

  if (process.platform === "win32") {
    candidates.push(path.resolve(repoRoot, "..", "tools", "git", "cmd", "git.exe"));
    candidates.push(path.resolve(repoRoot, "..", "tools", "git", "bin", "git.exe"));
    candidates.push("C:\\Program Files\\Git\\cmd\\git.exe");
    candidates.push("C:\\Program Files\\Git\\bin\\git.exe");
  }

  let stdout = "";
  for (const exe of candidates) {
    if (exe !== "git" && !existsSync(exe)) continue;
    try {
      stdout = execFileSync(exe, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      break;
    } catch {
      // Try next candidate.
    }
  }
  if (!stdout) throw new Error("git metadata unavailable");
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
