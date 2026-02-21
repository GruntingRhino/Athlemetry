"use client";

import { useState } from "react";

export function PrivacyActions() {
  const [message, setMessage] = useState<string | null>(null);

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

    const response = await fetch("/api/privacy/delete", { method: "POST" });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Deletion failed.");
      return;
    }

    setMessage("Account deleted. Redirecting to login.");
    window.location.assign("/login?deleted=1");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={exportData}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Export my data
        </button>
        <button
          type="button"
          onClick={deleteAccount}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
        >
          Delete account
        </button>
      </div>
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
