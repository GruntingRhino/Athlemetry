"use client";

import { useState } from "react";

type ExportedMetric = {
  key: string;
  label: string;
  unit: string;
  value: number;
  definition: string;
  evidenceVerifiedAt: string;
};

type ExportedReport = {
  submissionId: string;
  drill: string;
  recordingDate: string;
  location: string;
  benchmarkPercentile: number | null;
  metrics: ExportedMetric[];
};

function escapeCsv(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function ReportExportButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function exportReports() {
    setExporting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/reports/export");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Reports could not be exported.");
        return;
      }

      const rows = (data.reports as ExportedReport[]).flatMap((report) => report.metrics.map((metric) => [
        report.submissionId,
        report.drill,
        report.recordingDate,
        report.location,
        metric.key,
        metric.label,
        metric.value,
        metric.unit,
        metric.definition,
        metric.evidenceVerifiedAt,
        report.benchmarkPercentile,
      ]));
      const csv = [
        ["submission_id", "drill", "recording_date", "location", "metric_key", "metric", "value", "unit", "definition", "evidence_verified_at", "benchmark_percentile"],
        ...rows,
      ].map((row) => row.map(escapeCsv).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `athlemetry-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(rows.length > 0 ? "Validated reports exported." : "No released reports were available to export.");
    } catch {
      setMessage("Reports could not be exported. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-4">
      <button type="button" onClick={exportReports} disabled={exporting} className="athlemetry-button athlemetry-button-secondary">
        {exporting ? "Exporting…" : "Export validated reports (CSV)"}
      </button>
      {message ? <p className="mt-2 text-sm text-slate-600" role="status">{message}</p> : null}
    </div>
  );
}
