"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitImportAction } from "@/app/actions/import";
import { parsePaylocityCsv, previewPaylocityImport } from "@/lib/imports/paylocity";
import { parsePhsCsv, previewPhsImport } from "@/lib/imports/phs";
import type { ImportPreview } from "@/lib/imports/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function FileDrop({
  label,
  onText,
}: {
  label: string;
  onText: (name: string, text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const handle = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setBusy(true);
      const text = await file.text();
      onText(file.name, text);
      setBusy(false);
    },
    [onText]
  );
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#2a2e3d] bg-[#1a1d27] px-6 py-10 text-center text-sm text-[#8b8fa3] transition hover:border-[#3b82f6]/50">
      <input
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        disabled={busy}
        onChange={(e) => handle(e.target.files?.[0] ?? null)}
      />
      <span>{busy ? "Reading file…" : label}</span>
      <span className="mt-2 text-xs text-[#5c6078]">CSV only</span>
    </label>
  );
}

export function ImportPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [payPreview, setPayPreview] = useState<ImportPreview | null>(null);
  const [phsPreview, setPhsPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="border-[#2a2e3d] bg-[#1e2230] text-[#e8eaed]">
        <CardHeader>
          <CardTitle className="text-base">Paylocity export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDrop
            label="Drop Paylocity CSV or click to browse"
            onText={(name, text) => {
              try {
                const rows = parsePaylocityCsv(text);
                setPayPreview(previewPaylocityImport(rows, name));
                setMessage(null);
              } catch (err) {
                setMessage(err instanceof Error ? err.message : "Could not parse CSV.");
              }
            }}
          />
          {payPreview ? (
            <div className="space-y-2 text-sm text-[#8b8fa3]">
              <p>
                Would insert {payPreview.counts.wouldInsert} completions. Unresolved people:{" "}
                {payPreview.counts.unresolvedPeople}. Unknown trainings:{" "}
                {payPreview.counts.unknownTrainings}.
              </p>
              <Button
                type="button"
                disabled={pending}
                className="rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]"
                onClick={() =>
                  startTransition(async () => {
                    await commitImportAction(JSON.stringify(payPreview));
                    router.refresh();
                  })
                }
              >
                Commit Paylocity import
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card className="border-[#2a2e3d] bg-[#1e2230] text-[#e8eaed]">
        <CardHeader>
          <CardTitle className="text-base">PHS export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDrop
            label="Drop PHS CSV or click to browse"
            onText={(name, text) => {
              try {
                const rows = parsePhsCsv(text);
                setPhsPreview(previewPhsImport(rows, name));
                setMessage(null);
              } catch (err) {
                setMessage(err instanceof Error ? err.message : "Could not parse CSV.");
              }
            }}
          />
          {phsPreview ? (
            <div className="space-y-2 text-sm text-[#8b8fa3]">
              <p>
                Would insert {phsPreview.counts.wouldInsert} completions. Unresolved people:{" "}
                {phsPreview.counts.unresolvedPeople}. Unknown trainings:{" "}
                {phsPreview.counts.unknownTrainings}.
              </p>
              <Button
                type="button"
                disabled={pending}
                className="rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]"
                onClick={() =>
                  startTransition(async () => {
                    await commitImportAction(JSON.stringify(phsPreview));
                    router.refresh();
                  })
                }
              >
                Commit PHS import
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {message ? <p className="text-sm text-[#ef4444] lg:col-span-2">{message}</p> : null}
    </div>
  );
}
