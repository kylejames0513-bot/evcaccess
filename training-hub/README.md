# Training Hub v2 (Hub-First)

Training Hub has been rebuilt as a hub-first app:

- Data is pushed into the hub through API endpoints
- The dashboard reads and analyzes the hub state
- A one-time run guard blocks duplicate pushes by `runId`

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## API flow

### 1) Push records from Google Apps Script

Endpoint: `POST /api/hub/push`

Payload shape:

```json
{
  "runId": "sheet-run-2026-04-14T18:40:00Z",
  "source": "google-sheets",
  "employees": [{ "employee_id": "E-1001", "name": "Jane Doe", "division": "Residential", "location": "North", "status": "active" }],
  "records": [{ "employee_id": "E-1001", "training_key": "cpr", "completed_at": "2026-01-10", "expires_at": "2028-01-10", "source": "google-sheets" }]
}
```

`runId` is idempotent: the hub processes it once and rejects repeats.

### 2) Read state in the hub

Endpoint: `GET /api/hub/state`

Returns:

- `data` (employees + records currently loaded)
- `summary` (counts + warnings)
- `sync` (last run metadata and processed run IDs)

## Google Apps Script example

```javascript
function pushTrainingHubRun() {
  var runId = Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var payload = {
    runId: "sheet-run-" + runId,
    source: "google-sheets",
    employees: [
      { employee_id: "E-1001", name: "Jane Doe", division: "Residential", location: "North", status: "active" }
    ],
    records: [
      { employee_id: "E-1001", training_key: "cpr", completed_at: "2026-01-10", expires_at: "2028-01-10", source: "google-sheets" }
    ]
  };

  var response = UrlFetchApp.fetch("https://evcaccess.vercel.app/api/hub/push", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log(response.getResponseCode());
  Logger.log(response.getContentText());
}
```
