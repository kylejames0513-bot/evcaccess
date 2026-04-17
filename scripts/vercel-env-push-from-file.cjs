/**
 * Push allowlisted Supabase-related env vars from a local dotenv file into Vercel
 * for production, preview, and development.
 *
 *   npx vercel link   # once, from repo root
 *   # Fill supabase-vercel.env from Supabase Dashboard → Settings → API (same project for URL + keys)
 *   node scripts/vercel-env-push-from-file.cjs supabase-vercel.env
 *
 * Or after: npx vercel env pull .env.vercel.prod.tmp --environment=production --yes
 *   node scripts/vercel-env-push-from-file.cjs .env.vercel.prod.tmp
 *
 *   node scripts/vercel-env-push-from-file.cjs .env.patch.tmp --secrets-only
 *   (updates only keys present in the file; no URL/anon required)
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

/** Only these names are ever sent to Vercel (allowlist). */
const ALLOW = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GENERAL_HR_PASSWORD",
]);

const SENSITIVE = new Set([
  "SUPABASE_SERVICE_ROLE_KEY",
  "GENERAL_HR_PASSWORD",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_JWT_SECRET",
]);

const TARGETS = ["production", "preview", "development"];

/** @returns {Array<[string, string]>} preserve file order, last duplicate key wins */
function parseDotenv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    if (!ALLOW.has(k)) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v) map.set(k, v);
  }
  return [...map.entries()];
}

function runVercelEnvAdd(key, target, value, sensitive) {
  // Prefer argv --value: Vercel's NEXT_PUBLIC_ stdin confirmation is flaky; JWTs/passwords without shell metachars are safe.
  const safeForArg = /^[\w.\-~=+/@]+$/u.test(value) && !value.includes("\n") && !value.includes("\r");
  const useStdin =
    !safeForArg ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes('"') ||
    value.includes("&") ||
    value.includes("|") ||
    value.includes("<") ||
    value.includes(">");

  const args = ["vercel", "env", "add", key, target];
  if (sensitive) args.push("--sensitive");
  if (!useStdin) args.push("--value", value);
  args.push("--force", "--yes");

  let input;
  if (useStdin) {
    input = `${value}\n`;
    if (key.startsWith("NEXT_PUBLIC_")) input += "y\n";
  }

  const r = spawnSync("npx", args, {
    cwd: path.resolve(__dirname, ".."),
    stdio: useStdin ? ["pipe", "pipe", "pipe"] : "inherit",
    shell: true,
    env: { ...process.env, CI: "1", VERCEL_NONINTERACTIVE: "1" },
    ...(input ? { input } : {}),
  });
  if (r.status !== 0) {
    const err = r.stderr?.toString() || r.stdout?.toString() || "";
    console.error(`Failed: vercel env add ${key} ${target}`);
    if (err.trim()) console.error(err.trim());
    process.exit(r.status ?? 1);
  }
}

function main() {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const secretsOnly = process.argv.includes("--secrets-only");
  const file = path.resolve(argv[0] || "supabase-vercel.env");
  if (!fs.existsSync(file)) {
    console.error(`Missing file: ${file}`);
    console.error(
      "Create it with keys from Supabase → Project Settings → API (Project URL, anon or publishable key, service_role).\n" +
        "See supabase-vercel.env.example in the repo."
    );
    process.exit(1);
  }

  const pairs = parseDotenv(file);
  const get = (name) => pairs.find(([k]) => k === name)?.[1] ?? "";
  const requiredClient = get("NEXT_PUBLIC_SUPABASE_URL") || get("SUPABASE_URL");
  const requiredAnon =
    get("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
    get("SUPABASE_ANON_KEY") ||
    get("SUPABASE_PUBLISHABLE_KEY");

  if (!secretsOnly && (!requiredClient || !requiredAnon)) {
    console.error(
      "Need at least project URL and anon/publishable key, e.g.:\n" +
        "  NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY\n" +
        "or SUPABASE_URL + SUPABASE_ANON_KEY / *_PUBLISHABLE_KEY\n" +
        "Or pass --secrets-only to push only keys that appear in the file."
    );
    process.exit(1);
  }

  if (pairs.length === 0) {
    console.error("No allowlisted keys found in file.");
    process.exit(1);
  }

  const ORDER = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GENERAL_HR_PASSWORD",
  ];
  pairs.sort(
    (a, b) => (ORDER.indexOf(a[0]) === -1 ? 999 : ORDER.indexOf(a[0])) - (ORDER.indexOf(b[0]) === -1 ? 999 : ORDER.indexOf(b[0]))
  );

  console.log(`Pushing ${pairs.length} variable(s) × ${TARGETS.length} targets from ${file}…`);
  console.log("Keys:", pairs.map(([k]) => k).join(", "));
  for (const target of TARGETS) {
    for (const [key, value] of pairs) {
      const sens = SENSITIVE.has(key);
      runVercelEnvAdd(key, target, value, sens);
    }
  }
  console.log("Done. Run: npx vercel env ls");
}

main();
