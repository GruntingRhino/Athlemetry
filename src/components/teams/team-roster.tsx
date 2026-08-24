"use client";

import { useEffect, useState } from "react";

type TeamRosterResponse = {
  team: {
    name: string;
    sport: string;
    athletes: Array<{ membershipId: string; name: string | null; position: string | null; joinedAt: string }>;
  };
};

export function TeamRoster({ teamId }: { teamId: string }) {
  const [result, setResult] = useState<TeamRosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/teams/${encodeURIComponent(teamId)}/roster`)
      .then(async (response) => {
        const body = await response.json().catch(() => null) as TeamRosterResponse | { error?: string } | null;
        if (!response.ok) throw new Error(body && "error" in body && body.error ? body.error : "The roster could not be loaded.");
        if (active) setResult(body as TeamRosterResponse);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "The roster could not be loaded.");
      });
    return () => { active = false; };
  }, [teamId]);

  async function removeAthlete(membershipId: string) {
    setRemovingId(membershipId);
    setError(null);
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "The athlete could not be removed from this team.");
      setResult((current) => current ? {
        ...current,
        team: { ...current.team, athletes: current.team.athletes.filter((athlete) => athlete.membershipId !== membershipId) },
      } : current);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "The athlete could not be removed from this team.");
    } finally {
      setRemovingId(null);
    }
  }

  if (error) return <p className="text-sm font-medium text-rose-700" role="alert">{error}</p>;
  if (!result) return <p className="text-sm text-slate-600">Loading confirmed roster…</p>;

  return (
    <div>
      <p className="text-sm text-slate-600">{result.team.name} · {result.team.sport}</p>
      {result.team.athletes.length === 0 ? (
        <p className="mt-5 text-sm text-slate-600">No athletes have accepted invitations to this team yet.</p>
      ) : (
        <ul className="mt-5 divide-y divide-slate-200 rounded-xl border border-slate-200">
          {result.team.athletes.map((athlete) => (
            <li key={athlete.membershipId} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-semibold text-slate-950">{athlete.name || "Name unavailable"}</p>
                <p className="mt-1 text-sm text-slate-600">{athlete.position || "Position not provided"}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-slate-500">Joined {new Date(athlete.joinedAt).toLocaleDateString()}</p>
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={removingId !== null}
                  onClick={() => void removeAthlete(athlete.membershipId)}
                >
                  {removingId === athlete.membershipId ? "Removing…" : "Remove from team"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
