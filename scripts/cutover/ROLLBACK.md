# Cutover rollback playbook

Companion to `docs/PLAN.md` §4.9 "Rollback boundaries". This document
is the step-by-step version of what to actually run if a cutover stage
goes sideways and you need to walk back.

**Read this before starting any cutover stage.** The fastest rollback
is one you have rehearsed. If you're panicking, stop, take a snapshot,
then come back to this file.

---

## Golden rule

> **Every hard rollback starts with the Supabase Point-in-Time-Recovery
> (PITR) snapshot you took before the stage.**

If you did not take a snapshot before the stage, rollback is best-effort
and may lose data. Always snapshot first. The Supabase dashboard makes
this one click:

1. https://supabase.com/dashboard/project/xkfvipcxnzwyskknkmpj/database/backups
2. **Scheduled backups** → note the most recent successful backup
   timestamp before starting work, OR
3. **Point-in-time recovery** → you can restore to any second within
   your retention window (7 days on the Pro plan).

Label every manual restore in your change log with the stage name so
the audit trail is readable.

---

## Stage-by-stage rollback

### Stage 1 — schema migrations

**Risk surface**: new tables, new columns, new RPCs, new views.
**Reversibility**: clean. Every new table uses `CREATE TABLE IF NOT
EXISTS`; every column add uses `ADD COLUMN IF NOT EXISTS`. The only
drop in Stage 1 is from `20260410032934_drop_unused_legacy_tables.sql`
(archived_sessions, training_schedules, removal_log, notifications,
training_rules), which **does** destroy data.

**Hard rollback**:

```bash
# 1. Restore from the PITR snapshot you took before applying Stage 1.
#    Use the Supabase dashboard → Database → Backups → "Restore to this point".
#    Pick the timestamp from just before your first `supabase db push`.

# 2. After restore, verify the drop was undone:
#    (run in Supabase SQL editor)
SELECT tablename FROM pg_tables
WHERE schemaname='public' AND tablename IN (
  'archived_sessions','training_schedules','removal_log',
  'notifications','training_rules'
);
# Expect 5 rows if the restore worked.
```

**Soft rollback** (no snapshot, best-effort):

```sql
-- Drop the Stage 1 additions in reverse dependency order.
DROP VIEW IF EXISTS master_completions;
DROP VIEW IF EXISTS employee_history;
-- employee_compliance was recreated, not dropped — leave it.

DROP TABLE IF EXISTS unknown_trainings;
DROP TABLE IF EXISTS unresolved_people;
DROP TABLE IF EXISTS imports;
DROP TABLE IF EXISTS required_trainings;

-- You CANNOT restore the 5 dropped legacy tables without a snapshot.
-- If you need them back and you don't have PITR, stop and call Supabase
-- support.
```

---

### Stage 2 — clean up junk excusals

**Risk surface**: `DELETE FROM excusals WHERE source='merged_sheet'`
removes ~11 400 rows. These are Apps Script noise but technically
recoverable.

**Hard rollback**:

```bash
# 1. Restore from the PITR snapshot from before Stage 2.
# 2. Verify count returns to ~11 400 again:
SELECT source, count(*) FROM excusals GROUP BY source ORDER BY count DESC;
```

**Soft rollback**: not possible. Those rows only existed as Apps Script
write artifacts; if you didn't snapshot, they're gone. That's fine for
cutover purposes — the whole reason Stage 2 exists is that they were
garbage — but if Kyle later wants to trace an old excusal decision,
you'll need the snapshot.

---

### Stage 3 — seed `required_trainings`

**Risk surface**: bulk insert into `required_trainings`. Does not
touch existing data.

**Hard rollback**: delete all rows.

```sql
DELETE FROM required_trainings;
```

Safe because the compliance view falls back to "nothing is required"
when the table is empty. Dashboard goes blank but no existing data is
lost. Then:

```sql
-- Re-run the seed migration to try again.
-- File: 20260410031933_seed_required_trainings.sql
```

---

### Stage 4 — backfill aliases

**Risk surface**: inserts into `training_aliases` and employee
aliases.

**Hard rollback**: delete the backfilled rows by source.

```sql
-- Training aliases added by the backfill migrations
DELETE FROM training_aliases WHERE source IN ('access','paylocity','phs');
-- (manual aliases added via the review UI use source='manual' and stay)

-- Employee aliases came from two migrations:
-- 20260410032011_backfill_aliases_from_name_map.sql
-- 20260410032315_backfill_aliases_from_quoted_first_names_v2.sql
-- Neither is easily reversible without a snapshot because they merged
-- into the employees row. Restore from snapshot if Kyle needs the
-- original first_name values back.
```

Safe because aliases are additive — they only broaden match surface.
Deleting them makes future imports match less aggressively, which is
the pre-Stage-4 state.

---

### Stage 5 — historical ingest via the new resolver

**Risk surface**: bulk insert of ~11 000 training_records across
sources. Some inserts into `unresolved_people` and `unknown_trainings`.

**Reversibility**: clean per PLAN.md §4.9 because the unique index
`(employee_id, training_type_id, completion_date)` makes the load
idempotent. You can re-run it without dup risk.

**Hard rollback**:

```bash
# 1. Restore from PITR snapshot before Stage 5.
# 2. Verify counts:
SELECT source, count(*) FROM training_records GROUP BY source ORDER BY count DESC;
#    Expect pre-Stage-5 numbers (mostly 'merged_sheet' + whatever Stage 4 added).
```

**Soft rollback** (by source):

```sql
-- Drop records by source tag. Safe because nothing else references them.
DELETE FROM training_records WHERE source IN ('access','paylocity','phs','signin')
  AND created_at >= '<stage-5-start-timestamp>';
DELETE FROM excusals WHERE source IN ('access','paylocity','phs')
  AND created_at >= '<stage-5-start-timestamp>';
DELETE FROM unresolved_people WHERE created_at >= '<stage-5-start-timestamp>';
DELETE FROM unknown_trainings WHERE created_at >= '<stage-5-start-timestamp>';
```

Replace `<stage-5-start-timestamp>` with the exact time you began the
Stage 5 load (from the Supabase audit log or your notes).

After rollback, re-run the SQL in `scripts/cutover/sql/` in order.

---

### Stage 6 — switchover

**Risk surface**: Vercel env vars flipped, UI now points at Supabase.
Apps Script triggers paused. HR starts using the new hub.

**PLAN.md §4.9 says this is the stage that is "not easily rollbackable"**
because HR is making live writes to the new system. Every minute past
the cutover, the pre-cutover snapshot becomes more stale.

**Hard rollback** (within 1 hour of cutover, minimal HR activity):

```bash
# 1. Take a NEW snapshot of the current state — you'll want to audit
#    whatever HR did between cutover and rollback.
# 2. Restore from the pre-Stage-6 snapshot.
# 3. Flip Vercel env vars back:
#      NEXT_PUBLIC_HUB_MODE=legacy   (or whatever you set in Stage 1)
# 4. Re-enable the Apps Script hourly sync triggers.
# 5. Tell HR: "We're back on sheets for now. Any changes you made in
#    the last X minutes — email them to me and I will replay them."
```

**Hard rollback** (more than 1 hour after cutover):

Do not restore blindly. You will lose HR's work. Instead:

1. Freeze writes in the new hub (set `HR_PASSWORD` to something only
   you know, or just take Vercel offline).
2. Export the new rows created since cutover from each table:
   `training_records`, `excusals`, `employees`, `imports`.
3. Decide per-row which to keep, which to discard.
4. Restore from snapshot and replay the keepers manually.

This is slow and painful, which is why Stage 6 has the strongest
"don't cross this line until Stage 5 is fully verified" warning in
PLAN.md. Rehearse Stage 5 twice. Verify the compliance view numbers
match the spreadsheet exactly. Only then cross Stage 6.

---

### Stage 7 — tear-down

**Risk surface**: deletes legacy lib files, legacy routes, legacy
Apps Script references. Does not touch the database.

**Rollback**:

```bash
# 1. git revert <commit-sha-of-stage-7-cleanup>
# 2. Push to the branch.
# 3. Vercel redeploys with the legacy files restored.
# 4. If you also flipped Apps Script triggers back on, the legacy
#    pipeline works again immediately — the .gs files in this repo
#    were never deleted from the actual Google Sheet.
```

Stage 7 is the easiest to roll back because it's all in git.

---

## Ad-hoc rollback utilities

### Delete a bad preview import

```sql
-- Use the UI if possible: /imports → find the row → Discard.
-- Manual version:
DELETE FROM imports WHERE id = '<import_uuid>' AND status = 'preview';
-- commit_import RPC will have inserted rows already if the import was
-- committed — this DELETE does NOT undo those. To undo a committed
-- import, find and delete from training_records + excusals + unknown_trainings + unresolved_people
-- where created_at is within the commit window.
```

### Undo a single resolution in the review queue

```sql
-- Unmark resolved on unresolved_people
UPDATE unresolved_people
  SET resolved_at = NULL, resolved_by = NULL, resolved_to_employee_id = NULL
  WHERE id = '<row_uuid>';

-- Delete the alias that the resolve created (if one was added)
-- Aliases created by the resolver have source matching the original row
-- and are easy to identify by the normalized form they added.
DELETE FROM employee_aliases
  WHERE employee_id = '<resolved_employee_id>'
    AND alias = '<original_full_name>';
```

### Walk back the RLS + SECURITY DEFINER view migrations

```sql
-- Only needed if the RLS migration accidentally breaks something (it
-- shouldn't, because every API route uses service_role).
ALTER TABLE employees          DISABLE ROW LEVEL SECURITY;
ALTER TABLE training_records   DISABLE ROW LEVEL SECURITY;
-- ... repeat for the 14 tables in 20260412120100_rls_defense_in_depth.sql

-- Optional: restore the SECURITY DEFINER behavior on views:
ALTER VIEW employee_compliance SET (security_invoker = off);
ALTER VIEW master_completions   SET (security_invoker = off);
ALTER VIEW employee_history     SET (security_invoker = off);
```

---

## What you should always log during rollback

Start a scratch doc (even a plain text file) and capture:

- **Time you started the rollback** (UTC)
- **Stage being rolled back**
- **Reason for rollback** (one sentence)
- **Snapshot timestamp used** (if hard rollback)
- **Verification queries run** and their output
- **Which users were told and when**

This turns a fire drill into an incident report and lets you answer
"what exactly did we undo?" a week later.
