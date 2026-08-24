"use client";

import { useState, type FormEvent } from "react";

export function ModelControls() {
  const [message, setMessage] = useState<string | null>(null);

  async function activateVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      version: formData.get("version"),
      notes: formData.get("notes"),
    };

    const response = await fetch("/api/admin/model/version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Failed to activate model version.");
      return;
    }

    setMessage("Model version activated.");
  }

  async function queueRetrain() {
    setMessage(null);
    const response = await fetch("/api/admin/model/retrain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Manual retraining requested from dashboard." }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Failed to queue retraining.");
      return;
    }

    setMessage(`Retraining job queued: ${data.job.id}`);
  }

  return (
    <div className="space-y-4">
      <form className="space-y-3" onSubmit={activateVersion}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="athlemetry-label">
            Version
            <input name="version" className="athlemetry-control" placeholder="v1.1.0" required />
          </label>
          <label className="athlemetry-label">
            Notes
            <input name="notes" className="athlemetry-control" placeholder="Summary of model changes" />
          </label>
        </div>
        <button
          type="submit"
          className="athlemetry-button athlemetry-button-secondary"
        >
          Activate version
        </button>
      </form>

      <button
        type="button"
        onClick={queueRetrain}
        className="athlemetry-button athlemetry-button-primary"
      >
        Queue retraining job
      </button>

      {message ? <p className="athlemetry-message">{message}</p> : null}
    </div>
  );
}
