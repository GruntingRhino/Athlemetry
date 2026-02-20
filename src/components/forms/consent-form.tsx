"use client";

import { useState, type FormEvent } from "react";

export function ConsentForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      athleteEmail: formData.get("athleteEmail"),
      granted: formData.get("granted") === "approve",
    };

    const response = await fetch("/api/consent/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setMessage(data.error || "Consent update failed.");
      return;
    }

    setMessage(`Consent updated for athlete ${payload.athleteEmail}.`);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm text-slate-700">
        Athlete email
        <input
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          type="email"
          name="athleteEmail"
          required
        />
      </label>
      <label className="block text-sm text-slate-700">
        Decision
        <select
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          name="granted"
          defaultValue="approve"
        >
          <option value="approve">Approve</option>
          <option value="deny">Deny</option>
        </select>
      </label>
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Submitting..." : "Submit consent decision"}
      </button>
    </form>
  );
}
