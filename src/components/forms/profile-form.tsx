"use client";

import { useState, type FormEvent } from "react";

import {
  COMPETITION_LEVEL_OPTIONS,
  POSITION_OPTIONS,
} from "@/lib/constants";

type ProfileFormProps = {
  profile: {
    name: string;
    age: number;
    position: string;
    team: string;
    competitionLevel: string;
    gender: string;
    shareInBenchmarks: boolean;
    anonymizeForBenchmark: boolean;
  };
};

export function ProfileForm({ profile }: ProfileFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);

    const payload = {
      name: formData.get("name"),
      age: Number(formData.get("age")),
      position: formData.get("position"),
      team: formData.get("team"),
      competitionLevel: formData.get("competitionLevel"),
      gender: formData.get("gender"),
      shareInBenchmarks: formData.get("shareInBenchmarks") === "on",
      anonymizeForBenchmark: formData.get("anonymizeForBenchmark") === "on",
    };

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setMessage(data.error || "Failed to save profile.");
      return;
    }

    setMessage("Profile saved.");
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          Full name
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="name" defaultValue={profile.name} required />
        </label>
        <label className="text-sm text-slate-700">
          Age
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            name="age"
            type="number"
            defaultValue={profile.age}
            min={6}
            max={80}
            required
          />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm text-slate-700">
          Position
          <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="position" defaultValue={profile.position}>
            {POSITION_OPTIONS.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Team
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="team" defaultValue={profile.team} />
        </label>
        <label className="text-sm text-slate-700">
          Competition level
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            name="competitionLevel"
            defaultValue={profile.competitionLevel}
          >
            {COMPETITION_LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-sm text-slate-700">
        Gender
        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="gender" defaultValue={profile.gender} />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="shareInBenchmarks" defaultChecked={profile.shareInBenchmarks} /> Share in benchmark cohorts
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="anonymizeForBenchmark" defaultChecked={profile.anonymizeForBenchmark} /> Anonymize benchmark identity
      </label>
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      <button
        disabled={saving}
        type="submit"
        className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save profile"}
      </button>
    </form>
  );
}
