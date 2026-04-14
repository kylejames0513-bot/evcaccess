// Stub: returns empty capacities so /trainings page loads.
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => ({ capacities: {} }));
