import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

export async function writeAuditLog(
  supabase: SupabaseClient<Database>,
  row: {
    actor?: string | null;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    before?: Json | null;
    after?: Json | null;
    source?: string | null;
    // Legacy compat
    org_id?: string;
    actor_id?: string | null;
    before_data?: Json | null;
    after_data?: Json | null;
  }
) {
  await supabase.from("audit_log").insert({
    actor: row.actor ?? row.actor_id ?? null,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id ?? null,
    before: row.before ?? row.before_data ?? null,
    after: row.after ?? row.after_data ?? null,
    source: row.source ?? null,
  });
}
