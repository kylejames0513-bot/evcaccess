import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

// Store capacity overrides in a local JSON file.
// Key = training name, value = capacity number.
const OVERRIDES_FILE = path.join(process.cwd(), "capacity-overrides.json");

export function getCapacityOverrides(): Record<string, number> {
  if (!existsSync(OVERRIDES_FILE)) return {};
  try {
    const data = readFileSync(OVERRIDES_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function setCapacity(trainingName: string, capacity: number): Record<string, number> {
  const overrides = getCapacityOverrides();
  overrides[trainingName] = capacity;
  writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2));
  return overrides;
}

export function getCapacity(trainingName: string, defaultCapacity: number): number {
  const overrides = getCapacityOverrides();
  return overrides[trainingName] ?? defaultCapacity;
}
