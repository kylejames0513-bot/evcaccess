"use client";

import { useState } from "react";
import { toast } from "sonner";

type SourceType = "merged_master" | "attendance_tracker" | "new_hire_tracker" | "separation_summary" | "paylocity" | "unknown";

function detectSource(filename: string): SourceType {
  const lower = filename.toLowerCase();
  if (/merged.*employee.*master|employee.*master|merged\s*master/.test(lower)) return "merged_master";
  if (/attendance.*tracker|evc.*attendance/.test(lower)) return "attendance_tracker";
  if (/monthly.*new.*hire|new.*hire.*tracker/.test(lower)) return "new_hire_tracker";
  if (/separation.*summary|fy.*separation/.test(lower)) return "separation_summary";
  if (/paylocity|supervisor.*import/.test(lower)) return "paylocity";
  return "unknown";
}

const SOURCE_LABELS: Record<SourceType, string> = {
  merged_master: "Merged Employee Master (Source A)",
  attendance_tracker: "EVC Attendance Tracker (Source B)",
  new_hire_tracker: "Monthly New Hire Tracker (Source C)",
  separation_summary: "FY Separation Summary (Source D)",
  paylocity: "Paylocity Supervisor Import (Source E)",
  unknown: "Unknown format",
};

const SOURCE_DESCRIPTIONS: Record<SourceType, string> = {
  merged_master: "Syncs the reconciled roster — employees, aliases, departments.",
  attendance_tracker: "Imports training completions from the Training tab.",
  new_hire_tracker: "Ingests new hires and transfers from all 12 monthly sheets.",
  separation_summary: "Reads CY separation sheets into the separations table.",
  paylocity: "Updates employee status and supervisor assignments.",
  unknown: "Filename doesn't match any known source. Use the CLI: npm run ingest:source=<name>",
};

export function FileUploadDropzone() {
  const [files, setFiles] = useState<Array<{ file: File; source: SourceType }>>([]);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const arr = Array.from(newFiles).map(file => ({
      file,
      source: detectSource(file.name),
    }));
    setFiles(prev => [...prev, ...arr]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function processFile(idx: number) {
    const item = files[idx];
    if (!item) return;
    if (item.source === "unknown") {
      toast.error("Unknown source. Rename the file to match a known pattern or use the CLI.");
      return;
    }
    toast.info(
      `To process ${SOURCE_LABELS[item.source]}, place the file in data/sources/ and run:\nnpm run ingest:source=${item.source}`,
      { duration: 10000 }
    );
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? "border-[--accent] bg-[--accent-soft]"
            : "border-[--rule] bg-[--surface]"
        }`}
      >
        <p className="font-display text-sm italic text-[--ink-soft] mb-3">
          Drop files here to auto-detect source by filename.
        </p>
        <label className="inline-block">
          <input
            type="file"
            multiple
            accept=".xlsx,.xlsm,.csv"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <span className="rounded-md border border-[--rule] bg-[--surface-alt] px-4 py-2 text-sm hover:bg-[--surface-alt]/80 cursor-pointer">
            Browse files
          </span>
        </label>
        <p className="text-xs text-[--ink-muted] mt-3">
          Supports: .xlsx, .xlsm, .csv
        </p>
      </div>

      {files.length > 0 && (
        <div className="rounded-lg border border-[--rule] bg-[--surface]">
          <div className="border-b border-[--rule] px-6 py-3">
            <p className="caption">Detected sources</p>
          </div>
          <ul className="divide-y divide-[--rule]">
            {files.map((item, idx) => (
              <li key={idx} className="flex items-start gap-4 px-6 py-4">
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.file.name}</p>
                  <p className="text-xs text-[--ink-muted] mt-0.5 tabular-nums">
                    {(item.file.size / 1024).toFixed(1)} KB
                  </p>
                  <p className="mt-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.source === "unknown"
                        ? "bg-[--alert-soft] text-[--alert]"
                        : "bg-[--accent-soft] text-[--accent]"
                    }`}>
                      {SOURCE_LABELS[item.source]}
                    </span>
                  </p>
                  <p className="text-xs text-[--ink-muted] mt-1">{SOURCE_DESCRIPTIONS[item.source]}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => processFile(idx)}
                    disabled={item.source === "unknown"}
                    className="rounded-md bg-[--accent] px-3 py-1.5 text-xs font-medium text-[--primary-foreground] hover:bg-[--accent]/90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Instructions
                  </button>
                  <button
                    onClick={() => removeFile(idx)}
                    className="rounded-md border border-[--rule] px-3 py-1.5 text-xs hover:bg-[--surface-alt]"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
