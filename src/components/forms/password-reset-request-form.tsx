"use client";

import { type FormEvent, useState } from "react";

export function PasswordResetRequestForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: new FormData(form).get("email") }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Password reset could not be requested.");
        return;
      }
      form.reset();
      setMessage("If an active account uses that email, a reset link has been requested.");
    } catch {
      setMessage("Password reset could not be requested. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="athlemetry-label">
        Account email
        <input className="athlemetry-control" name="email" type="email" autoComplete="email" required />
      </label>
      {message ? <p className="athlemetry-message" role="status">{message}</p> : null}
      <button className="athlemetry-button athlemetry-button-primary w-fit disabled:opacity-60" disabled={submitting} type="submit">
        {submitting ? "Requesting reset..." : "Email reset link"}
      </button>
    </form>
  );
}
