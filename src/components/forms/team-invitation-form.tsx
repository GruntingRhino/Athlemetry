"use client";

import { type FormEvent, useState } from "react";

type CreatedInvitation = { id: string; createdAt: string; expiresAt: string };

export function TeamInvitationForm({ teamId, onCreated }: { teamId: string; onCreated?: (invitation: CreatedInvitation) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/teams/${teamId}/invitations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipientEmail: new FormData(form).get("recipientEmail") }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Invitation could not be created.");
        return;
      }
      if (data.invitation?.id && data.invitation?.createdAt && data.invitation?.expiresAt) {
        onCreated?.({ id: data.invitation.id, createdAt: data.invitation.createdAt, expiresAt: data.invitation.expiresAt });
      }
      form.reset();
      setMessage("Invitation created for the existing eligible athlete. It expires in 14 days and does not grant submission access.");
    } catch {
      setMessage("Invitation could not be created. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={onSubmit}>
      <label className="min-w-56 flex-1 text-xs font-semibold text-slate-700">
        Existing athlete email
        <input className="mt-1 athlemetry-control text-sm" name="recipientEmail" type="email" maxLength={254} required />
      </label>
      <button type="submit" disabled={saving} className="athlemetry-button athlemetry-button-secondary px-3 py-2 text-xs disabled:opacity-60">
        {saving ? "Inviting..." : "Invite athlete"}
      </button>
      {message ? <p className="w-full text-xs text-slate-600" role="status">{message}</p> : null}
    </form>
  );
}
