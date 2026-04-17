// Next.js looks for `middleware.ts` (or `src/middleware.ts`) to run on every
// matching request. The actual logic — Supabase session refresh — lives in
// ./proxy.ts. This thin re-export is the mount point.
//
// If a future Next.js release starts auto-detecting `proxy.ts` as the
// convention (see AGENTS.md — "this is NOT the Next.js you know"), this file
// becomes redundant; verify before deleting.
export { proxy as middleware, config } from "./proxy";
