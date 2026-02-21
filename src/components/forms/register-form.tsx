"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  COMPETITION_LEVEL_OPTIONS,
  POSITION_OPTIONS,
  SELF_REGISTRATION_ROLE_OPTIONS,
} from "@/lib/constants";

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [role, setRole] = useState<(typeof SELF_REGISTRATION_ROLE_OPTIONS)[number]>("ATHLETE");
  const [age, setAge] = useState(14);

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
      position: isAthlete ? formData.get("position") : undefined,
      team: isAthlete ? formData.get("team") : undefined,
      competitionLevel: isAthlete ? formData.get("competitionLevel") : undefined,
      gender: formData.get("gender"),
      parentEmail:
        isAthlete && typeof parentEmailValue === "string" ? parentEmailValue : undefined,
      shareInBenchmarks: formData.get("shareInBenchmarks") === "on",
      anonymizeForBenchmark: formData.get("anonymizeForBenchmark") === "on",
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
        <label className="text-sm text-slate-700">
          Full name
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="name" required />
        </label>
        <label className="text-sm text-slate-700">
          Email
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            name="email"
            type="email"
            required
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          Password
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            name="password"
            type="password"
            minLength={8}
            required
          />
        </label>
        <label className="text-sm text-slate-700">
          Role
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
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

      {isAthlete ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-700">
              Age
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                name="age"
                type="number"
                min={6}
                max={80}
                value={age}
                onChange={(event) => setAge(Number(event.target.value))}
                required
              />
            </label>
            <label className="text-sm text-slate-700">
              Position
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                name="position"
                defaultValue="MID"
              >
                {POSITION_OPTIONS.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm text-slate-700">
              Team
              <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="team" />
            </label>
            <label className="text-sm text-slate-700">
              Competition level
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
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
            <label className="text-sm text-slate-700">
              Gender
              <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="gender" />
            </label>
          </div>

          <label className="text-sm text-slate-700">
            Parent email (required for minors)
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              name="parentEmail"
              type="email"
              required={requiresParentEmail}
            />
          </label>
        </>
      ) : (
        <label className="text-sm text-slate-700">
          Gender (optional)
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="gender" />
        </label>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="shareInBenchmarks" defaultChecked /> Share data in cohort benchmarking
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="anonymizeForBenchmark" defaultChecked /> Anonymize benchmark identities
      </label>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Registering..." : "Create account"}
      </button>
    </form>
  );
}
