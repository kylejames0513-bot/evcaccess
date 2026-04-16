"use client";

import { useFormStatus } from "react-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateClassEnrollmentAttendanceAction } from "@/app/actions/class-enrollment";

export type ClassDayAttendanceRow = {
  enrollmentId: string;
  employeeLabel: string;
  paylocityId: string;
  attended: boolean | null;
  pass_fail: "pass" | "fail" | "no_show" | null;
};

function RowFormWithStatus(props: { classId: string; row: ClassDayAttendanceRow }) {
  return (
    <form
      action={updateClassEnrollmentAttendanceAction}
      className="flex flex-wrap items-center gap-2"
      key={`${props.row.enrollmentId}-${String(props.row.attended)}-${props.row.pass_fail ?? "null"}`}
    >
      <RowFields {...props} />
    </form>
  );
}

function RowFields({ classId, row }: { classId: string; row: ClassDayAttendanceRow }) {
  const { pending } = useFormStatus();
  const defaultAttended =
    row.attended === null ? "unset" : row.attended ? "yes" : "no";
  const defaultPass = row.pass_fail ?? "unset";

  return (
    <>
      <input type="hidden" name="enrollment_id" value={row.enrollmentId} />
      <input type="hidden" name="class_id" value={classId} />
      <select
        name="attended"
        defaultValue={defaultAttended}
        disabled={pending}
        className="min-w-[5.5rem] flex-1 rounded-md border border-[#2a2e3d] bg-[#0f1117] px-2 py-1 text-sm text-[#e8eaed]"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="unset">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      <select
        name="pass_fail"
        defaultValue={defaultPass}
        disabled={pending}
        className="min-w-[6.5rem] flex-1 rounded-md border border-[#2a2e3d] bg-[#0f1117] px-2 py-1 text-sm text-[#e8eaed]"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="unset">—</option>
        <option value="pass">Pass</option>
        <option value="fail">Fail</option>
        <option value="no_show">No show</option>
      </select>
    </>
  );
}

export function ClassDayAttendanceTable({
  classId,
  rows,
}: {
  classId: string;
  rows: ClassDayAttendanceRow[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#2a2e3d]">
      <Table>
        <TableHeader>
          <TableRow className="border-[#2a2e3d] hover:bg-transparent">
            <TableHead className="text-[#8b8fa3]">Employee</TableHead>
            <TableHead className="text-[#8b8fa3]">Paylocity ID</TableHead>
            <TableHead className="text-[#8b8fa3]" colSpan={2}>
              Attendance
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.enrollmentId} className="border-[#2a2e3d]">
                <TableCell className="text-[#e8eaed]">{row.employeeLabel}</TableCell>
                <TableCell className="font-mono text-xs text-[#8b8fa3]">
                  {row.paylocityId}
                </TableCell>
                <TableCell colSpan={2} className="text-[#8b8fa3]">
                  <RowFormWithStatus classId={classId} row={row} />
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-28 text-center text-[#8b8fa3]">
                No enrollments yet. Add people from the roster builder for this class.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
