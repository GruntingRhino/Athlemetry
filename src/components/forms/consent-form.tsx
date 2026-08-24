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
      <label className="athlemetry-label">
        Athlete email
        <input
          className="athlemetry-control"
          type="email"
          name="athleteEmail"
          required
        />
      </label>
      <label className="athlemetry-label">
        Decision
        <select
          className="athlemetry-control"
          name="granted"
          defaultValue="approve"
        >
          <option value="approve">Approve</option>
          <option value="deny">Deny</option>
        </select>
      </label>
      {message ? <p className="athlemetry-message">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="athlemetry-button athlemetry-button-primary disabled:opacity-60"
      >
        {pending ? "Submitting..." : "Submit consent decision"}
      </button>
    </form>
  );
}
