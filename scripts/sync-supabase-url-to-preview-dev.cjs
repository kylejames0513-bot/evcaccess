/**
 * Copies SUPABASE_URL and SUPABASE_ANON_KEY from a pulled Production .env file
 * into Vercel Development and Preview (all Preview deployments — no git branch arg).
 *
 *   npx vercel env pull .env.vercel.prod.tmp --environment=production --yes
 *   node scripts/sync-supabase-url-to-preview-dev.cjs .env.vercel.prod.tmp
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const file = path.resolve(process.argv[2] || ".env.vercel.prod.tmp");

if (!fs.existsSync(file)) {
  console.error("Missing env file:", file);
  process.exit(1);
}

const raw = fs.readFileSync(file, "utf8");
/** @type {Record<string, string>} */
const vars = {};
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  vars[k] = v;
}

const keys = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];
const root = path.resolve(__dirname, "..");

/**
 * @param {string} name
 * @param {string} target production | preview | development
 * @param {string | null} previewBranch pass null for "all Preview branches" (omit 3rd CLI arg)
 * @param {string} value
 */
function addVar(name, target, previewBranch, value) {
  if (!value) {
    console.error("Skipping empty:", name);
    process.exit(1);
  }
  const args = ["vercel", "env", "add", name, target];
  if (previewBranch) args.push(previewBranch);
  args.push("--value", value, "--yes", "--force");
  const r = spawnSync("npx", args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    console.error("Failed:", name, target, previewBranch || "(all preview)");
    process.exit(r.status ?? 1);
  }
  console.log("OK", name, "->", target, previewBranch || "(all preview)");
}

for (const k of keys) {
  const v = vars[k];
  if (!v) {
    console.error("Key not in pulled file:", k);
    process.exit(1);
  }
  addVar(k, "development", null, v);
  addVar(k, "preview", null, v);
}

console.log("Done. Delete the temp env file when finished.");
