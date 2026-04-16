"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { commitImportAction } from "@/app/actions/import";
import {
  previewEvcMergedEmployeesAction,
  previewEvcTrainingMatrixAction,
} from "@/app/actions/evc-xlsx-preview";
import { parsePaylocityCsv, previewPaylocityImport } from "@/lib/imports/paylocity";
import { parsePhsCsv, previewPhsImport } from "@/lib/imports/phs";
import { MAX_TRAINING_COMPLETION_PREVIEW_ROWS } from "@/lib/imports/evc-xlsx";
import type { ImportPreview } from "@/lib/imports/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function FileDrop({
  label,
  accept,
  hint,
  onText,
}: {
  label: string;
  accept: string;
  hint: string;
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
        accept={accept}
        className="hidden"
        disabled={busy}
        onChange={(e) => handle(e.target.files?.[0] ?? null)}
      />
      <span>{busy ? "Reading file…" : label}</span>
      <span className="mt-2 text-xs text-[#5c6078]">{hint}</span>
    </label>
  );
}

function XlsxDrop({
  label,
  onFile,
}: {
  label: string;
  onFile: (file: File | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#2a2e3d] bg-[#1a1d27] px-6 py-10 text-center text-sm text-[#8b8fa3] transition hover:border-[#3b82f6]/50">
      <input
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0] ?? null;
          if (!file) return;
          setBusy(true);
          onFile(file);
          setBusy(false);
        }}
      />
      <span>{busy ? "Reading file…" : label}</span>
      <span className="mt-2 text-xs text-[#5c6078]">.xlsx (e.g. EVC_Attendance_Tracker.xlsx)</span>
    </label>
  );
}

export function ImportPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [payPreview, setPayPreview] = useState<ImportPreview | null>(null);
  const [phsPreview, setPhsPreview] = useState<ImportPreview | null>(null);
  const [evcFile, setEvcFile] = useState<File | null>(null);
  const [mergedPreview, setMergedPreview] = useState<ImportPreview | null>(null);
  const [trainingPreview, setTrainingPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#8b8fa3]">
        <Link className="text-[#3b82f6] underline" href="/api/exports/merged-employees-csv">
          Download employees CSV
        </Link>{" "}
        (columns aligned with the EVC <code className="text-xs">Merged</code> sheet: ID, L NAME, F NAME, ACTIVE,
        Division, Hire Date) for Excel round-trip.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-[#2a2e3d] bg-[#1e2230] text-[#e8eaed]">
          <CardHeader>
            <CardTitle className="text-base">Paylocity export</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileDrop
              label="Drop Paylocity CSV or click to browse"
              accept=".csv,text/csv"
              hint="CSV only"
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
              accept=".csv,text/csv"
              hint="CSV only"
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
      </div>

      <Card className="border-[#2a2e3d] bg-[#1e2230] text-[#e8eaed]">
        <CardHeader>
          <CardTitle className="text-base">EVC workbook (.xlsx)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <XlsxDrop
            label="Drop EVC_Attendance_Tracker.xlsx or click to browse"
            onFile={(f) => {
              setEvcFile(f);
              setMergedPreview(null);
              setTrainingPreview(null);
              setMessage(null);
            }}
          />
          {evcFile ? (
            <p className="text-xs text-[#8b8fa3]">
              Selected: <span className="font-mono text-[#e8eaed]">{evcFile.name}</span>
            </p>
          ) : null}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-[#2a2e3d] bg-[#1a1d27] p-4">
              <h3 className="text-sm font-medium text-[#e8eaed]">Merged → employees</h3>
              <p className="text-xs text-[#8b8fa3]">
                Reads allowlisted sheet <strong>Merged</strong> (columns ID, L NAME, F NAME, ACTIVE, Division, Hire
                Date).
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={!evcFile || pending}
                className="w-full"
                onClick={() => {
                  if (!evcFile) return;
                  startTransition(async () => {
                    const fd = new FormData();
                    fd.append("file", evcFile);
                    const res = await previewEvcMergedEmployeesAction(fd);
                    if ("error" in res) {
                      setMessage(res.error);
                      setMergedPreview(null);
                      return;
                    }
                    setMergedPreview(res);
                    setMessage(null);
                  });
                }}
              >
                Preview merged
              </Button>
              {mergedPreview ? (
                <div className="space-y-2 text-sm text-[#8b8fa3]">
                  <p>
                    Would upsert {mergedPreview.counts.wouldUpsertEmployees} employees. Invalid rows:{" "}
                    {mergedPreview.counts.invalidEmployeeRows}.
                  </p>
                  <Button
                    type="button"
                    disabled={pending}
                    className="rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]"
                    onClick={() =>
                      startTransition(async () => {
                        await commitImportAction(JSON.stringify(mergedPreview));
                        router.refresh();
                      })
                    }
                  >
                    Commit merged import
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="space-y-3 rounded-lg border border-[#2a2e3d] bg-[#1a1d27] p-4">
              <h3 className="text-sm font-medium text-[#e8eaed]">Training matrix → completions</h3>
              <p className="text-xs text-[#8b8fa3]">
                Reads allowlisted sheet <strong>Training</strong>. Each column after demographics is treated as a
                course name; cells parsed as dates become completion rows (must match training catalog names).
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={!evcFile || pending}
                className="w-full"
                onClick={() => {
                  if (!evcFile) return;
                  startTransition(async () => {
                    const fd = new FormData();
                    fd.append("file", evcFile);
                    const res = await previewEvcTrainingMatrixAction(fd);
                    if ("error" in res) {
                      setMessage(res.error);
                      setTrainingPreview(null);
                      return;
                    }
                    setTrainingPreview(res);
                    setMessage(null);
                  });
                }}
              >
                Preview training matrix
              </Button>
              {trainingPreview ? (
                <div className="space-y-2 text-sm text-[#8b8fa3]">
                  <p>
                    Would insert {trainingPreview.counts.wouldInsert} completions (preview capped at{" "}
                    {MAX_TRAINING_COMPLETION_PREVIEW_ROWS} rows).
                    {trainingPreview.counts.wouldInsert >= MAX_TRAINING_COMPLETION_PREVIEW_ROWS
                      ? " If you hit the cap, split the sheet or run a second pass after commit."
                      : null}
                  </p>
                  <Button
                    type="button"
                    disabled={pending}
                    className="rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]"
                    onClick={() =>
                      startTransition(async () => {
                        await commitImportAction(JSON.stringify(trainingPreview));
                        router.refresh();
                      })
                    }
                  >
                    Commit training import
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-[#ef4444]">{message}</p> : null}
    </div>
  );
}
