"use client";

import { type FormEvent, useState } from "react";

import { SPORT_LABELS, SPORT_OPTIONS, type SportOption } from "@/lib/constants";

type Team = {
  id: string;
  name: string;
  sport: string;
  createdAt: string;
};

type TeamCreationFormProps = {
  onCreated: (team: Team) => void;
};

export function TeamCreationForm({ onCreated }: TeamCreationFormProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: formData.get("name"), sport: formData.get("sport") }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Team could not be created.");
        return;
      }
      onCreated(data.team as Team);
      form.reset();
      setMessage("Team created. Invitations and member access are not enabled yet.");
    } catch {
      setMessage("Team could not be created. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="athlemetry-label">
        Team name
        <input className="athlemetry-control" name="name" minLength={2} maxLength={80} required />
      </label>
      <label className="athlemetry-label">
        Primary sport
        <select className="athlemetry-control" name="sport" defaultValue="soccer">
          {SPORT_OPTIONS.map((sport) => <option key={sport} value={sport}>{SPORT_LABELS[sport as SportOption]}</option>)}
        </select>
      </label>
      {message ? <p className="athlemetry-message" role="status">{message}</p> : null}
      <button type="submit" disabled={saving} className="athlemetry-button athlemetry-button-primary w-fit disabled:opacity-60">
        {saving ? "Creating..." : "Create team"}
      </button>
    </form>
  );
}
