"use client";

import Link from "next/link";
import { useState } from "react";

import { TeamCreationForm } from "@/components/forms/team-creation-form";
import { TeamInvitationForm } from "@/components/forms/team-invitation-form";

type Team = {
  id: string;
  name: string;
  sport: string;
  createdAt: string;
  memberCount: number;
  pendingInvitations: Array<{ id: string; createdAt: string; expiresAt: string }>;
};

export function TeamManagement({ initialTeams }: { initialTeams: Team[] }) {
  const [teams, setTeams] = useState(initialTeams);
  const [message, setMessage] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function revokeInvitation(teamId: string, invitationId: string) {
    setRevokingId(invitationId);
    setMessage(null);
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(invitationId)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Invitation could not be revoked.");
        return;
      }
      setTeams((current) => current.map((team) => team.id === teamId
        ? { ...team, pendingInvitations: team.pendingInvitations.filter((invitation) => invitation.id !== invitationId) }
        : team));
      setMessage("Pending invitation revoked. No athlete profile or team access was exposed.");
    } catch {
      setMessage("Invitation could not be revoked. Please try again.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-lg font-semibold text-slate-950">Create a team</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Creating a team makes you its sole owner. It does not expose athletes or grant any submission access.</p>
        <div className="mt-5"><TeamCreationForm onCreated={(created) => setTeams((current) => [{ ...created, memberCount: 1, pendingInvitations: [] }, ...current])} /></div>
      </section>
      <section aria-label="Owned teams">
        <h2 className="text-lg font-semibold text-slate-950">Teams you own</h2>
        {teams.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No teams have been created from this account.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {teams.map((team) => (
              <li key={team.id} className="rounded-xl border border-slate-200 p-4">
                <p className="font-semibold text-slate-950">{team.name}</p>
                <p className="mt-1 text-sm text-slate-600">{team.sport} · {team.memberCount} owner/member record{team.memberCount === 1 ? "" : "s"}</p>
                <p className="mt-1 text-xs text-slate-500">Created {new Date(team.createdAt).toLocaleDateString()}</p>
                <Link href={`/teams/${team.id}`} className="mt-3 inline-flex text-sm font-semibold text-teal-800 underline underline-offset-4 hover:text-teal-950">
                  View confirmed roster
                </Link>
                <TeamInvitationForm
                  teamId={team.id}
                  onCreated={(invitation) => setTeams((current) => current.map((currentTeam) => currentTeam.id === team.id
                    ? { ...currentTeam, pendingInvitations: [invitation, ...currentTeam.pendingInvitations] }
                    : currentTeam))}
                />
                {team.pendingInvitations.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-slate-800">Pending invitations</p>
                    <ul className="mt-2 space-y-2">
                      {team.pendingInvitations.map((invitation) => (
                        <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
                          <span>Existing eligible athlete invited {new Date(invitation.createdAt).toLocaleDateString()} and expires {new Date(invitation.expiresAt).toLocaleDateString()}; identity remains private.</span>
                          <button
                            type="button"
                            disabled={revokingId !== null}
                            onClick={() => void revokeInvitation(team.id, invitation.id)}
                            className="font-semibold text-rose-700 underline underline-offset-4 disabled:opacity-60"
                          >
                            {revokingId === invitation.id ? "Revoking…" : "Revoke invitation"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      {message ? <p className="text-sm text-slate-700" role="status">{message}</p> : null}
    </div>
  );
}
