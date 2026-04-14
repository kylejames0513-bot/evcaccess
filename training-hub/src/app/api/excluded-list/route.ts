// Stub: no excluded list, is_active replaces it.
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => ({ excluded: [] }));
