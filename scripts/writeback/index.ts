/**
 * Writeback CLI dispatcher
 *
 * Usage:
 *   npm run writeback:separations [-- --dry-run]
 *
 * Reads pending_xlsx_writes rows from Supabase, applies each to the
 * appropriate local workbook, marks them applied. Does NOT touch Google
 * Sheets (that's the Apps Script writeback path).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

function makeClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `npm run vercel:env:pull` or set them in .env.local.",
    );
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  const [, , target] = process.argv;
  const dryRun = process.argv.includes("--dry-run");

  if (!target || target === "--help" || target === "-h") {
    console.log("Usage: node --import tsx scripts/writeback/index.ts <target> [--dry-run]");
    console.log("Targets: separations");
    process.exit(target ? 0 : 1);
  }

  const supabase = makeClient();

  if (target === "separations") {
    const { runSeparationsWriteback } = await import("./separationSummary");
    const stats = await runSeparationsWriteback({ supabase, dryRun });
    console.log("\nWriteback complete:", stats);
    process.exit(stats.failed > 0 ? 1 : 0);
  }

  console.error(`Unknown target: ${target}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
