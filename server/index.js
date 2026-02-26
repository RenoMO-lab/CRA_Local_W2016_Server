import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { apiRouter } from "./api.js";
import { pingDb } from "./db.js";
import { startNotificationsWorker } from "./notificationsWorker.js";
import { startDbMonitor } from "./dbMonitor.js";
import { startDbBackupScheduler } from "./dbBackup.js";
import { startStatusIntegrityMonitor } from "./statusIntegrityMonitor.js";

dotenv.config();

const app = express();
app.disable("x-powered-by");
// Attachments are uploaded as base64 within JSON today; allow moderate payloads.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "50mb" }));

app.use("/api", apiRouter);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

app.use(
  "/assets",
  express.static(path.join(distDir, "assets"), {
    immutable: true,
    maxAge: "1y",
  })
);

app.use(
  express.static(distDir, {
    setHeaders(res, filePath) {
      // Allow index.html to be revalidated so deployments show up immediately.
      if (filePath.endsWith(`${path.sep}index.html`)) {
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  })
);

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // For SPA deep-links (e.g. /settings), we serve index.html from this handler.
  // Avoid sendFile() here, because it sets its own Cache-Control headers.
  // Old cached index.html can point at stale hashed assets, hiding new UI sections.
  const indexPath = path.join(distDir, "index.html");
  const html = fs.readFileSync(indexPath, "utf8");
  res.status(200);
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.type("html").send(html);
});

app.use((err, req, res, next) => {
  // Normalize common body parser errors so the UI gets actionable status codes.
  // - entity.too.large => 413 Payload Too Large (often large base64 attachments)
  // - entity.parse.failed / SyntaxError => 400 Bad Request (invalid JSON)
  const type = err?.type;
  const status = Number(err?.statusCode ?? err?.status ?? 500);

  if (type === "entity.too.large") {
    res.status(413).json({ error: "Payload too large" });
    return;
  }

  if (type === "entity.parse.failed" || err instanceof SyntaxError) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  console.error(err);
  res.status(Number.isFinite(status) && status >= 400 && status < 600 ? status : 500).json({
    error: "Internal server error",
  });
});

const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "0.0.0.0";

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

const connectWithRetry = async ({ maxAttempts = 60, delayMs = 5000 } = {}) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pingDb();
      return;
    } catch (error) {
      console.error(`Database connection failed (attempt ${attempt}/${maxAttempts}):`, error?.message ?? error);
      if (attempt === maxAttempts) throw error;
      await sleepMs(delayMs);
    }
  }
};

connectWithRetry()
  .then(() => {
    app.listen(port, host, () => {
      console.log(`Server listening on http://${host}:${port}`);
    });

    try {
      startNotificationsWorker();
    } catch (e) {
      console.error("Failed to start notifications worker:", e);
    }

    try {
      startDbMonitor();
    } catch (e) {
      console.error("Failed to start DB monitor:", e);
    }

    try {
      startDbBackupScheduler();
    } catch (e) {
      console.error("Failed to start DB backup scheduler:", e);
    }

    try {
      startStatusIntegrityMonitor({
        intervalMs: process.env.STATUS_INTEGRITY_MONITOR_INTERVAL_MS
          ? Number.parseInt(process.env.STATUS_INTEGRITY_MONITOR_INTERVAL_MS, 10)
          : undefined,
      });
    } catch (e) {
      console.error("Failed to start status integrity monitor:", e);
    }
  })
  .catch((error) => {
    console.error("Database connection failed (giving up):", error);
    process.exit(1);
  });
