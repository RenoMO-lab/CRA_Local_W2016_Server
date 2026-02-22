import dotenv from "dotenv";
import { getPool, closePool } from "../server/db.js";

dotenv.config();

const getIntArg = (name, fallback) => {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  if (!arg) return fallback;
  const parsed = Number.parseInt(arg.slice(prefix.length), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const APPLY = process.argv.includes("--apply");
const WINDOW_HOURS = Math.max(1, getIntArg("--hours", 24));
const LIMIT = Math.max(1, getIntArg("--limit", 1000));

const CANDIDATES_SQL = `
WITH submitted AS (
  SELECT
    id,
    updated_at,
    lower(trim(coalesce(data->>'createdBy', ''))) AS created_by,
    lower(trim(coalesce(data->>'clientName', ''))) AS client_name,
    lower(trim(coalesce(data->>'applicationVehicle', ''))) AS application_vehicle,
    lower(trim(coalesce(data->>'country', ''))) AS country
  FROM requests
  WHERE status = 'submitted'
),
drafts AS (
  SELECT
    id,
    created_at,
    lower(trim(coalesce(data->>'createdBy', ''))) AS created_by,
    lower(trim(coalesce(data->>'clientName', ''))) AS client_name,
    lower(trim(coalesce(data->>'applicationVehicle', ''))) AS application_vehicle,
    lower(trim(coalesce(data->>'country', ''))) AS country
  FROM requests
  WHERE status = 'draft'
),
candidate_matches AS (
  SELECT
    d.id AS draft_id,
    s.id AS submitted_id,
    d.created_at AS draft_created_at,
    s.updated_at AS submitted_updated_at
  FROM drafts d
  JOIN submitted s
    ON d.created_by <> ''
   AND d.created_by = s.created_by
   AND d.client_name <> ''
   AND d.client_name = s.client_name
   AND d.application_vehicle <> ''
   AND d.application_vehicle = s.application_vehicle
   AND d.country <> ''
   AND d.country = s.country
   AND d.created_at <= s.updated_at
   AND d.created_at >= s.updated_at - make_interval(hours => $1::int)
),
ranked AS (
  SELECT
    draft_id,
    submitted_id,
    draft_created_at,
    submitted_updated_at,
    row_number() OVER (
      PARTITION BY draft_id
      ORDER BY submitted_updated_at DESC
    ) AS rn
  FROM candidate_matches
)
SELECT
  draft_id,
  submitted_id,
  draft_created_at,
  submitted_updated_at
FROM ranked
WHERE rn = 1
ORDER BY submitted_updated_at DESC
LIMIT $2::int
`;

const main = async () => {
  const pool = await getPool();
  try {
    const candidatesRes = await pool.query(CANDIDATES_SQL, [WINDOW_HOURS, LIMIT]);
    const candidates = candidatesRes.rows;
    const draftIds = [...new Set(candidates.map((row) => String(row.draft_id)))];

    const summary = {
      mode: APPLY ? "apply" : "dry-run",
      windowHours: WINDOW_HOURS,
      limit: LIMIT,
      candidates: candidates.length,
      wouldDelete: draftIds.length,
      deleted: 0,
      sample: candidates.slice(0, 20),
    };

    if (APPLY && draftIds.length > 0) {
      const deletedRes = await pool.query(
        `
        DELETE FROM requests
        WHERE status = 'draft'
          AND id = ANY($1::text[])
        `,
        [draftIds]
      );
      summary.deleted = deletedRes.rowCount ?? 0;
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await closePool();
  }
};

main().catch((error) => {
  console.error("cleanup-duplicate-drafts failed:", error);
  process.exit(1);
});
