// ============================================================
// withApiHandler — standard error wrapper for Next.js route handlers.
// ============================================================
// Why this exists:
//   Every /api/* route was copy-pasting try/catch with ad-hoc error
//   shapes (some returned { error }, some returned { message }, some
//   forgot to return status 500 at all). That's fragile and makes the
//   client side handle failures inconsistently. This wrapper gives us:
//
//     • A single place to log errors server-side (stderr)
//     • A consistent { error, code } shape on failure
//     • Automatic 400 on ApiError with a status in the 4xx range
//     • Automatic 500 on any other unknown error
//
// Usage (in a route file):
//
//     import { withApiHandler, ApiError } from "@/lib/api-handler";
//
//     export const GET = withApiHandler(async (req) => {
//       const rows = await listRequiredTrainings();
//       return { required_trainings: rows };
//     });
//
//     export const POST = withApiHandler(async (req) => {
//       const body = await req.json();
//       if (!body.training_type_id) {
//         throw new ApiError("training_type_id is required", 400, "missing_field");
//       }
//       return { required_training: await insertRequiredTraining(body) };
//     });
//
// If the handler returns a plain object, it's JSON-encoded with status 200.
// If the handler returns a `Response` directly, it's returned as-is.
// ============================================================

import type { NextRequest } from "next/server";

export type ApiErrorCode =
  | "bad_request"
  | "missing_field"
  | "invalid_field"
  | "not_found"
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "payload_too_large"
  | "unprocessable"
  | "internal";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(message: string, status = 400, code: ApiErrorCode = "bad_request") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type RouteContext = { params: Promise<Record<string, string>> } | undefined;
type RouteHandler<T> = (req: NextRequest, ctx: RouteContext) => Promise<T>;

/**
 * Wrap a route handler with standard error handling + JSON encoding.
 *
 * - Plain object return  → Response.json(obj, { status: 200 })
 * - Response return      → returned as-is (for streams, redirects, etc.)
 * - ApiError thrown      → Response.json({ error, code }, { status: err.status })
 * - Any other throw      → console.error + Response.json({ error, code: "internal" }, 500)
 */
export function withApiHandler<T>(
  handler: RouteHandler<T>
): (req: NextRequest, ctx: RouteContext) => Promise<Response> {
  return async (req, ctx) => {
    try {
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return Response.json(result ?? {}, { status: 200 });
    } catch (err) {
      if (err instanceof ApiError) {
        return Response.json(
          { error: err.message, code: err.code },
          { status: err.status }
        );
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      // Log full error server-side; never leak stack to client.
      console.error("[api] unhandled error:", err);
      return Response.json(
        { error: message, code: "internal" as ApiErrorCode },
        { status: 500 }
      );
    }
  };
}
