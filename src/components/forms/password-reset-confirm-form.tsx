"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

export function PasswordResetConfirmForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const password = new FormData(event.currentTarget).get("newPassword");

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Password could not be reset.");
        return;
      }
      setCompleted(true);
      setMessage("Password reset. You can now sign in with the new password.");
    } catch {
      setMessage("Password could not be reset. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return <p className="athlemetry-message" role="alert">This password reset link is missing its token. Request a new link.</p>;
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="athlemetry-label">
        New password
        <input className="athlemetry-control" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={completed} />
      </label>
      {message ? <p className="athlemetry-message" role="status">{message}</p> : null}
      {completed ? (
        <Link className="athlemetry-button athlemetry-button-primary w-fit" href="/login">Sign in</Link>
      ) : (
        <button className="athlemetry-button athlemetry-button-primary w-fit disabled:opacity-60" disabled={submitting} type="submit">
          {submitting ? "Resetting password..." : "Reset password"}
        </button>
      )}
    </form>
  );
}
