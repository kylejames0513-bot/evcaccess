// Stub: exclusion is now handled by is_active=false on employees.
import { withApiHandler } from "@/lib/api-handler";

export const POST = withApiHandler(async () => ({ ok: true }));
