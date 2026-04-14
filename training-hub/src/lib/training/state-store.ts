import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  Employee,
  HubPushPayload,
  HubState,
  HubSyncState,
  ImportData,
  ImportSummary,
  RequiredTrainingKey,
  TrainingRecord,
} from "@/lib/training/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const STATE_FILE = path.join(DATA_DIR, "hub-state.json");
const MAX_RUN_HISTORY = 200;

const DEFAULT_SYNC_STATE: HubSyncState = {
  lastRunId: null,
  lastSource: null,
  lastPushedAt: null,
  pushCount: 0,
  processedRunIds: [],
};

const DEFAULT_STATE: HubState = {
  data: null,
  summary: null,
  sync: DEFAULT_SYNC_STATE,
};

function normalizeTrainingKey(raw: unknown): RequiredTrainingKey | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "cpi") {
    return "cpi";
  }
  if (value === "med" || value === "medication") {
    return "med";
  }
  if (value === "cpr") {
    return "cpr";
  }
  if (value === "abuse") {
    return "abuse";
  }
  if (value === "hipaa") {
    return "hipaa";
  }
  return null;
}

function parseEmployeeStatus(raw: unknown): "active" | "inactive" {
  return String(raw ?? "")
    .trim()
    .toLowerCase() === "inactive"
    ? "inactive"
    : "active";
}

function normalizeEmployees(rows: HubPushPayload["employees"]): {
  employees: Employee[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const employees: Employee[] = [];

  for (const [index, row] of rows.entries()) {
    const employeeId = String(row.employee_id ?? row.employeeId ?? "").trim();
    const name = String(row.name ?? "").trim();
    if (!employeeId || !name) {
      warnings.push(`Skipped employee row ${index + 1}: missing employee_id or name.`);
      continue;
    }

    employees.push({
      employeeId,
      name,
      division: String(row.division ?? "").trim() || null,
      location: String(row.location ?? "").trim() || null,
      status: parseEmployeeStatus(row.status),
    });
  }

  return { employees, warnings };
}

function normalizeRecords(rows: HubPushPayload["records"]): {
  records: TrainingRecord[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const records: TrainingRecord[] = [];

  for (const [index, row] of rows.entries()) {
    const employeeId = String(row.employee_id ?? row.employeeId ?? "").trim();
    const trainingKey = normalizeTrainingKey(row.training_key ?? row.trainingKey);
    if (!employeeId || !trainingKey) {
      warnings.push(
        `Skipped record row ${index + 1}: missing employee_id or invalid training_key.`,
      );
      continue;
    }

    records.push({
      employeeId,
      trainingKey,
      completedAt: String(row.completed_at ?? row.completedAt ?? "").trim() || null,
      expiresAt: String(row.expires_at ?? row.expiresAt ?? "").trim() || null,
      source: String(row.source ?? "").trim() || null,
    });
  }

  return { records, warnings };
}

function buildSummary(data: ImportData, warnings: string[]): ImportSummary {
  return {
    employeeCount: data.employees.length,
    recordCount: data.records.length,
    warningCount: warnings.length,
    warnings,
  };
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readHubState(): Promise<HubState> {
  try {
    const json = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(json) as HubState;
    return {
      data: parsed.data ?? null,
      summary: parsed.summary ?? null,
      sync: {
        ...DEFAULT_SYNC_STATE,
        ...(parsed.sync ?? {}),
        processedRunIds: Array.isArray(parsed.sync?.processedRunIds)
          ? parsed.sync.processedRunIds
          : [],
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export async function writeHubState(state: HubState): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

export async function processHubPush(payload: HubPushPayload): Promise<{
  state: HubState;
  imported: boolean;
  ignored: boolean;
  message: string;
}> {
  const runId = payload.runId.trim();
  if (!runId) {
    throw new Error("runId is required.");
  }

  const existing = await readHubState();
  if (existing.sync.processedRunIds.includes(runId)) {
    return {
      state: existing,
      imported: false,
      ignored: true,
      message: `Run ${runId} already processed.`,
    };
  }

  const employeesResult = normalizeEmployees(payload.employees);
  const recordsResult = normalizeRecords(payload.records);
  const data: ImportData = {
    employees: employeesResult.employees,
    records: recordsResult.records,
  };
  const warnings = [...employeesResult.warnings, ...recordsResult.warnings];
  const summary = buildSummary(data, warnings);

  const nowIso = new Date().toISOString();
  const processedRunIds = [runId, ...existing.sync.processedRunIds].slice(0, MAX_RUN_HISTORY);

  const nextState: HubState = {
    data,
    summary,
    sync: {
      lastRunId: runId,
      lastSource: payload.source?.trim() || null,
      lastPushedAt: nowIso,
      pushCount: existing.sync.pushCount + 1,
      processedRunIds,
    },
  };

  await writeHubState(nextState);
  return {
    state: nextState,
    imported: true,
    ignored: false,
    message: `Run ${runId} imported.`,
  };
}
