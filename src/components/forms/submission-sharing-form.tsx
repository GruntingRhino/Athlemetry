"use client";

import { useState } from "react";

export function SubmissionSharingForm({ submissionId }: { submissionId: string }) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function updateShare(method: "POST" | "DELETE") {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/submissions/${submissionId}/sharing`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipientEmail }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; active?: boolean } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Sharing could not be updated.");
        return;
      }

      setMessage(method === "POST" ? "Read-only access request processed." : "Read-only access revocation processed.");
    } catch {
      setMessage("Sharing could not be updated.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50/90 p-4" aria-labelledby={`sharing-${submissionId}`}>
      <h2 id={`sharing-${submissionId}`} className="text-xs font-bold uppercase tracking-[0.18em] text-slate-700">
        Share read-only access
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Grant or revoke access for one existing Athlemetry account. Shared access is limited to this submission and its reports.
      </p>
      <form
        className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void updateShare("POST");
        }}
      >
        <div className="flex-1">
          <label className="text-sm font-medium text-slate-800" htmlFor={`share-email-${submissionId}`}>
            Recipient email
          </label>
          <input
            id={`share-email-${submissionId}`}
            type="email"
            autoComplete="email"
            required
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
          />
        </div>
        <div className="flex gap-2">
          <button className="athlemetry-button athlemetry-button-secondary px-3 py-2 text-xs" disabled={isSaving} type="submit">
            {isSaving ? "Saving…" : "Grant"}
          </button>
          <button
            className="athlemetry-button athlemetry-button-secondary px-3 py-2 text-xs"
            disabled={isSaving || !recipientEmail}
            type="button"
            onClick={() => void updateShare("DELETE")}
          >
            Revoke
          </button>
        </div>
      </form>
      {message ? <p className="mt-3 text-sm text-slate-700" role="status">{message}</p> : null}
    </section>
  );
}
