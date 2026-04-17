# Kiosk → Google Sheets → Supabase

How to wire the hub's public kiosk (`/signin/[org_slug]`) so each sign-in writes to your **Training Records** log **and** to the **Training** matrix that the nightly cron ingests.

## What the flow looks like

1. **Kiosk submit** — staff types their name + picks a training on `/signin/<org_slug>` and hits Submit. The form POSTs to an Apps Script web app URL.
2. **Apps Script `doPost`** appends the row to the `Training Records` log tab and, if the session maps to a matrix column, writes the date into the matched employee's row on the `Training` tab.
3. **Nightly cron** (`/api/ingest/sheets`) reads the `Training` tab CSV and upserts the date into Supabase as a training `completion`.
4. **Hub** shows the completion in the compliance matrix, attendance log, and new-hire cards.

## One-time setup

### 1. Drop the script into your Apps Script project

You have two ways to deploy the Apps Script:

**A. Bound to the spreadsheet (simplest).** Open `EVC_Attendance_Tracker` in Google Sheets → **Extensions → Apps Script**. In the editor that opens:

- If the project already has files (the old kiosk handler), **keep them**. Create a new file called `KioskWebhook.gs` and paste the contents of [`Google Sheets/KioskWebhook.gs.txt`](./KioskWebhook.gs.txt) into it. The new handler replaces `doPost` — if the existing project also defines `doPost`, rename the old one to something else (e.g. `doPost_legacy`) so Apps Script uses the new one.
- If the project is empty, create a single file named `KioskWebhook.gs` and paste the contents in.

**B. Standalone script (if you can't bind to the sheet).** At [script.google.com](https://script.google.com) → **New project**. Paste the contents of `KioskWebhook.gs.txt` into `Code.gs`, then use `SpreadsheetApp.openById(SPREADSHEET_ID)` instead of `getActiveSpreadsheet()`. Ping me if you need this — it's a two-line patch.

### 2. Deploy as a Web App

In the Apps Script editor:

- **Deploy → New deployment** (or **Manage deployments → Edit** if you're updating an existing kiosk deploy).
- Select type: **Web app**.
- **Description:** "Hub kiosk webhook" (any label).
- **Execute as:** Me.
- **Who has access:** Anyone.
- Click **Deploy**.
- Copy the URL — it looks like `https://script.google.com/macros/s/AKfyc...XYZ/exec`.

### 3. Point the hub at the new URL

In [Vercel → evcaccess → Settings → Environment Variables](https://vercel.com/kylejames0513-bots-projects/evcaccess/settings/environment-variables), add (or update):

```
Name:   NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL
Value:  <the /exec URL from step 2>
Scope:  Production, Preview, Development
```

Redeploy so the new env var takes effect (any push, or **Deployments → ⋯ → Redeploy** on the latest prod deploy).

### 4. Confirm the Training sheet has the columns this script expects

The kiosk sessions map to these header names on the `Training` tab:

| Kiosk session | Training-sheet column(s) |
|---|---|
| CPR | `CPR` and `FIRSTAID` |
| Ukeru | `Ukeru` |
| Initial Med Training (4 Days) | `MED_TRAIN` |
| Post Med | `POST MED` |
| POMs Training | `POM` |
| Mealtime | `Mealtime` |
| Person Centered Thinking | `Pers Cent Thnk` |
| Van Lyft Training | `VR` |

Log-only (will appear in Training Records but not on the matrix):

- **New Employee Orientation**
- **Rising Leaders**

If you want either of these tracked on the matrix too, add a column to the `Training` tab and add a mapping entry to the top of `KioskWebhook.gs`:

```js
var SESSION_TO_COLUMN = {
  // ...
  "New Employee Orientation": ["Orientation"],
  "Rising Leaders": ["Rising Leaders"]
};
```

### 5. Smoke test

From the Apps Script editor, open `KioskWebhook.gs` and run `testDoPost_` (dropdown at the top of the editor → `testDoPost_` → ▶). Authorize if Apps Script asks. Then:

1. Check the `Training Records` tab — a new row should appear with "Jane Doe", today's date, and "Test from testDoPost_" in Notes.
2. Check the `Training` tab — if a `Jane Doe` row already exists, the `CPR` and `FIRSTAID` columns for her row should now hold today's date. (If she doesn't exist on the matrix, the log row is still saved and the matrix write is quietly skipped — this is expected.)

Then hit the real kiosk at `https://<your-vercel-url>/signin/<org_slug>` and submit a test entry.

### 6. Wire into the hub's ingestion

Nothing to change on the Supabase side — the existing nightly cron already reads the Training tab CSV, and the hub's compliance matrix picks up the dates within 24 hours.

To pull immediately instead of waiting: **Dashboard → Ingestion Console → `npm run ingest:refresh`** in your terminal, or let the Vercel cron fire overnight.

## What the script does, in short

- Accepts the six POST fields the hub kiosk sends: `session`, `attendee`, `date`, `leftEarly`, `reason`, `notes`.
- **Always** appends a row to `Training Records` — no row is ever dropped on the floor. Creates the tab with a header row the first time you run it.
- Writes a **UUID** into column 11 (`Row ID`) so the hub's Sign-in Review tab can target individual rows later.
- **Best-effort** writes the date into the mapped columns on the `Training` matrix — only if the session is in `SESSION_TO_COLUMN` **and** an employee row matches the typed name (exact → prefix → nickname).
- Returns a tiny HTML page that posts `submission_success` / `submission_error` back to the kiosk window, matching the handshake the kiosk JS expects.

### Name matching is now tolerant of

- **Apostrophes and hyphens** — `O'Brien` / `OBrien` / `O\u2019Brien` all match; `Smith-Jones` / `SmithJones` all match. Same for periods (`A. J.` / `A J`).
- **Quoted nicknames inside a cell** — if the attendee or the Training row has `Michael "Mike"` or `Michael (Mickey)`, the matcher tries both forms.
- **The employee's Aliases column on the Merged sheet** — see below.
- **Compound last names** — `Mary Smith Jones` now picks the full last name as a unit, not just the final token.

### Merged sheet: optional Aliases column

If your **Employee** tab (the merged roster that feeds the sync) has an **Aliases** column — also accepted as `Alias` or `Known Aliases` — list each person's nicknames separated by `;` or `,`. The SupabaseSync script now pulls these through so both the hub's resolver AND the kiosk matcher will treat them as hits.

Example row:

| ID | Last Name | First Name | Preferred Name | Aliases |
|---|---|---|---|---|
| AB04 | Thompson | Mary | Cindy | Cyndi; Thumper |

The sync will register Mary, Cindy, Cyndi, and Thumper Thompson all as aliases resolving to the same employee.

### JSON actions used by the hub's Sign-in Review tab

- `GET ?action=listPendingSignIns` → JSON list of rows with `Status = "Pending"`. Only rows that have a `Row ID` populated show up, so pre-redeploy rows are invisible (they stay on the log, just aren't resolvable from the hub).
- `POST application/json` with body `{ action: "resolveSignIn", id, result: "Pass" | "Failed", notes? }` →
  - Flips the row's Status column to `Pass` or `Failed`.
  - If `Failed`, overwrites the matching matrix cell(s) with the literal string `Failed`, which the nightly hub cron ingests as a failed completion instead of a compliant date.
  - If `notes` is provided, appends them to the Notes column separated by `|`.

### After you paste the updated script

If you already deployed an earlier `KioskWebhook.gs`, you need to ship a **new version** of the web app so the hub's review tab can call the new actions:

1. **Deploy → Manage deployments** → ⋯ on your existing deployment → **Edit**.
2. **Version:** pick **New version**. Description: "add listPendingSignIns + resolveSignIn".
3. Click **Deploy** — the URL stays the same, so you don't need to touch the Vercel env var.

Rows that were logged before this redeploy won't show up in the review tab (no UUID). If you want them resolvable retroactively, add a Row ID by hand in column 11 and they'll appear on the next page load.

## Why this is separate from the hub's own API

The kiosk could POST directly to the hub at `/api/public/signin` — that endpoint is still there. We route through Apps Script instead so:

- Your existing Google Sheet stays the single source of truth for sign-ins, exactly like it is today.
- The hub stays an *observer* — it mirrors what's on the sheet, doesn't compete with it.
- If the hub is ever down, the kiosk still writes to the sheet.

## Troubleshooting

- **"submission_error" pops on the kiosk** — open the Apps Script editor → **Executions** tab. The most recent run will have the actual stack trace. Common causes: script not authorized to edit the sheet (re-run once manually to trigger the auth prompt), or the `Training` tab was renamed.
- **Row appears on Training Records but the matrix doesn't update** — the typed name didn't match any row on the matrix. Check the Apps Script Executions log for "No row matched for '…'". Fix options: have the signer type the exact name as it appears on the matrix, or add a nickname entry to `NICKNAMES` in `KioskWebhook.gs`.
- **Everything worked, but the hub's attendance log is still empty** — the nightly cron hasn't run yet. Run `npm run ingest:refresh` locally or wait for the overnight Vercel cron.
