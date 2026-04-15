/**
 * MERGED SHEET → HUB IMPORTS (STUB)
 *
 * This is NOT drop-in production code. It documents the shape of a Google
 * Apps Script that maps a tab to Paylocity-like rows and POSTs them to the
 * Training Hub /api/imports endpoint.
 *
 * Before using:
 * 1. Replace HUB_ORIGIN with your deployed hub (https://...).
 * 2. Decide authentication: manual upload is simplest; cookie auth from
 *    Apps Script is fragile; a dedicated webhook + secret is a code change.
 * 3. Map YOUR column headers to the keys expected by resolvePaylocityBatch.
 *
 * Hub API (see training-hub source):
 *   POST {HUB_ORIGIN}/api/imports
 *   Content-Type: application/json
 *   Body: { "source": "paylocity", "filename": "merged-from-sheet.csv", "rows": [ ... ] }
 */

const HUB_ORIGIN = 'https://your-hub.example.com';

function mapSheetRowToPaylocityRow_(rowObject) {
  // Example: merged tab uses "LName" / "FName" — rename to hub expectations.
  return {
    'Last Name': rowObject.LName || rowObject['Last Name'] || '',
    'First Name': rowObject.FName || rowObject['First Name'] || '',
    // Add other Paylocity columns your resolver needs...
  };
}

function postPreviewToHub_(rows) {
  const payload = {
    source: 'paylocity',
    filename: 'google-merged-export',
    rows: rows,
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    // headers: { Authorization: 'Bearer ...' } // only if you add server support
  };
  return UrlFetchApp.fetch(HUB_ORIGIN + '/api/imports', options);
}

/**
 * Menu handler example: read active sheet, map first data rows, POST preview.
 */
function previewMergedTabToHub() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('Need header row + at least one data row');
  const headers = values[0].map(String);
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[r][i];
    });
    rows.push(mapSheetRowToPaylocityRow_(obj));
  }
  const response = postPreviewToHub_(rows);
  Logger.log('HTTP %s %s', response.getResponseCode(), response.getContentText());
}
