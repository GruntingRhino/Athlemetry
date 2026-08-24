"use client";

import { useState, type FormEvent } from "react";

type ReportReviewFormProps = {
  reportId: string;
  currentStatus: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
};

export function ReportReviewForm({ reportId, currentStatus }: ReportReviewFormProps) {
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);

    const response = await fetch(`/api/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: formData.get("status"),
        resolutionNote: formData.get("resolutionNote"),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Failed to update report.");
      return;
    }

    setMessage("Report status updated.");
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={onSubmit}>
      <select
        name="status"
        defaultValue={currentStatus}
        className="athlemetry-control w-auto text-xs"
      >
        <option value="OPEN">OPEN</option>
        <option value="IN_REVIEW">IN_REVIEW</option>
        <option value="RESOLVED">RESOLVED</option>
        <option value="DISMISSED">DISMISSED</option>
      </select>
      <label className="block text-xs font-semibold text-slate-700" htmlFor={`report-note-${reportId}`}>
        Resolution note (required for resolved or dismissed)
        <textarea
          id={`report-note-${reportId}`}
          name="resolutionNote"
          maxLength={500}
          className="athlemetry-control mt-1 min-h-20 text-sm"
        />
      </label>
      <p className="text-xs leading-5 text-slate-600">
        Do not include contact details or external links. Resolution notes are visible to the report owner.
      </p>
      <button
        type="submit"
        className="athlemetry-button athlemetry-button-primary px-3 py-1.5 text-xs"
      >
        Update
      </button>
      {message ? <span className="athlemetry-message text-xs">{message}</span> : null}
    </form>
  );
}
