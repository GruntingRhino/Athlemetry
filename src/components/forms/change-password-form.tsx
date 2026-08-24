"use client";

import { type FormEvent, useState } from "react";

export function ChangePasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: formData.get("currentPassword"),
          newPassword: formData.get("newPassword"),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.error || "Password could not be changed.");
        return;
      }

      form.reset();
      setMessage("Password changed.");
    } catch {
      setMessage("Password could not be changed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <p className="athlemetry-body">Use a new password between 8 and 128 characters.</p>
      <label className="athlemetry-label">
        Current password
        <input
          className="athlemetry-control"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          minLength={1}
          maxLength={128}
          required
        />
      </label>
      <label className="athlemetry-label">
        New password
        <input
          className="athlemetry-control"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
      </label>
      {message ? <p className="athlemetry-message" role="status">{message}</p> : null}
      <button
        type="submit"
        disabled={saving}
        className="athlemetry-button athlemetry-button-primary w-fit disabled:opacity-60"
      >
        {saving ? "Changing password..." : "Change password"}
      </button>
    </form>
  );
}
