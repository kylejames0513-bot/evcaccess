// Stub: returns default thresholds so /settings page loads
export async function GET() { return Response.json({ critical: 30, warning: 60, notice: 90 }); }
export async function POST() { return Response.json({ ok: true }); }
