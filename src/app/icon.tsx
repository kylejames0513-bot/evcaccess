import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 20,
          background: "#0f1117",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#4ade80",
          fontFamily: "Georgia, serif",
          fontWeight: 500,
          letterSpacing: "-0.02em",
        }}
      >
        H
      </div>
    ),
    { ...size }
  );
}
