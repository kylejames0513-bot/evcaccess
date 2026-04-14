// Stub: returns default thresholds so /settings page loads.
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => ({ critical: 30, warning: 60, notice: 90 }));
export const POST = withApiHandler(async () => ({ ok: true }));
