"use client";

import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type EmployeeRow = {
  id: string;
  paylocity_id: string;
  first_name: string;
  last_name: string;
  position: string;
  location: string;
  hire_date: string;
  status: string;
};

const statusColor: Record<string, string> = {
  active: "bg-[#22c55e]/15 text-[#22c55e]",
  on_leave: "bg-[#f59e0b]/15 text-[#f59e0b]",
  terminated: "bg-[#5c6078]/20 text-[#8b8fa3]",
};

export function EmployeesTable({ rows }: { rows: EmployeeRow[] }) {
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo<ColumnDef<EmployeeRow>[]>(
    () => [
      {
        accessorKey: "paylocity_id",
        header: "Paylocity ID",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-[#e8eaed]">{String(getValue())}</span>
        ),
      },
      {
        id: "name",
        header: "Name",
        accessorFn: (r) => `${r.last_name}, ${r.first_name}`,
      },
      { accessorKey: "position", header: "Position" },
      { accessorKey: "location", header: "Location" },
      { accessorKey: "hire_date", header: "Hire date" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => {
          const s = String(getValue());
          return (
            <Badge variant="secondary" className={statusColor[s] ?? ""}>
              {s.replace("_", " ")}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="sm" className="text-[#3b82f6]">
            <Link href={`/employees/${row.original.id}`}>View</Link>
          </Button>
        ),
      },
    ],
    []
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns unstable function refs by design
  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filter) => {
      const q = String(filter).toLowerCase();
      if (!q) return true;
      const r = row.original;
      return (
        r.paylocity_id.toLowerCase().includes(q) ||
        r.first_name.toLowerCase().includes(q) ||
        r.last_name.toLowerCase().includes(q)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search by name or ID"
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="max-w-sm border-[#2a2e3d] bg-[#1a1d27]"
      />
      <div className="overflow-hidden rounded-xl border border-[#2a2e3d] bg-[#1e2230]">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-[#2a2e3d] hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="text-[#8b8fa3]">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="border-[#2a2e3d]">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-[#e8eaed]">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-[#8b8fa3]">
                  No employees yet. Add your roster or run an import.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="border-[#2a2e3d]"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-[#2a2e3d]"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
