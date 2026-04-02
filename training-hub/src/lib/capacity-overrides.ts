import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

// Store capacity overrides in a local JSON file.
// Key = training name (canonical), value = capacity number.
const OVERRIDES_FILE = path.join(process.cwd(), "capacity-overrides.json");

// Build alias lookup: any name/alias/columnKey → canonical training name
const canonicalMap = new Map<string, string>();
for (const def of TRAINING_DEFINITIONS) {
  canonicalMap.set(def.name.toLowerCase(), def.name);
  canonicalMap.set(def.columnKey.toLowerCase(), def.name);
  if (def.aliases) {
    for (const alias of def.aliases) {
      canonicalMap.set(alias.toLowerCase(), def.name);
    }
  }
}
// Common variations
canonicalMap.set("med training", "Med Recert");
canonicalMap.set("van lyft training", "Van/Lift Training");
canonicalMap.set("van lyft", "Van/Lift Training");
canonicalMap.set("van/lift", "Van/Lift Training");

function toCanonical(name: string): string {
  return canonicalMap.get(name.toLowerCase()) || name;
}

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
  // Check exact name first, then canonical name
  if (overrides[trainingName] !== undefined) return overrides[trainingName];
  const canonical = toCanonical(trainingName);
  if (overrides[canonical] !== undefined) return overrides[canonical];
  return defaultCapacity;
}
