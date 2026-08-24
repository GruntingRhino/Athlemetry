"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const result = await signIn("credentials", {
      email: String(formData.get("email")),
      password: String(formData.get("password")),
      redirect: false,
    });

    setLoading(false);

    if (!result || result.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="athlemetry-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="athlemetry-control"
          autoComplete="email"
        />
      </div>
      <div>
        <label className="athlemetry-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="athlemetry-control"
          autoComplete="current-password"
        />
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="athlemetry-button athlemetry-button-primary w-full disabled:opacity-60"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
