import express from "express";
import { randomUUID } from "node:crypto";
import { getPool, sql } from "./db.js";

const ADMIN_LIST_CATEGORIES = new Set([
  "applicationVehicles",
  "countries",
  "brakeTypes",
  "brakeSizes",
  "suspensions",
  "repeatabilityTypes",
  "expectedDeliveryOptions",
  "workingConditions",
  "usageTypes",
  "environments",
  "axleLocations",
  "articulationTypes",
  "configurationTypes",
]);

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const normalizeRequestData = (data, nowIso) => {
  const history = Array.isArray(data.history) ? data.history : [];
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];

  return {
    ...data,
    history,
    attachments,
    createdAt: data.createdAt ?? nowIso,
    updatedAt: data.updatedAt ?? nowIso,
  };
};

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getClientKey = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return `ip:${forwarded.split(",")[0].trim()}`;
  }
  const ip = req.socket.remoteAddress ?? "unknown";
  return `ip:${ip}`;
};

const checkRateLimit = async (pool, req) => {
  const windowMs = 60_000;
  const limit = 60;
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const key = `${getClientKey(req)}:${windowStartMs}`;

  const existing = await pool
    .request()
    .input("key", sql.NVarChar(200), key)
    .query("SELECT [count] FROM rate_limits WHERE [key] = @key");

  if (!existing.recordset.length) {
    await pool
      .request()
      .input("key", sql.NVarChar(200), key)
      .input("window_start", sql.DateTime2, windowStart)
      .input("count", sql.Int, 1)
      .query("INSERT INTO rate_limits ([key], window_start, [count]) VALUES (@key, @window_start, @count)");
    return null;
  }

  const currentCount = existing.recordset[0].count;
  if (currentCount >= limit) {
    return windowStartMs + windowMs;
  }

  await pool
    .request()
    .input("key", sql.NVarChar(200), key)
    .query("UPDATE rate_limits SET [count] = [count] + 1 WHERE [key] = @key");

  return null;
};

const generateRequestId = async (pool) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const counterName = `request_${year}`;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("name", sql.NVarChar(64), counterName)
      .query(
        "IF NOT EXISTS (SELECT 1 FROM counters WHERE name = @name) INSERT INTO counters (name, value) VALUES (@name, 0);"
      );

    const result = await new sql.Request(transaction)
      .input("name", sql.NVarChar(64), counterName)
      .query("UPDATE counters SET value = value + 1 OUTPUT inserted.value WHERE name = @name;");

    await transaction.commit();

    const value = result.recordset[0]?.value;
    if (!value) {
      throw new Error("Failed to generate request id");
    }
    return `CRA${year}${String(value).padStart(4, "0")}`;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getRequestById = async (pool, id) => {
  const row = await pool
    .request()
    .input("id", sql.NVarChar(64), id)
    .query("SELECT data FROM requests WHERE id = @id");

  const data = row.recordset[0]?.data;
  return data ? JSON.parse(data) : null;
};

const fetchAdminLists = async (pool) => {
  const { recordset } = await pool
    .request()
    .query("SELECT id, category, value FROM admin_list_items ORDER BY category, sort_order, value");

  const lists = {};
  for (const category of ADMIN_LIST_CATEGORIES) {
    lists[category] = [];
  }

  for (const row of recordset) {
    if (!lists[row.category]) {
      lists[row.category] = [];
    }
    lists[row.category].push({ id: row.id, value: row.value });
  }

  return lists;
};

export const apiRouter = (() => {
  const router = express.Router();

  router.use(
    asyncHandler(async (req, res, next) => {
      const pool = await getPool();
      const retryAt = await checkRateLimit(pool, req);
      if (retryAt) {
        res.status(429).json({
          error: "Rate limit exceeded",
          retryAfter: Math.ceil((retryAt - Date.now()) / 1000),
        });
        return;
      }
      next();
    })
  );

  router.get(
    "/admin/lists",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const lists = await fetchAdminLists(pool);
      res.json(lists);
    })
  );

  router.get(
    "/admin/lists/:category",
    asyncHandler(async (req, res) => {
      const { category } = req.params;
      if (!ADMIN_LIST_CATEGORIES.has(category)) {
        res.status(404).json({ error: "Unknown list category" });
        return;
      }

      const pool = await getPool();
      const { recordset } = await pool
        .request()
        .input("category", sql.NVarChar(64), category)
        .query(
          "SELECT id, value FROM admin_list_items WHERE category = @category ORDER BY sort_order, value"
        );

      res.json(recordset.map((row) => ({ id: row.id, value: row.value })));
    })
  );

  router.post(
    "/admin/lists/:category",
    asyncHandler(async (req, res) => {
      const { category } = req.params;
      if (!ADMIN_LIST_CATEGORIES.has(category)) {
        res.status(404).json({ error: "Unknown list category" });
        return;
      }

      const value = String(req.body?.value ?? "").trim();
      if (!value) {
        res.status(400).json({ error: "Missing value" });
        return;
      }

      const pool = await getPool();
      const sortRow = await pool
        .request()
        .input("category", sql.NVarChar(64), category)
        .query("SELECT ISNULL(MAX(sort_order), 0) + 1 as next FROM admin_list_items WHERE category = @category");
      const sortOrder = sortRow.recordset[0]?.next ?? 1;

      const id = randomUUID();
      await pool
        .request()
        .input("id", sql.NVarChar(64), id)
        .input("category", sql.NVarChar(64), category)
        .input("value", sql.NVarChar(255), value)
        .input("sort_order", sql.Int, sortOrder)
        .query(
          "INSERT INTO admin_list_items (id, category, value, sort_order) VALUES (@id, @category, @value, @sort_order)"
        );

      res.status(201).json({ id, value });
    })
  );

  router.put(
    "/admin/lists/:category/:itemId",
    asyncHandler(async (req, res) => {
      const { category, itemId } = req.params;
      if (!ADMIN_LIST_CATEGORIES.has(category)) {
        res.status(404).json({ error: "Unknown list category" });
        return;
      }

      const value = String(req.body?.value ?? "").trim();
      if (!value) {
        res.status(400).json({ error: "Missing value" });
        return;
      }

      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), itemId)
        .input("category", sql.NVarChar(64), category)
        .input("value", sql.NVarChar(255), value)
        .query("UPDATE admin_list_items SET value = @value WHERE id = @id AND category = @category");

      res.json({ id: itemId, value });
    })
  );

  router.delete(
    "/admin/lists/:category/:itemId",
    asyncHandler(async (req, res) => {
      const { category, itemId } = req.params;
      if (!ADMIN_LIST_CATEGORIES.has(category)) {
        res.status(404).json({ error: "Unknown list category" });
        return;
      }

      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), itemId)
        .input("category", sql.NVarChar(64), category)
        .query("DELETE FROM admin_list_items WHERE id = @id AND category = @category");

      res.status(204).send();
    })
  );

  router.get(
    "/feedback",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const { recordset } = await pool.request().query(
        "SELECT id, type, title, description, steps, severity, page_path, user_name, user_email, user_role, created_at FROM feedback ORDER BY created_at DESC"
      );

      const data = recordset.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        description: row.description,
        steps: row.steps ?? "",
        severity: row.severity ?? "",
        pagePath: row.page_path ?? "",
        userName: row.user_name ?? "",
        userEmail: row.user_email ?? "",
        userRole: row.user_role ?? "",
        createdAt: row.created_at,
      }));

      res.json(data);
    })
  );

  router.post(
    "/feedback",
    asyncHandler(async (req, res) => {
      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const type = String(body.type ?? "").trim();
      const title = String(body.title ?? "").trim();
      const description = String(body.description ?? "").trim();
      const steps = String(body.steps ?? "").trim();
      const severity = String(body.severity ?? "").trim();
      const pagePath = String(body.pagePath ?? "").trim();
      const userName = String(body.userName ?? "").trim();
      const userEmail = String(body.userEmail ?? "").trim();
      const userRole = String(body.userRole ?? "").trim();

      if (!type || !title || !description) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      const id = randomUUID();
      const nowIso = new Date().toISOString();

      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), id)
        .input("type", sql.NVarChar(50), type)
        .input("title", sql.NVarChar(255), title)
        .input("description", sql.NVarChar(sql.MAX), description)
        .input("steps", sql.NVarChar(sql.MAX), steps || null)
        .input("severity", sql.NVarChar(50), severity || null)
        .input("page_path", sql.NVarChar(255), pagePath || null)
        .input("user_name", sql.NVarChar(255), userName || null)
        .input("user_email", sql.NVarChar(255), userEmail || null)
        .input("user_role", sql.NVarChar(255), userRole || null)
        .input("created_at", sql.DateTime2, new Date(nowIso))
        .query(
          "INSERT INTO feedback (id, type, title, description, steps, severity, page_path, user_name, user_email, user_role, created_at) VALUES (@id, @type, @title, @description, @steps, @severity, @page_path, @user_name, @user_email, @user_role, @created_at)"
        );

      res.status(201).json({
        id,
        type,
        title,
        description,
        steps,
        severity,
        pagePath,
        userName,
        userEmail,
        userRole,
        createdAt: nowIso,
      });
    })
  );

  router.get(
    "/price-list",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const { recordset } = await pool.request().query(
        "SELECT id, configuration_type, articulation_type, brake_type, brake_size, studs_pcd_standards, created_at, updated_at FROM reference_products ORDER BY updated_at DESC"
      );

      const data = recordset.map((row) => ({
        id: row.id,
        configurationType: row.configuration_type ?? "",
        articulationType: row.articulation_type ?? "",
        brakeType: row.brake_type ?? "",
        brakeSize: row.brake_size ?? "",
        studsPcdStandards: parseJsonArray(row.studs_pcd_standards),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(data);
    })
  );

  router.post(
    "/price-list",
    asyncHandler(async (req, res) => {
      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const nowIso = new Date().toISOString();
      const id = randomUUID();
      const studs = Array.isArray(body.studsPcdStandards) ? body.studsPcdStandards : [];

      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), id)
        .input("configuration_type", sql.NVarChar(255), body.configurationType ?? "")
        .input("articulation_type", sql.NVarChar(255), body.articulationType ?? "")
        .input("brake_type", sql.NVarChar(255), body.brakeType ?? "")
        .input("brake_size", sql.NVarChar(255), body.brakeSize ?? "")
        .input("studs_pcd_standards", sql.NVarChar(sql.MAX), JSON.stringify(studs))
        .input("created_at", sql.DateTime2, new Date(nowIso))
        .input("updated_at", sql.DateTime2, new Date(nowIso))
        .query(
          "INSERT INTO reference_products (id, configuration_type, articulation_type, brake_type, brake_size, studs_pcd_standards, created_at, updated_at) VALUES (@id, @configuration_type, @articulation_type, @brake_type, @brake_size, @studs_pcd_standards, @created_at, @updated_at)"
        );

      res.status(201).json({
        id,
        configurationType: body.configurationType ?? "",
        articulationType: body.articulationType ?? "",
        brakeType: body.brakeType ?? "",
        brakeSize: body.brakeSize ?? "",
        studsPcdStandards: studs,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    })
  );

  router.put(
    "/price-list/:itemId",
    asyncHandler(async (req, res) => {
      const { itemId } = req.params;
      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const nowIso = new Date().toISOString();
      const studs = Array.isArray(body.studsPcdStandards) ? body.studsPcdStandards : [];

      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), itemId)
        .input("configuration_type", sql.NVarChar(255), body.configurationType ?? "")
        .input("articulation_type", sql.NVarChar(255), body.articulationType ?? "")
        .input("brake_type", sql.NVarChar(255), body.brakeType ?? "")
        .input("brake_size", sql.NVarChar(255), body.brakeSize ?? "")
        .input("studs_pcd_standards", sql.NVarChar(sql.MAX), JSON.stringify(studs))
        .input("updated_at", sql.DateTime2, new Date(nowIso))
        .query(
          "UPDATE reference_products SET configuration_type = @configuration_type, articulation_type = @articulation_type, brake_type = @brake_type, brake_size = @brake_size, studs_pcd_standards = @studs_pcd_standards, updated_at = @updated_at WHERE id = @id"
        );

      res.json({
        id: itemId,
        configurationType: body.configurationType ?? "",
        articulationType: body.articulationType ?? "",
        brakeType: body.brakeType ?? "",
        brakeSize: body.brakeSize ?? "",
        studsPcdStandards: studs,
        updatedAt: nowIso,
      });
    })
  );

  router.delete(
    "/price-list/:itemId",
    asyncHandler(async (req, res) => {
      const { itemId } = req.params;
      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), itemId)
        .query("DELETE FROM reference_products WHERE id = @id");

      res.status(204).send();
    })
  );

  router.get(
    "/requests",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const { recordset } = await pool
        .request()
        .query("SELECT data FROM requests ORDER BY updated_at DESC");

      res.json(recordset.map((row) => JSON.parse(row.data)));
    })
  );

  router.post(
    "/requests",
    asyncHandler(async (req, res) => {
      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const pool = await getPool();
      const nowIso = new Date().toISOString();
      const id = await generateRequestId(pool);
      const status = body.status ?? "draft";

      const initialHistory = [
        {
          id: `h-${Date.now()}`,
          status,
          timestamp: nowIso,
          userId: body.createdBy ?? "",
          userName: body.createdByName ?? "",
        },
      ];

      const requestData = normalizeRequestData(
        {
          ...body,
          id,
          status,
          createdAt: nowIso,
          updatedAt: nowIso,
          history: body.history?.length ? body.history : initialHistory,
        },
        nowIso
      );

      await pool
        .request()
        .input("id", sql.NVarChar(64), id)
        .input("data", sql.NVarChar(sql.MAX), JSON.stringify(requestData))
        .input("status", sql.NVarChar(50), status)
        .input("created_at", sql.DateTime2, new Date(nowIso))
        .input("updated_at", sql.DateTime2, new Date(nowIso))
        .query(
          "INSERT INTO requests (id, data, status, created_at, updated_at) VALUES (@id, @data, @status, @created_at, @updated_at)"
        );

      res.status(201).json(requestData);
    })
  );

  router.post(
    "/requests/:requestId/status",
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const body = req.body;
      if (!body?.status) {
        res.status(400).json({ error: "Missing status" });
        return;
      }

      const pool = await getPool();
      const existing = await getRequestById(pool, requestId);
      if (!existing) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      const nowIso = new Date().toISOString();
      const historyEntry = {
        id: `h-${Date.now()}`,
        status: body.status,
        timestamp: nowIso,
        userId: body.userId ?? "",
        userName: body.userName ?? "",
        comment: body.comment,
      };

      const updated = normalizeRequestData(
        {
          ...existing,
          status: body.status,
          updatedAt: nowIso,
          history: [...(existing.history ?? []), historyEntry],
        },
        nowIso
      );

      await pool
        .request()
        .input("id", sql.NVarChar(64), requestId)
        .input("data", sql.NVarChar(sql.MAX), JSON.stringify(updated))
        .input("status", sql.NVarChar(50), updated.status)
        .input("updated_at", sql.DateTime2, new Date(nowIso))
        .query("UPDATE requests SET data = @data, status = @status, updated_at = @updated_at WHERE id = @id");

      res.json(updated);
    })
  );

  router.get(
    "/requests/:requestId",
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const pool = await getPool();
      const existing = await getRequestById(pool, requestId);
      if (!existing) {
        res.status(404).json({ error: "Request not found" });
        return;
      }
      res.json(existing);
    })
  );

  router.put(
    "/requests/:requestId",
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const pool = await getPool();
      const existing = await getRequestById(pool, requestId);
      if (!existing) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      const nowIso = new Date().toISOString();
      const updated = normalizeRequestData(
        {
          ...existing,
          ...body,
          updatedAt: nowIso,
        },
        nowIso
      );

      await pool
        .request()
        .input("id", sql.NVarChar(64), requestId)
        .input("data", sql.NVarChar(sql.MAX), JSON.stringify(updated))
        .input("status", sql.NVarChar(50), updated.status ?? existing.status)
        .input("updated_at", sql.DateTime2, new Date(nowIso))
        .query("UPDATE requests SET data = @data, status = @status, updated_at = @updated_at WHERE id = @id");

      res.json(updated);
    })
  );

  router.delete(
    "/requests/:requestId",
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const pool = await getPool();
      await pool.request().input("id", sql.NVarChar(64), requestId).query("DELETE FROM requests WHERE id = @id");
      res.status(204).send();
    })
  );

  return router;
})();
