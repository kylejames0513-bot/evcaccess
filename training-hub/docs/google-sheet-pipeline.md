# Merged Google Sheet → Training Hub (Supabase)

The hub already ingests **Paylocity**, **PHS**, **Access export**, and **sign-in** shapes through **`POST /api/imports`** with **preview → commit** (same UI as [`/imports`](../src/app/imports/page.tsx)). The merged Google Sheet should **feed that pipeline**, not duplicate business rules in Sheets.

## Recommended architecture

1. **Normalize in the sheet (preferred)**  
   Use one tab per upstream source (or one canonical tab) whose **headers match** what the hub expects. See [Column checklist](#column-checklist) below.

2. **Or normalize in Apps Script**  
   If tabs cannot be renamed, a bounded script reads your merged layout, builds row objects with the expected column names, and `POST`s JSON to `/api/imports` with the correct `source`.

3. **Human gate**  
   Automated jobs should create **previews** only; HR uses the existing Imports page to **commit** (or discard), matching today’s compliance posture.

## Security (allowlist-first)

- **Do not** embed the Supabase service role or anon key in Apps Script for arbitrary writes.
- Prefer **session-based** pushes only if a human runs the script while logged into the hub (cookies are brittle in Apps Script).
- For unattended pushes, add a **dedicated server route** later (e.g. `POST /api/imports/google-webhook`) that validates a **single long-lived secret** header and only accepts `source` from an allowlist—**not** implemented in this doc; use manual export → upload until then.

Practical default: **Time-based reminder** + HR runs **File → Download CSV** from Google Sheets and uploads on `/imports` (zero secrets in Google).

## Column checklist (browser upload validation)

The imports UI runs a minimal header check per `source` (see `requiredHeadersFor` in [`src/app/imports/page.tsx`](../src/app/imports/page.tsx)). Resolver expectations live under [`src/lib/resolver/`](../src/lib/resolver/).

| Source | Required / notes |
|--------|-------------------|
| `paylocity` | At minimum columns **`Last Name`**, **`First Name`** (exact header text). Additional columns are resolved by the Paylocity parser. |
| `phs` | **`Employee Last Name`**, **`Employee First Name`**. |
| `access` | **`Last Name`**, **`First Name`**. |
| `signin` | Titled or camelCase variants of attendee / session / date columns (see imports page normalization for `signin`). |

If your merged tab uses different labels, **add a row in Apps Script** that rewrites headers before `POST`, or add a **new `source`** in the hub with a dedicated parser (code change).

## Example: Apps Script outline (optional)

See [`docs/examples/merged-sheet-apps-script.gs`](examples/merged-sheet-apps-script.gs) for a **commented stub** that:

- Reads a fixed tab,
- Maps columns to Paylocity-shaped objects,
- Posts to a **placeholder URL** with `UrlFetchApp` (you must swap in your hub origin and auth strategy).

**Reminder:** Apps Script cannot safely complete the “commit” step without either a logged-in user or a purpose-built server secret—keep commits in the hub UI unless you implement a reviewed webhook.

## Operational links

- **One-stop entry:** [`/operations`](../src/app/operations/page.tsx) (Today / Operations).
- **Excel sync contract:** [`docs/sync-contract.md`](sync-contract.md).
