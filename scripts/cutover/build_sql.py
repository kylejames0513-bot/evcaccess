#!/usr/bin/env python3
"""
Build the bulk INSERT SQL statements for cutover Stage 5 from the
JSONL files emitted by extract_xlsx.py. Output goes to
/tmp/evc_cutover/sql/<source>.sql, one big WITH ... INSERT per file.

The SQL uses VALUES + JOIN against employees so the lookup happens
inside Postgres in a single round trip per source.
"""
import json
from pathlib import Path

OUT_SQL_DIR = Path("/tmp/evc_cutover/sql")
OUT_SQL_DIR.mkdir(parents=True, exist_ok=True)
JSONL_DIR = Path("/tmp/evc_cutover")

# Lookup tables fetched once via the MCP earlier. Hand-wired here so
# this script does not need DB access.
TRAINING_TYPES = [
    (1, "CPR/FA", "CPR"),
    (2, "Ukeru", "Ukeru"),
    (3, "Mealtime", "Mealtime"),
    (4, "Med Recert", "MED_TRAIN"),
    (5, "Initial Med Training", "MED_TRAIN"),
    (6, "Post Med", "POST MED"),
    (7, "POMs", "POM"),
    (8, "Person Centered", "Pers Cent Thnk"),
    (9, "Safety Care", "Safety Care"),
    (10, "Meaningful Day", "Meaningful Day"),
    (11, "MD Refresh", "MD refresh"),
    (12, "GERD", "GERD"),
    (13, "HCO Training", "HCO Training"),
    (14, "Health Passport", "Health Passport"),
    (15, "Diabetes", "Diabetes"),
    (16, "Falls", "Falls"),
    (17, "Dysphagia", "Dysphagia Overview"),
    (18, "Rights Training", "Rights Training"),
    (19, "Title VI", "Title VI"),
    (20, "Active Shooter", "Active Shooter"),
    (21, "Skills System", "Skills System"),
    (22, "CPI", "CPI"),
    (23, "CPM", "CPM"),
    (24, "PFH/DIDD", "PFH/DIDD"),
    (25, "Basic VCRM", "Basic VCRM"),
    (26, "Advanced VCRM", "Advanced VCRM"),
    (27, "TRN", "TRN"),
    (28, "ASL", "ASL"),
    (29, "Skills Online", "Skills Online"),
    (30, "ETIS", "ETIS"),
    (31, "Shift", "SHIFT"),
    (32, "Advanced Shift", "ADV SHIFT"),
    (33, "MC", "MC"),
    (34, "First Aid", "FIRSTAID"),
    (35, "Orientation", "ORIENTATION"),
    (36, "Manager Training", "MANAGER"),
    (37, "Job Description", "JOB_DESC"),
    (38, "Relias", "RELIAS"),
    (39, "VR", "VR"),
]

ALIASES = [
    ("adv shift", 32),
    ("advanced vcrm training", 26),
    ("basic vcrm training", 25),
    ("cpr", 1),
    ("dysphagia overview", 17),
    ("dysphagia training", 17),
    ("hco", 13),
    ("Job Desc", 37),
    ("job description review", 37),
    ("management training", 36),
    ("md refresh training", 11),
    ("meaningful day training", 10),
    ("med cert", 4),
    ("med test out", 4),
    ("med training", 5),
    ("New Employee Orientation", 35),
    ("new hire orientation", 35),
    ("onboarding", 35),
    ("pct training", 8),
    ("person centered thinking", 8),
    ("personal outcome measures", 7),
    ("poms training", 7),
    ("shift training", 31),
    ("skills system training", 21),
    ("supervisor training", 36),
]

# Build name + alias + column_key lookup map (lowercased keys -> training_type_id)
TT_LOOKUP = {}
for tid, name, ckey in TRAINING_TYPES:
    TT_LOOKUP[name.lower()] = tid
    TT_LOOKUP[ckey.lower()] = tid
for alias, tid in ALIASES:
    TT_LOOKUP[alias.lower()] = tid

# Source-specific overrides
PAYLOCITY_OVERRIDES = {
    "cpr.fa": 1,
    "cpr": 1,
    "ukeru": 2,
    "med training": 5,
    "post med": 6,
    "pers cent thnk": 8,
    "person centered thinking": 8,
    "mealtime instructions": 3,
    "behavior training": None,  # routes to unknown unless we add an alias
    "active shooter": 20,
    "rights training": 18,
    "cpm": 23,
    "meaningful day": 10,
    "pfh/didd": 24,
    "pom": 7,
    "skills system": 21,
    "shift": 31,
    "title vi": 19,
    "trn": 27,
    "basic vcrm": 25,
    "asl": 28,
    "safety care": 9,
}


def lookup_training_id(raw, source=None):
    if not raw:
        return None
    k = raw.strip().lower()
    if source == "paylocity" and k in PAYLOCITY_OVERRIDES:
        return PAYLOCITY_OVERRIDES[k]
    return TT_LOOKUP.get(k)


def sql_string(s):
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def sql_date(s):
    if s is None:
        return "NULL"
    return f"'{s}'::date"


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


# ────────────────────────────────────────────────────────────
# 5.1 Employees upsert
# ────────────────────────────────────────────────────────────
def build_employees_sql():
    rows = [json.loads(line) for line in (JSONL_DIR / "employees.jsonl").open()]
    parts = []
    for batch in chunks(rows, 200):
        values = []
        for r in batch:
            values.append(
                "("
                + ", ".join(
                    [
                        sql_string(r["last_name"]),
                        sql_string(r["first_name"]),
                        sql_string(r["paylocity_id"]),
                        sql_string(r["job_title"]),
                        sql_string(r["position"]),
                        sql_string(r["department"]),
                        sql_date(r["hire_date"]),
                        "true" if (r.get("status") or "").lower() == "active" else "false",
                    ]
                )
                + ")"
            )
        sql = (
            "WITH source_rows (last_name, first_name, paylocity_id, job_title, position, department, hire_date, is_active) AS (VALUES "
            + ", ".join(values)
            + ")\n"
            "INSERT INTO employees (last_name, first_name, paylocity_id, job_title, position, department, hire_date, is_active, employee_number)\n"
            "SELECT last_name, first_name, paylocity_id, job_title, position, department, hire_date, is_active, paylocity_id FROM source_rows\n"
            "ON CONFLICT ((lower(last_name)), (lower(first_name))) DO UPDATE SET\n"
            "  paylocity_id = COALESCE(EXCLUDED.paylocity_id, employees.paylocity_id),\n"
            "  employee_number = COALESCE(EXCLUDED.employee_number, employees.employee_number),\n"
            "  job_title = COALESCE(EXCLUDED.job_title, employees.job_title),\n"
            "  position = COALESCE(EXCLUDED.position, employees.position),\n"
            "  department = COALESCE(EXCLUDED.department, employees.department),\n"
            "  hire_date = COALESCE(EXCLUDED.hire_date, employees.hire_date),\n"
            "  is_active = EXCLUDED.is_active,\n"
            "  terminated_at = CASE WHEN EXCLUDED.is_active = false AND employees.terminated_at IS NULL THEN now() ELSE employees.terminated_at END,\n"
            "  updated_at = now();"
        )
        parts.append(sql)
    return parts


# ────────────────────────────────────────────────────────────
# 5.2 Access wide -> long completions + excusals
# ────────────────────────────────────────────────────────────
def build_access_sql():
    completions = [json.loads(line) for line in (JSONL_DIR / "access_completions.jsonl").open()]
    excusals = [json.loads(line) for line in (JSONL_DIR / "access_excusals.jsonl").open()]
    parts = []

    # Completions
    for batch in chunks(completions, 500):
        values = []
        for r in batch:
            tid = lookup_training_id(r["column_key"])
            if not tid:
                continue
            values.append(
                "("
                + ", ".join(
                    [
                        sql_string(r["last_name"]),
                        sql_string(r["first_name"]),
                        str(tid),
                        sql_date(r["completion_date"]),
                    ]
                )
                + ")"
            )
        if not values:
            continue
        sql = (
            "WITH source_rows (last_name, first_name, training_type_id, completion_date) AS (VALUES "
            + ", ".join(values)
            + ")\n"
            "INSERT INTO training_records (employee_id, training_type_id, completion_date, source)\n"
            "SELECT e.id, sr.training_type_id, sr.completion_date, 'access'\n"
            "FROM source_rows sr\n"
            "JOIN employees e ON lower(e.last_name) = lower(sr.last_name) AND lower(e.first_name) = lower(sr.first_name)\n"
            "ON CONFLICT (employee_id, training_type_id, completion_date) DO NOTHING;"
        )
        parts.append(sql)

    # Excusals
    for batch in chunks(excusals, 500):
        values = []
        for r in batch:
            tid = lookup_training_id(r["column_key"])
            if not tid:
                continue
            values.append(
                "("
                + ", ".join(
                    [
                        sql_string(r["last_name"]),
                        sql_string(r["first_name"]),
                        str(tid),
                        sql_string(r["reason"]),
                    ]
                )
                + ")"
            )
        if not values:
            continue
        sql = (
            "WITH source_rows (last_name, first_name, training_type_id, reason) AS (VALUES "
            + ", ".join(values)
            + ")\n"
            "INSERT INTO excusals (employee_id, training_type_id, reason, source)\n"
            "SELECT e.id, sr.training_type_id, sr.reason, 'access'\n"
            "FROM source_rows sr\n"
            "JOIN employees e ON lower(e.last_name) = lower(sr.last_name) AND lower(e.first_name) = lower(sr.first_name)\n"
            "ON CONFLICT (employee_id, training_type_id) DO NOTHING;"
        )
        parts.append(sql)
    return parts


# ────────────────────────────────────────────────────────────
# 5.3 Paylocity completions
# ────────────────────────────────────────────────────────────
def build_paylocity_sql():
    rows = [json.loads(line) for line in (JSONL_DIR / "paylocity.jsonl").open()]
    parts = []
    for batch in chunks(rows, 500):
        values = []
        for r in batch:
            tid = lookup_training_id(r["raw_training"], source="paylocity")
            if not tid:
                continue
            values.append(
                "("
                + ", ".join(
                    [
                        sql_string(r["paylocity_id"]),
                        str(tid),
                        sql_date(r["completion_date"]),
                        sql_date(r.get("expiration_date")),
                    ]
                )
                + ")"
            )
        if not values:
            continue
        sql = (
            "WITH source_rows (paylocity_id, training_type_id, completion_date, expiration_date) AS (VALUES "
            + ", ".join(values)
            + ")\n"
            "INSERT INTO training_records (employee_id, training_type_id, completion_date, expiration_date, source)\n"
            "SELECT e.id, sr.training_type_id, sr.completion_date, sr.expiration_date, 'paylocity'\n"
            "FROM source_rows sr\n"
            "JOIN employees e ON e.paylocity_id = sr.paylocity_id\n"
            "ON CONFLICT (employee_id, training_type_id, completion_date) DO NOTHING;"
        )
        parts.append(sql)
    return parts


# ────────────────────────────────────────────────────────────
# 5.4 PHS completions
# ────────────────────────────────────────────────────────────
def parse_last_first(name):
    s = name.strip()
    if "," in s:
        last, first = s.split(",", 1)
        return last.strip(), first.strip().split()[0] if first.strip() else ""
    parts = s.split()
    if len(parts) >= 2:
        return parts[-1], parts[0]
    return None, None


def build_phs_sql():
    rows = [json.loads(line) for line in (JSONL_DIR / "phs.jsonl").open()]
    parts = []
    for batch in chunks(rows, 500):
        values = []
        for r in batch:
            tid = lookup_training_id(r["raw_training"])
            if not tid:
                continue
            last, first = parse_last_first(r["full_name"])
            if not last or not first:
                continue
            values.append(
                "("
                + ", ".join(
                    [
                        sql_string(last),
                        sql_string(first),
                        sql_string(r["full_name"]),
                        str(tid),
                        sql_date(r["completion_date"]),
                        sql_date(r.get("expiration_date")),
                    ]
                )
                + ")"
            )
        if not values:
            continue
        sql = (
            "WITH source_rows (last_name, first_name, full_name, training_type_id, completion_date, expiration_date) AS (VALUES "
            + ", ".join(values)
            + ")\n"
            "INSERT INTO training_records (employee_id, training_type_id, completion_date, expiration_date, source)\n"
            "SELECT e.id, sr.training_type_id, sr.completion_date, sr.expiration_date, 'phs'\n"
            "FROM source_rows sr\n"
            "JOIN employees e ON (\n"
            "  (lower(e.last_name) = lower(sr.last_name) AND lower(e.first_name) = lower(sr.first_name))\n"
            "  OR e.aliases @> ARRAY[sr.full_name]::text[]\n"
            ")\n"
            "ON CONFLICT (employee_id, training_type_id, completion_date) DO NOTHING;"
        )
        parts.append(sql)
    return parts


# ────────────────────────────────────────────────────────────
# 5.5 Sign-in
# ────────────────────────────────────────────────────────────
def build_signin_sql():
    rows = [json.loads(line) for line in (JSONL_DIR / "signin.jsonl").open()]
    parts = []
    for batch in chunks(rows, 500):
        values = []
        for r in batch:
            tid = lookup_training_id(r["raw_training"])
            if not tid:
                continue
            last, first = parse_last_first(r["attendee_name"])
            if not last or not first:
                continue
            values.append(
                "("
                + ", ".join(
                    [
                        sql_string(last),
                        sql_string(first),
                        sql_string(r["attendee_name"]),
                        str(tid),
                        sql_date(r["completion_date"]),
                        sql_string(r.get("pass_fail")),
                        sql_string(r.get("reviewed_by")),
                    ]
                )
                + ")"
            )
        if not values:
            continue
        sql = (
            "WITH source_rows (last_name, first_name, full_name, training_type_id, completion_date, pass_fail, reviewed_by) AS (VALUES "
            + ", ".join(values)
            + ")\n"
            "INSERT INTO training_records (employee_id, training_type_id, completion_date, source, pass_fail, reviewed_by)\n"
            "SELECT e.id, sr.training_type_id, sr.completion_date, 'signin', sr.pass_fail, sr.reviewed_by\n"
            "FROM source_rows sr\n"
            "JOIN employees e ON (\n"
            "  (lower(e.last_name) = lower(sr.last_name) AND lower(e.first_name) = lower(sr.first_name))\n"
            "  OR e.aliases @> ARRAY[sr.full_name]::text[]\n"
            ")\n"
            "ON CONFLICT (employee_id, training_type_id, completion_date) DO NOTHING;"
        )
        parts.append(sql)
    return parts


def write_parts(name, parts):
    for i, sql in enumerate(parts, start=1):
        out = OUT_SQL_DIR / f"{name}_{i:02d}.sql"
        out.write_text(sql)
        print(f"  wrote {out} ({len(sql)} bytes)")


def main():
    print("5.1 employees")
    write_parts("01_employees", build_employees_sql())
    print("5.2 access")
    write_parts("02_access", build_access_sql())
    print("5.3 paylocity")
    write_parts("03_paylocity", build_paylocity_sql())
    print("5.4 phs")
    write_parts("04_phs", build_phs_sql())
    print("5.5 signin")
    write_parts("05_signin", build_signin_sql())


if __name__ == "__main__":
    main()
