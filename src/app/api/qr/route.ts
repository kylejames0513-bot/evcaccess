import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  url: z.string().url(),
});

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const parsed = querySchema.safeParse({ url });
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid url query" }, { status: 400 });
  }
  const png = await QRCode.toBuffer(parsed.data.url, { type: "png", width: 512, margin: 2 });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
