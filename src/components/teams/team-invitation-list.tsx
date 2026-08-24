"use client";

import { useState } from "react";

type Invitation = {
  id: string;
  createdAt: string;
  expiresAt: string;
  team: { name: string; sport: string };
};

export function TeamInvitationList({ initialInvitations }: { initialInvitations: Invitation[] }) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function respond(id: string, action: "accept" | "decline") {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/team-invitations/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Invitation could not be updated.");
        return;
      }
      setInvitations((current) => current.filter((invitation) => invitation.id !== id));
      setMessage(action === "accept" ? "Team invitation accepted. No submissions have been shared." : "Team invitation declined.");
    } catch {
      setMessage("Invitation could not be updated. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (invitations.length === 0) return <p className="athlemetry-card p-6 text-sm text-slate-600">No pending team invitations are available for this account.</p>;

  return (
    <section className="space-y-3" aria-label="Pending team invitations">
      {invitations.map((invitation) => (
        <article key={invitation.id} className="athlemetry-card p-5">
          <h2 className="text-lg font-semibold text-slate-950">{invitation.team.name}</h2>
          <p className="mt-1 text-sm text-slate-600">{invitation.team.sport}</p>
          <p className="mt-2 text-xs text-slate-500">Invited {new Date(invitation.createdAt).toLocaleDateString()} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}. Accepting creates a team membership only; it does not share submissions or reports.</p>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busyId === invitation.id} onClick={() => respond(invitation.id, "accept")} className="athlemetry-button athlemetry-button-primary px-3 py-2 text-xs disabled:opacity-60">Accept</button>
            <button type="button" disabled={busyId === invitation.id} onClick={() => respond(invitation.id, "decline")} className="athlemetry-button athlemetry-button-secondary px-3 py-2 text-xs disabled:opacity-60">Decline</button>
          </div>
        </article>
      ))}
      {message ? <p className="athlemetry-message text-sm" role="status">{message}</p> : null}
    </section>
  );
}
