import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const supabase = createServerClient();

  // Paginate to bypass the 1000-row PostgREST default cap.
  const all: Array<{
    id: string;
    completion_date: string | null;
    source: string | null;
    notes: string | null;
    training_types: { name: string } | null;
    employees: { first_name: string | null; last_name: string | null } | null;
  }> = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("training_records")
      .select(`
        id, completion_date, source, notes,
        training_types ( name ),
        employees ( first_name, last_name )
      `)
      .order("completion_date", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error) throw new ApiError(`Failed to load training records: ${error.message}`, 500, "internal");
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as typeof all));
    if (data.length < PAGE) break;
  }

  const records = all.map((rec) => ({
    id: rec.id,
    attendee: rec.employees
      ? `${rec.employees.first_name ?? ""} ${rec.employees.last_name ?? ""}`.trim()
      : "",
    session: rec.training_types?.name ?? "",
    date: rec.completion_date ?? "",
    source: rec.source ?? "",
    notes: rec.notes ?? "",
  }));

  return { records };
});
