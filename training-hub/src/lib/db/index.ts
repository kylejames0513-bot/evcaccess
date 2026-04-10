// ============================================================
// EVC Training Hub data access layer. Server-only barrel.
// ============================================================
// Import via `import { listEmployees, ... } from "@/lib/db";`
// All exports here are server-only and require the SUPABASE_SERVICE_ROLE_KEY
// env var. Never import this barrel from a "use client" file.
// ============================================================

export * from "./employees";
export * from "./trainings";
export * from "./requirements";
export * from "./completions";
export * from "./excusals";
export * from "./compliance";
export * from "./history";
export * from "./imports";
export * from "./resolution";
