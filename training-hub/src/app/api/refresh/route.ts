// /api/refresh: legacy no-op kept so pages that POST here during a
// manual refresh still get a 200. The old training-data.ts cache
// invalidation is gone (the new db layer is stateless) so there is
// nothing to actually refresh.
export async function POST() {
  return Response.json({ ok: true });
}
