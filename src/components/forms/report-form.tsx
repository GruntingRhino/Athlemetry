"use client";

import { useState, type FormEvent } from "react";

type ReportFormProps = {
  submissionId: string;
  reportableMetric?: {
    name: string;
    label: string;
  };
};

export function ReportForm({ submissionId, reportableMetric }: ReportFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [metricName, setMetricName] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      submissionId,
      metricName,
      reportedValue: formData.get("reportedValue"),
      disputedFrameIndex: formData.get("disputedFrameIndex"),
      accuracyRating: formData.get("accuracyRating"),
      usefulnessRating: formData.get("usefulnessRating"),
      requestType: formData.get("requestType"),
      reason: formData.get("reason"),
      details: formData.get("details"),
    };

    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Failed to submit report.");
      return;
    }

    setMessage("Report submitted for admin review.");
  }

  return (
    <form className="mt-2 space-y-2" onSubmit={onSubmit}>
      <label className="block text-xs font-medium text-slate-700">
        Request type
        <select name="requestType" defaultValue="ISSUE" className="mt-1 athlemetry-control text-xs">
          <option value="ISSUE">Report an issue</option>
          <option value="HUMAN_REVIEW">Request human review</option>
          <option value="REPROCESS">Request reprocessing</option>
        </select>
        <span className="mt-1 block font-normal text-slate-500">Human-review and reprocessing requests are queued for an administrator; they do not automatically alter an analyzed result or rerun processing.</span>
      </label>
      {reportableMetric ? (
        <label className="block text-xs font-medium text-slate-700">
          Report scope
          <select
            name="metricName"
            value={metricName}
            onChange={(event) => setMetricName(event.target.value)}
            className="mt-1 athlemetry-control text-xs"
          >
            <option value="">Entire submission</option>
            <option value={reportableMetric.name}>{reportableMetric.label} metric</option>
          </select>
        </label>
      ) : null}
      {reportableMetric ? (
        <label className="block text-xs font-medium text-slate-700">
          Claimed corrected value (optional)
          <input
            name="reportedValue"
            type="number"
            min="0"
            max="1000000"
            step="any"
            disabled={!metricName}
            className="mt-1 athlemetry-control text-xs"
            placeholder={`Select ${reportableMetric.label} metric first`}
          />
          <span className="mt-1 block font-normal text-slate-500">This is a claim for admin review and does not change your analyzed result.</span>
        </label>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-700">Disputed video frame (optional)<input name="disputedFrameIndex" type="number" min="0" className="mt-1 athlemetry-control text-xs" /></label>
        <label className="block text-xs font-medium text-slate-700">Accuracy rating (1–5)<input name="accuracyRating" type="number" min="1" max="5" className="mt-1 athlemetry-control text-xs" /></label>
        <label className="block text-xs font-medium text-slate-700">Usefulness rating (1–5)<input name="usefulnessRating" type="number" min="1" max="5" className="mt-1 athlemetry-control text-xs" /></label>
      </div>
      <input
        name="reason"
        className="athlemetry-control text-xs"
        placeholder="Report reason"
        required
      />
      <textarea
        name="details"
        className="athlemetry-control text-xs"
        placeholder="Optional details (do not include contact details or links)"
        rows={2}
      />
      <p className="text-xs text-slate-500">Do not include email addresses, phone numbers, or external links. Administrators will review the report in Athlemetry.</p>
      <button
        type="submit"
        className="athlemetry-button athlemetry-button-primary px-3 py-1.5 text-xs"
      >
        Submit report
      </button>
      {message ? <p className="athlemetry-message text-xs">{message}</p> : null}
    </form>
  );
}
