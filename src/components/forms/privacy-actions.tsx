"use client";

import { useState } from "react";

export function PrivacyActions({
  initialModelTrainingConsent,
}: {
  initialModelTrainingConsent: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [modelTrainingConsent, setModelTrainingConsent] = useState(initialModelTrainingConsent);
  const [savingModelTrainingConsent, setSavingModelTrainingConsent] = useState(false);

  async function exportData() {
    setMessage(null);
    const response = await fetch("/api/privacy/export", { method: "POST" });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Export failed.");
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `athlemetry-export-${new Date().toISOString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    setMessage("Export generated and downloaded.");
  }

  async function deleteAccount() {
    setMessage(null);

    const confirmed = window.confirm("Delete this account and remove access immediately?");
    if (!confirmed) {
      return;
    }

    const password = window.prompt("Enter your password to permanently delete this account.");
    if (!password) {
      return;
    }

    const response = await fetch("/api/privacy/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Deletion failed.");
      return;
    }

    setMessage("Account deleted. Redirecting to login.");
    window.location.assign("/login?deleted=1");
  }

  async function updateModelTrainingConsent(granted: boolean) {
    const previous = modelTrainingConsent;
    setModelTrainingConsent(granted);
    setSavingModelTrainingConsent(true);
    setMessage(null);

    try {
      const response = await fetch("/api/privacy/model-training-consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ granted }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setModelTrainingConsent(previous);
        setMessage(data.error || "Model-training preference could not be saved.");
        return;
      }

      setMessage(granted
        ? "Model-training consent granted."
        : "Model-training consent withdrawn.");
    } catch {
      setModelTrainingConsent(previous);
      setMessage("Model-training preference could not be saved. Please try again.");
    } finally {
      setSavingModelTrainingConsent(false);
    }
  }

  return (
    <div className="space-y-3">
      <fieldset className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-950">Model-training consent</legend>
        <p id="model-training-consent-description" className="mt-1 text-sm text-slate-600">
          Disabled by default. Opt in only if you want your data considered for future model-training work.
        </p>
        <label className="mt-3 flex items-start gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={modelTrainingConsent}
            disabled={savingModelTrainingConsent}
            onChange={(event) => updateModelTrainingConsent(event.target.checked)}
            aria-describedby="model-training-consent-description"
          />
          <span>{modelTrainingConsent ? "Consent granted" : "Consent not granted"}</span>
        </label>
      </fieldset>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={exportData}
          className="athlemetry-button athlemetry-button-secondary"
        >
          Export my data
        </button>
        <button
          type="button"
          onClick={deleteAccount}
          className="athlemetry-button athlemetry-danger"
        >
          Delete account
        </button>
      </div>
      {message ? <p className="athlemetry-message" role="status">{message}</p> : null}
    </div>
  );
}
