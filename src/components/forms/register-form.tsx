"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  COMPETITION_LEVEL_OPTIONS,
  getDefaultPositionForSport,
  getPositionOptionsForSport,
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
  const [age, setAge] = useState(14);
  const [primarySport, setPrimarySport] = useState<SportOption>("soccer");
  const [position, setPosition] = useState(getDefaultPositionForSport("soccer"));

  const isAthlete = role === "ATHLETE";
  const requiresParentEmail = useMemo(() => isAthlete && age < 18, [age, isAthlete]);

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

    setMessage("Registration succeeded. Continue to login.");
    router.push("/login");
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="athlemetry-label">
          Full name
          <input className="athlemetry-control" name="name" required />
        </label>
        <label className="athlemetry-label">
          Email
          <input
            className="athlemetry-control"
            name="email"
            type="email"
            required
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="athlemetry-label">
          Password
          <input
            className="athlemetry-control"
            name="password"
            type="password"
            minLength={8}
            required
          />
        </label>
        <label className="athlemetry-label">
          Role
          <select
            className="athlemetry-control"
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as (typeof SELF_REGISTRATION_ROLE_OPTIONS)[number])}
          >
            {SELF_REGISTRATION_ROLE_OPTIONS.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {roleOption}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="athlemetry-label">
        Referral code (optional)
        <input className="athlemetry-control" name="referralCode" defaultValue={initialReferralCode} maxLength={24} autoCapitalize="characters" />
      </label>

      {isAthlete ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="athlemetry-label">
              Age
              <input
                className="athlemetry-control"
                name="age"
                type="number"
                min={6}
                max={80}
                value={age}
                onChange={(event) => setAge(Number(event.target.value))}
                required
              />
            </label>
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
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="athlemetry-label">
              Team
              <input className="athlemetry-control" name="team" />
            </label>
            <label className="athlemetry-label">
              Competition level
              <select
                className="athlemetry-control"
                name="competitionLevel"
                defaultValue="academy"
              >
                {COMPETITION_LEVEL_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label className="athlemetry-label">
              Gender
              <input className="athlemetry-control" name="gender" />
            </label>
          </div>

          <label className="athlemetry-label">
            Performance goal (optional)
            <textarea className="athlemetry-control min-h-24" name="performanceGoal" maxLength={500} />
          </label>

          <label className="athlemetry-label">
            Parent email (required for minors)
            <input
              className="athlemetry-control"
              name="parentEmail"
              type="email"
              required={requiresParentEmail}
            />
          </label>
        </>
      ) : (
        <label className="athlemetry-label">
          Gender (optional)
          <input className="athlemetry-control" name="gender" />
        </label>
      )}

      <label className="athlemetry-check">
        <input type="checkbox" name="shareInBenchmarks" defaultChecked /> Share data in cohort benchmarking
      </label>
      <label className="athlemetry-check">
        <input type="checkbox" name="anonymizeForBenchmark" defaultChecked /> Anonymize benchmark identities
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
