import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

// ============================================================
// Data Quality fix actions — Supabase-native, UUID-based
// ============================================================

interface DeleteOrphanRecordsPayload {
  action: "delete_orphan_records";
  recordIds: string[];
}

interface DeleteOrphanExcusalsPayload {
  action: "delete_orphan_excusals";
  excusalIds: string[];
}

interface DeleteBadDateRecordPayload {
  action: "delete_bad_date_record";
  recordId: string;
}

interface MergeDuplicatesPayload {
  action: "merge_duplicates";
  keepId: string;
  removeIds: string[];
}

type FixPayload =
  | DeleteOrphanRecordsPayload
  | DeleteOrphanExcusalsPayload
  | DeleteBadDateRecordPayload
  | MergeDuplicatesPayload;

type ExistingRecord = { training_type_id: number };

export const POST = withApiHandler(async (request) => {
  const body: FixPayload = await request.json();
  const supabase = createServerClient();

  switch (body.action) {
    case "delete_orphan_records": {
      if (!body.recordIds?.length) {
        throw new ApiError("No recordIds provided", 400, "missing_field");
      }
      const { error } = await supabase
        .from("training_records")
        .delete()
        .in("id", body.recordIds);
      if (error) throw new ApiError(`delete failed: ${error.message}`, 500, "internal");
      return { success: true, deleted: body.recordIds.length };
    }

    case "delete_orphan_excusals": {
      if (!body.excusalIds?.length) {
        throw new ApiError("No excusalIds provided", 400, "missing_field");
      }
      const { error } = await supabase
        .from("excusals")
        .delete()
        .in("id", body.excusalIds);
      if (error) throw new ApiError(`delete failed: ${error.message}`, 500, "internal");
      return { success: true, deleted: body.excusalIds.length };
    }

    case "delete_bad_date_record": {
      if (!body.recordId) {
        throw new ApiError("Missing recordId", 400, "missing_field");
      }
      const { error } = await supabase
        .from("training_records")
        .delete()
        .eq("id", body.recordId);
      if (error) throw new ApiError(`delete failed: ${error.message}`, 500, "internal");
      return { success: true };
    }

    case "merge_duplicates": {
      const { keepId, removeIds } = body;
      if (!keepId || !removeIds?.length) {
        throw new ApiError("Missing keepId or removeIds", 400, "missing_field");
      }

      for (const removeId of removeIds) {
        // Fetch records from the duplicate
        const { data: removeRecords } = await supabase
          .from("training_records")
          .select("training_type_id, completion_date, source")
          .eq("employee_id", removeId);

        // Fetch existing records on the kept employee
        const { data: keepRecords } = await supabase
          .from("training_records")
          .select("training_type_id")
          .eq("employee_id", keepId);

        const keepTypes = new Set(
          (keepRecords || []).map((r: ExistingRecord) => r.training_type_id)
        );

        // Copy any records the kept employee doesn't have
        for (const rec of removeRecords || []) {
          if (!keepTypes.has(rec.training_type_id)) {
            await supabase.from("training_records").insert({
              employee_id: keepId,
              training_type_id: rec.training_type_id,
              completion_date: rec.completion_date,
              source: rec.source,
            });
          }
        }

        // Same for excusals
        const { data: removeExc } = await supabase
          .from("excusals")
          .select("training_type_id, reason")
          .eq("employee_id", removeId);

        const { data: keepExc } = await supabase
          .from("excusals")
          .select("training_type_id")
          .eq("employee_id", keepId);

        const keepExcTypes = new Set(
          (keepExc || []).map((e: ExistingRecord) => e.training_type_id)
        );

        for (const exc of removeExc || []) {
          if (!keepExcTypes.has(exc.training_type_id) && !keepTypes.has(exc.training_type_id)) {
            await supabase.from("excusals").insert({
              employee_id: keepId,
              training_type_id: exc.training_type_id,
              reason: exc.reason,
            });
          }
        }

        // Delete the duplicate's data and the duplicate employee
        await supabase.from("training_records").delete().eq("employee_id", removeId);
        await supabase.from("excusals").delete().eq("employee_id", removeId);
        await supabase.from("enrollments").delete().eq("employee_id", removeId);
        await supabase.from("employees").delete().eq("id", removeId);
      }

      return {
        success: true,
        message: `Merged ${removeIds.length} duplicate(s) into ${keepId}`,
      };
    }

    default:
      throw new ApiError(
        `Unknown action: ${(body as { action: string }).action}`,
        400,
        "invalid_field"
      );
  }
});
