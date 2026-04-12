import { describe, expect, it, vi } from "vitest";
import { withApiHandler, ApiError } from "./api-handler";
import type { NextRequest } from "next/server";

// ============================================================
// withApiHandler unit tests
// ============================================================
// These are pure-unit tests: they never hit Supabase or the real
// Next runtime. They verify the contract documented in
// src/lib/api-handler.ts — status, shape, and logging behavior.
// ============================================================

// Minimal NextRequest stub. The handler we pass to withApiHandler
// is typed against NextRequest but at runtime only uses what the
// handler body touches, which in these tests is `nothing`.
function fakeReq(): NextRequest {
  return {} as unknown as NextRequest;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

describe("withApiHandler", () => {
  it("wraps a successful plain-object return as 200 JSON", async () => {
    const handler = withApiHandler(async () => ({ hello: "world" }));
    const res = await handler(fakeReq(), undefined);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ hello: "world" });
  });

  it("passes a returned Response through unchanged", async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { location: "/login" },
    });
    const handler = withApiHandler(async () => redirect);
    const res = await handler(fakeReq(), undefined);
    expect(res).toBe(redirect);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("coerces null/undefined return to empty 200 JSON", async () => {
    const handler = withApiHandler(async () => null as unknown as Record<string, never>);
    const res = await handler(fakeReq(), undefined);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({});
  });

  it("returns the custom status and code for ApiError", async () => {
    const handler = withApiHandler(async () => {
      throw new ApiError("training_type_id is required", 400, "missing_field");
    });
    const res = await handler(fakeReq(), undefined);
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({
      error: "training_type_id is required",
      code: "missing_field",
    });
  });

  it("supports 4xx ApiError codes like 404 not_found", async () => {
    const handler = withApiHandler(async () => {
      throw new ApiError("Row not found", 404, "not_found");
    });
    const res = await handler(fakeReq(), undefined);
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({
      error: "Row not found",
      code: "not_found",
    });
  });

  it("supports 413 payload_too_large for import guardrails", async () => {
    const handler = withApiHandler(async () => {
      throw new ApiError("too many rows", 413, "payload_too_large");
    });
    const res = await handler(fakeReq(), undefined);
    expect(res.status).toBe(413);
    expect(((await readJson(res)) as { code: string }).code).toBe(
      "payload_too_large"
    );
  });

  it("maps an unknown thrown Error to 500 internal and logs it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withApiHandler(async () => {
      throw new Error("db blew up");
    });
    const res = await handler(fakeReq(), undefined);
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({
      error: "db blew up",
      code: "internal",
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("maps a thrown non-Error (e.g. a string) to 500 internal with generic message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withApiHandler(async () => {
      throw "something bad";
    });
    const res = await handler(fakeReq(), undefined);
    expect(res.status).toBe(500);
    const body = (await readJson(res)) as { error: string; code: string };
    expect(body.code).toBe("internal");
    expect(body.error).toBe("Unknown error");
    spy.mockRestore();
  });

  it("awaits an async route context params promise correctly", async () => {
    const handler = withApiHandler(async (_req, ctx) => {
      const params = await ctx!.params;
      return { id: params.id };
    });
    const ctx = { params: Promise.resolve({ id: "abc-123" }) };
    const res = await handler(fakeReq(), ctx);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ id: "abc-123" });
  });
});

describe("ApiError", () => {
  it("defaults to status 400, code bad_request", () => {
    const err = new ApiError("oops");
    expect(err.status).toBe(400);
    expect(err.code).toBe("bad_request");
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });

  it("carries custom status and code through", () => {
    const err = new ApiError("nope", 403, "forbidden");
    expect(err.status).toBe(403);
    expect(err.code).toBe("forbidden");
  });
});
