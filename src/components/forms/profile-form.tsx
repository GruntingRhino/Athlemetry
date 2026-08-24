"use client";

import { useState, type FormEvent } from "react";

import {
  COMPETITION_LEVEL_OPTIONS,
  getDefaultPositionForSport,
  getPositionOptionsForSport,
  isPositionValidForSport,
  SPORT_LABELS,
  SPORT_OPTIONS,
  type SportOption,
} from "@/lib/constants";

type ProfileFormProps = {
  profile: {
    name: string;
    age: number;
    primarySport: string;
    performanceGoal: string;
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
  const initialSport = SPORT_OPTIONS.includes(profile.primarySport as SportOption)
    ? profile.primarySport as SportOption
    : "soccer";
  const [primarySport, setPrimarySport] = useState<SportOption>(initialSport);
  const [position, setPosition] = useState(() => (
    isPositionValidForSport(initialSport, profile.position)
      ? profile.position
      : getDefaultPositionForSport(initialSport)
  ));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);

    const payload = {
      name: formData.get("name"),
      age: Number(formData.get("age")),
      primarySport,
      performanceGoal: formData.get("performanceGoal"),
      position,
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
        <label className="athlemetry-label">
          Full name
          <input className="athlemetry-control" name="name" defaultValue={profile.name} required />
        </label>
        <label className="athlemetry-label">
          Age
          <input
            className="athlemetry-control"
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
        <label className="athlemetry-label">
          Primary sport
          <select
            className="athlemetry-control"
            name="primarySport"
            value={primarySport}
            onChange={(event) => {
              const nextSport = event.target.value as SportOption;
              setPrimarySport(nextSport);
              setPosition(getDefaultPositionForSport(nextSport));
            }}
          >
            {SPORT_OPTIONS.map((sport) => (
              <option key={sport} value={sport}>{SPORT_LABELS[sport]}</option>
            ))}
          </select>
        </label>
        <label className="athlemetry-label">
          Position
          <select
            className="athlemetry-control"
            name="position"
            value={position}
            onChange={(event) => setPosition(event.target.value as typeof position)}
          >
            {getPositionOptionsForSport(primarySport).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="athlemetry-label">
          Team
          <input className="athlemetry-control" name="team" defaultValue={profile.team} />
        </label>
        <label className="athlemetry-label">
          Competition level
          <select
            className="athlemetry-control"
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
      <label className="athlemetry-label">
        Gender
        <input className="athlemetry-control" name="gender" defaultValue={profile.gender} />
      </label>
      <label className="athlemetry-label">
        Performance goal
        <textarea className="athlemetry-control min-h-24" name="performanceGoal" defaultValue={profile.performanceGoal} maxLength={500} />
      </label>
      <label className="athlemetry-check">
        <input type="checkbox" name="shareInBenchmarks" defaultChecked={profile.shareInBenchmarks} /> Share in benchmark cohorts
      </label>
      <label className="athlemetry-check">
        <input type="checkbox" name="anonymizeForBenchmark" defaultChecked={profile.anonymizeForBenchmark} /> Anonymize benchmark identity
      </label>
      {message ? <p className="athlemetry-message">{message}</p> : null}
      <button
        disabled={saving}
        type="submit"
        className="athlemetry-button athlemetry-button-primary w-fit disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save profile"}
      </button>
    </form>
  );
}
