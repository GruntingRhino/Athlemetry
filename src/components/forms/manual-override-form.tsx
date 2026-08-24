"use client";

import { useState, type FormEvent } from "react";

export function ManualOverrideForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);

    const payload = {
      submissionId: formData.get("submissionId"),
      action: formData.get("action"),
      notes: formData.get("notes"),
      processingStatus: formData.get("processingStatus") || undefined,
      sprintTime: formData.get("sprintTime") || undefined,
      accelerationTiming: formData.get("accelerationTiming") || undefined,
      changeOfDirectionMeasurement: formData.get("changeOfDirectionMeasurement") || undefined,
      shotTiming: formData.get("shotTiming") || undefined,
      repetitionCount: formData.get("repetitionCount") || undefined,
      consistencyScore: formData.get("consistencyScore") || undefined,
    };

    const response = await fetch("/api/admin/manual-override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setMessage(data.error || "Override failed.");
      return;
    }

    setMessage("Manual override applied.");
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <p className="text-sm text-amber-800">Metric corrections are administrative evidence only. Editing a metric revokes capture verification, removes its benchmark snapshot, archives its coaching plan, and withholds the corrected value until protocol reverification.</p>
      <label className="athlemetry-label">
        Submission ID
        <input name="submissionId" className="athlemetry-control" required />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="athlemetry-label">
          Action
          <input name="action" className="athlemetry-control" defaultValue="MANUAL_CORRECTION" required />
        </label>
        <label className="athlemetry-label">
          Processing status
          <select name="processingStatus" className="athlemetry-control">
            <option value="">No change</option>
            <option value="QUEUED">QUEUED</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
            <option value="RETRYING">RETRYING</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="athlemetry-label">
          Sprint time
          <input type="number" step="0.01" name="sprintTime" className="athlemetry-control" />
        </label>
        <label className="athlemetry-label">
          Acceleration
          <input type="number" step="0.01" name="accelerationTiming" className="athlemetry-control" />
        </label>
        <label className="athlemetry-label">
          COD
          <input type="number" step="0.01" name="changeOfDirectionMeasurement" className="athlemetry-control" />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="athlemetry-label">
          Shot timing
          <input type="number" step="0.01" name="shotTiming" className="athlemetry-control" />
        </label>
        <label className="athlemetry-label">
          Repetition count
          <input type="number" name="repetitionCount" className="athlemetry-control" />
        </label>
        <label className="athlemetry-label">
          Consistency score
          <input type="number" step="0.1" name="consistencyScore" className="athlemetry-control" />
        </label>
      </div>
      <label className="athlemetry-label">
        Notes
        <textarea name="notes" className="athlemetry-control" rows={3} />
      </label>
      {message ? <p className="athlemetry-message">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="athlemetry-button athlemetry-button-primary disabled:opacity-60"
      >
        {pending ? "Applying..." : "Apply override"}
      </button>
    </form>
  );
}
