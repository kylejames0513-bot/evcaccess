"use client";

import { useState, useMemo } from "react";

export type PickerEmployee = {
  id: string;
  name: string;
  employee_id: string;
  department: string | null;
};

export function EmployeePicker({
  employees,
  name,
  defaultValue,
  placeholder = "Search by name or ID…",
}: {
  employees: PickerEmployee[];
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(defaultValue ?? "");
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = useMemo(() => {
    if (!query) return employees.slice(0, 20);
    const q = query.toLowerCase();
    return employees
      .filter(e => e.name.toLowerCase().includes(q) || e.employee_id.toLowerCase().includes(q))
      .slice(0, 20);
  }, [query, employees]);

  const selected = employees.find(e => e.id === selectedId);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedId} />
      <input
        type="text"
        value={showDropdown ? query : (selected?.name ?? query)}
        onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-1.5 text-sm"
      />
      {showDropdown && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-[--rule] bg-[--surface] shadow-lg">
          {filtered.map(e => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(e.id);
                  setQuery(e.name);
                  setShowDropdown(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-[--surface-alt] border-b border-[--rule] last:border-0"
              >
                <div className="font-medium">{e.name}</div>
                <div className="text-xs text-[--ink-muted]">{e.employee_id}{e.department ? ` · ${e.department}` : ""}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
