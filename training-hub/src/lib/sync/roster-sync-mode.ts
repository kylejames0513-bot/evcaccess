/** When true, Excel sync POSTs enqueue `pending_roster_events` instead of mutating employees. */
export function isRosterSyncGated(): boolean {
  const v = process.env.HUB_ROSTER_SYNC_GATED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
