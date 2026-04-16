"use client";

import { useState } from "react";
import { QrCode, Copy, Check, ExternalLink } from "lucide-react";

export function KioskInfoCard({ orgSlug }: { orgSlug: string }) {
  const [copied, setCopied] = useState(false);
  if (!orgSlug) return null;

  const kioskPath = `/signin/${orgSlug}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const kioskUrl = origin ? `${origin}${kioskPath}` : kioskPath;

  function handleCopy() {
    navigator.clipboard.writeText(kioskUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-xl border border-[#2a2e3d] bg-[#1a1d27] p-6">
      <div className="flex items-center gap-2 text-sm font-medium text-[#8b8fa3]">
        <QrCode className="size-4" />
        Kiosk Sign-in
      </div>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
        {origin && (
          <img
            src={`/api/qr?url=${encodeURIComponent(kioskUrl)}`}
            alt="Kiosk QR code"
            width={120}
            height={120}
            className="rounded-lg border border-[#2a2e3d]"
          />
        )}
        <div className="flex-1 space-y-3">
          <p className="text-xs text-[#8b8fa3]">
            Share this link or QR code for tablet sign-in at training sessions.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-[#0f1117] px-3 py-1.5 text-xs text-[#e8eaed]">
              {kioskUrl}
            </code>
            <button
              onClick={handleCopy}
              className="rounded p-1.5 text-[#8b8fa3] hover:bg-[#2a2e3d] hover:text-[#e8eaed]"
              title="Copy URL"
            >
              {copied ? <Check className="size-4 text-green-400" /> : <Copy className="size-4" />}
            </button>
            <a
              href={kioskPath}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1.5 text-[#8b8fa3] hover:bg-[#2a2e3d] hover:text-[#e8eaed]"
              title="Open kiosk"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
