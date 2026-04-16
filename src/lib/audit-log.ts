import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

export async function writeAuditLog(
  supabase: SupabaseClient<Database>,
  row: {
    org_id: string;
    actor_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    before_data: Json | null;
    after_data: Json | null;
  }
) {
  const { error } = await supabase.from("audit_log").insert({
    org_id: row.org_id,
    actor_id: row.actor_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    before_data: row.before_data,
    after_data: row.after_data,
  });
  if (error) throw error;
}
