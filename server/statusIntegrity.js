const WORKFLOW_STATUS_ORDER = Object.freeze([
  "draft",
  "submitted",
  "under_review",
  "clarification_needed",
  "feasibility_confirmed",
  "design_result",
  "in_costing",
  "costing_complete",
  "sales_followup",
  "gm_approval_pending",
  "gm_rejected",
  "gm_approved",
  "closed",
  "cancelled",
]);

const toTransitionSet = (values) => new Set(values.map((value) => String(value ?? "").trim()));

const REQUEST_STATUS_TRANSITIONS = Object.freeze({
  draft: toTransitionSet(["submitted", "cancelled"]),
  submitted: toTransitionSet(["under_review", "clarification_needed", "cancelled"]),
  under_review: toTransitionSet(["feasibility_confirmed", "design_result", "clarification_needed", "cancelled"]),
  clarification_needed: toTransitionSet(["submitted", "cancelled"]),
  feasibility_confirmed: toTransitionSet(["design_result", "in_costing", "cancelled"]),
  design_result: toTransitionSet(["in_costing", "costing_complete", "cancelled"]),
  in_costing: toTransitionSet(["costing_complete", "clarification_needed", "cancelled"]),
  costing_complete: toTransitionSet(["sales_followup", "gm_approval_pending", "cancelled", "closed"]),
  sales_followup: toTransitionSet(["gm_approval_pending", "gm_approved", "cancelled", "closed"]),
  gm_approval_pending: toTransitionSet(["gm_approved", "gm_rejected", "cancelled"]),
  gm_approved: toTransitionSet(["closed"]),
  gm_rejected: toTransitionSet(["sales_followup", "gm_approval_pending", "cancelled"]),
  closed: toTransitionSet([]),
  cancelled: toTransitionSet([]),
});

const WORKFLOW_STATUS_SET = new Set(WORKFLOW_STATUS_ORDER);
const WORKFLOW_STATUS_RANK = new Map(WORKFLOW_STATUS_ORDER.map((status, index) => [status, index]));

const parseHistoryEntryTimestamp = (entry) => {
  const raw = entry?.timestamp ?? entry?.ts ?? entry?.time ?? null;
  if (!raw) return null;
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const normalizeHistoryEntries = (historyInput) => {
  const source = Array.isArray(historyInput) ? historyInput : [];
  const out = [];
  for (const entry of source) {
    const status = String(entry?.status ?? "").trim();
    if (!status) continue;
    const timestamp = parseHistoryEntryTimestamp(entry);
    if (!timestamp) continue;
    out.push({
      status,
      timestamp,
    });
  }
  out.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return out;
};

const safeParseRequestData = (rawData) => {
  if (!rawData) return null;
  if (typeof rawData === "object") return rawData;
  try {
    return JSON.parse(rawData);
  } catch {
    return null;
  }
};

const computeSubmitAfterClarificationCount = (historyEntries) => {
  let clarificationSeen = 0;
  let resubmittedAfterClarification = 0;
  for (const entry of historyEntries) {
    if (entry.status === "clarification_needed") {
      clarificationSeen += 1;
      continue;
    }
    if (entry.status === "submitted" && clarificationSeen > 0) {
      resubmittedAfterClarification += 1;
    }
  }
  return resubmittedAfterClarification;
};

export const getStatusRank = (status) => {
  const normalized = String(status ?? "").trim();
  return WORKFLOW_STATUS_RANK.has(normalized) ? WORKFLOW_STATUS_RANK.get(normalized) : -1;
};

export const isKnownRequestStatus = (status) => WORKFLOW_STATUS_SET.has(String(status ?? "").trim());

export const isAllowedStatusTransition = (fromStatus, toStatus) => {
  const from = String(fromStatus ?? "").trim();
  const to = String(toStatus ?? "").trim();
  if (!to || !isKnownRequestStatus(to)) return false;
  if (!from || !isKnownRequestStatus(from)) return false;
  if (from === to) return true;
  const allowed = REQUEST_STATUS_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.has(to);
};

export const getAllowedStatusTransitions = (status) => {
  const normalized = String(status ?? "").trim();
  if (!isKnownRequestStatus(normalized)) return [];
  return Array.from(REQUEST_STATUS_TRANSITIONS[normalized] ?? []);
};

export const getWorkflowStatusOrder = () => [...WORKFLOW_STATUS_ORDER];

export const buildRequestSnapshotEntry = (row) => {
  const currentStatus = String(row?.status ?? "").trim();
  const updatedAt = row?.updated_at ? new Date(row.updated_at).toISOString() : null;
  const data = safeParseRequestData(row?.data);
  const historyEntries = normalizeHistoryEntries(data?.history);
  const latestNonEditedHistory = [...historyEntries].reverse().find((entry) => entry.status !== "edited");
  const latestHistoryStatus = latestNonEditedHistory?.status ?? null;
  const latestHistoryAt = latestNonEditedHistory?.timestamp ?? null;
  const submitAfterClarificationCount = computeSubmitAfterClarificationCount(historyEntries);
  return {
    id: String(row?.id ?? "").trim(),
    currentStatus,
    updatedAt,
    latestHistoryStatus,
    latestHistoryAt,
    submitAfterClarificationCount,
  };
};

export const generateStatusSnapshot = async (pool) => {
  const { rows } = await pool.query(
    `
    SELECT id, status, updated_at, data
      FROM requests
     ORDER BY updated_at DESC
    `
  );
  const items = rows.map(buildRequestSnapshotEntry).filter((row) => row.id);
  return {
    generatedAt: new Date().toISOString(),
    count: items.length,
    items,
  };
};

export const generateStatusIntegrityReport = async (pool, { limit = 100 } = {}) => {
  const snapshot = await generateStatusSnapshot(pool);
  const maxRows = Math.max(1, Math.min(500, Number.parseInt(String(limit ?? ""), 10) || 100));
  const mismatches = [];
  const repeatedSubmitLoops = [];

  for (const entry of snapshot.items) {
    if (entry.latestHistoryStatus && entry.latestHistoryStatus !== entry.currentStatus) {
      mismatches.push({
        id: entry.id,
        currentStatus: entry.currentStatus,
        latestHistoryStatus: entry.latestHistoryStatus,
        latestHistoryAt: entry.latestHistoryAt,
        updatedAt: entry.updatedAt,
      });
    }

    if (entry.submitAfterClarificationCount > 1) {
      repeatedSubmitLoops.push({
        id: entry.id,
        submitAfterClarificationCount: entry.submitAfterClarificationCount,
        currentStatus: entry.currentStatus,
        updatedAt: entry.updatedAt,
      });
    }
  }

  return {
    generatedAt: snapshot.generatedAt,
    totalRequests: snapshot.count,
    mismatchCount: mismatches.length,
    repeatedSubmitLoopCount: repeatedSubmitLoops.length,
    mismatches: mismatches.slice(0, maxRows),
    repeatedSubmitLoops: repeatedSubmitLoops.slice(0, maxRows),
  };
};
