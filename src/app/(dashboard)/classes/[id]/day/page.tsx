import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ClassDayAttendanceTable,
  type ClassDayAttendanceRow,
} from "@/components/training-hub/class-day-attendance-table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ClassDayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");
  if (profile.role === "viewer") redirect("/classes");

  const { data: cls } = await supabase
    .from("classes")
    .select("id, org_id, scheduled_date, training_type_id")
    .eq("id", id)
    .maybeSingle();
  if (!cls || cls.org_id !== profile.org_id) notFound();

  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select("id, employee_id, attended, pass_fail")
    .eq("class_id", id);
  const empIds = [...new Set((enrollments ?? []).map((e) => e.employee_id))];
  const { data: emps } =
    empIds.length > 0
      ? await supabase
          .from("employees")
          .select("id, first_name, last_name, paylocity_id")
          .in("id", empIds)
      : { data: [] as { id: string; first_name: string; last_name: string; paylocity_id: string }[] };
  const empMap = new Map((emps ?? []).map((e) => [e.id, e]));

  const rows: ClassDayAttendanceRow[] = (enrollments ?? []).map((row) => {
    const e = empMap.get(row.employee_id);
    return {
      enrollmentId: row.id,
      employeeLabel: e ? `${e.last_name}, ${e.first_name}` : "Unknown",
      paylocityId: e?.paylocity_id ?? "—",
      attended: row.attended,
      pass_fail: row.pass_fail,
    };
  });

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="px-0 text-[#3b82f6]">
        <Link href="/classes">Back to classes</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Class day</h1>
        <p className="text-sm text-[#8b8fa3]">
          Tablet friendly roster for {cls.scheduled_date}. Enroll staff on the roster builder, then track
          attendance here.
        </p>
      </div>
      <ClassDayAttendanceTable classId={cls.id} rows={rows} />
    </div>
  );
}
