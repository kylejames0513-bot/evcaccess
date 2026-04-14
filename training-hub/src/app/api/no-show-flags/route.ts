// Stub: no-show flags are tracked inside enrollments.status now; the
// dedicated flag store was removed. These endpoints stay for legacy pages.
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => ({ flags: {} }));
export const POST = withApiHandler(async () => ({ ok: true }));
