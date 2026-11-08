"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  COMPETITION_LEVEL_LABELS,
  COMPETITION_LEVEL_OPTIONS,
  getPositionOptionsForSport,
  ROLE_LABELS,
  SELF_REGISTRATION_ROLE_OPTIONS,
  SPORT_LABELS,
  SPORT_OPTIONS,
  type SportOption,
} from "@/lib/constants";

export function RegisterForm({ initialReferralCode = "" }: { initialReferralCode?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [role, setRole] = useState<(typeof SELF_REGISTRATION_ROLE_OPTIONS)[number]>("ATHLETE");
  const [age, setAge] = useState("");
  const [primarySport, setPrimarySport] = useState<SportOption>("soccer");
  const [position, setPosition] = useState("");
  const [optionalOpen, setOptionalOpen] = useState(initialReferralCode.length > 0);

  const isAthlete = role === "ATHLETE";
  const requiresParentEmail = useMemo(
    () => isAthlete && age.trim() !== "" && Number(age) < 18,
    [age, isAthlete],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const ageValue = formData.get("age");
    const parentEmailValue = formData.get("parentEmail");

    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      role,
      age:
        isAthlete && typeof ageValue === "string" && ageValue.length > 0
          ? Number(ageValue)
          : undefined,
      primarySport: isAthlete ? primarySport : undefined,
      performanceGoal: isAthlete ? formData.get("performanceGoal") : undefined,
      position: isAthlete ? position : undefined,
      team: isAthlete ? formData.get("team") : undefined,
      competitionLevel: isAthlete ? formData.get("competitionLevel") : undefined,
      gender: formData.get("gender"),
      parentEmail:
        isAthlete && typeof parentEmailValue === "string" ? parentEmailValue : undefined,
      shareInBenchmarks: formData.get("shareInBenchmarks") === "on",
      anonymizeForBenchmark: formData.get("anonymizeForBenchmark") === "on",
      referralCode: formData.get("referralCode"),
    };

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    setLoading(false);

    if (!response.ok) {
      setMessage(data.error || "Registration failed.");
      return;
    }

    setMessage("Thanks. If this email is new, your account is ready; if you already registered, use your existing password. Continue to sign in.");
    router.push("/login");
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="athlemetry-label">
          Full name
          <input className="athlemetry-control min-h-11" name="name" autoComplete="name" required />
        </label>
        <label className="athlemetry-label">
          Email
          <input
            className="athlemetry-control min-h-11"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label className="athlemetry-label">
          Password
          <input
            className="athlemetry-control min-h-11"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="athlemetry-label">
          I am signing up as
          <select
            className="athlemetry-control min-h-11"
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as (typeof SELF_REGISTRATION_ROLE_OPTIONS)[number])}
          >
            {SELF_REGISTRATION_ROLE_OPTIONS.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {ROLE_LABELS[roleOption]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isAthlete ? (
        <fieldset className="grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-2">
          <legend className="text-base font-semibold text-slate-950">About the athlete</legend>
          <label className="athlemetry-label">
            Age
            <input
              className="athlemetry-control min-h-11"
              name="age"
              type="number"
              inputMode="numeric"
              min={6}
              max={80}
              value={age}
              onChange={(event) => setAge(event.target.value)}
              required
            />
          </label>
          <label className="athlemetry-label">
            Primary sport
            <select
              className="athlemetry-control min-h-11"
              name="primarySport"
              value={primarySport}
              onChange={(event) => {
                const nextSport = event.target.value as SportOption;
                setPrimarySport(nextSport);
                setPosition("");
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
              className="athlemetry-control min-h-11"
              name="position"
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              required
            >
              <option value="">Select a position</option>
              {getPositionOptionsForSport(primarySport).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="athlemetry-label">
            Competition level
            <select
              className="athlemetry-control min-h-11"
              name="competitionLevel"
              defaultValue="academy"
            >
              {COMPETITION_LEVEL_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {COMPETITION_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </label>
          {requiresParentEmail ? (
            <label className="athlemetry-label md:col-span-2">
              Parent email (required for athletes under 18)
              <input
                className="athlemetry-control min-h-11"
                name="parentEmail"
                type="email"
                autoComplete="off"
                required
              />
            </label>
          ) : null}
        </fieldset>
      ) : null}

      <details
        className="rounded-2xl border border-slate-200 bg-white/70"
        open={optionalOpen}
        onToggle={(event) => setOptionalOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-slate-900">
          Optional details
        </summary>
        <div className="grid gap-4 border-t border-slate-200 px-4 py-4 md:grid-cols-2">
          {isAthlete ? (
            <label className="athlemetry-label">
              Team
              <input className="athlemetry-control min-h-11" name="team" />
            </label>
          ) : null}
          <label className="athlemetry-label">
            Gender
            <input className="athlemetry-control min-h-11" name="gender" />
          </label>
          <label className="athlemetry-label">
            Referral code
            <input className="athlemetry-control min-h-11" name="referralCode" defaultValue={initialReferralCode} maxLength={24} autoCapitalize="characters" />
          </label>
          {isAthlete ? (
            <label className="athlemetry-label md:col-span-2">
              Performance goal
              <textarea className="athlemetry-control min-h-24" name="performanceGoal" maxLength={500} />
            </label>
          ) : null}
        </div>
      </details>

      <label className="athlemetry-check">
        <input type="checkbox" name="shareInBenchmarks" /> Share data in cohort benchmarking
      </label>
      <label className="athlemetry-check">
        <input type="checkbox" name="anonymizeForBenchmark" /> Anonymize benchmark identities
      </label>
      <p className="text-sm leading-6 text-slate-600">
        By creating an account, you can review the product’s{" "}
        <Link className="font-semibold text-teal-800 transition hover:text-teal-900" href="/privacy-notice">Privacy Notice</Link>
        {" "}and{" "}
        <Link className="font-semibold text-teal-800 transition hover:text-teal-900" href="/terms">Terms of Use</Link>.
      </p>

      {message ? <p className="athlemetry-message">{message}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="athlemetry-button athlemetry-button-primary disabled:opacity-60"
      >
        {loading ? "Registering..." : "Create account"}
      </button>
    </form>
  );
}
