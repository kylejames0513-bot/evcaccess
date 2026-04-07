import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

// Store excluded employees in a JSON file alongside the app.
// This persists across restarts and doesn't touch the spreadsheet.
const EXCLUDE_FILE = path.join(process.cwd(), "excluded-employees.json");

export function getExcludedEmployees(): string[] {
  if (!existsSync(EXCLUDE_FILE)) return [];
  try {
    const data = readFileSync(EXCLUDE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function setExcludedEmployees(names: string[]): void {
  writeFileSync(EXCLUDE_FILE, JSON.stringify(names, null, 2));
}

export function addExcludedEmployee(name: string): string[] {
  const list = getExcludedEmployees();
  const normalized = name.trim();
  if (!list.some((n) => n.toLowerCase() === normalized.toLowerCase())) {
    list.push(normalized);
    setExcludedEmployees(list);
  }
  return list;
}

export function removeExcludedEmployee(name: string): string[] {
  let list = getExcludedEmployees();
  list = list.filter((n) => n.toLowerCase() !== name.trim().toLowerCase());
  setExcludedEmployees(list);
  return list;
}

export function isExcluded(name: string): boolean {
  const list = getExcludedEmployees();
  return list.some((n) => n.toLowerCase() === name.trim().toLowerCase());
}
