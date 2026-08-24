import Link from "next/link";

import { PasswordResetConfirmForm } from "@/components/forms/password-reset-confirm-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }> | { token?: string };
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const token = typeof resolvedSearchParams.token === "string" ? resolvedSearchParams.token : "";

  return (
    <div className="mx-auto max-w-md">
      <section className="athlemetry-card p-6 md:p-8">
        <div className="athlemetry-kicker">Account recovery</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Choose a new password</h1>
        <p className="mt-3 athlemetry-body">Use a new password between 8 and 128 characters. Reset links expire and may be used once.</p>
        <div className="mt-6"><PasswordResetConfirmForm token={token} /></div>
        <p className="mt-5 text-sm text-slate-600"><Link className="font-semibold text-teal-800 transition hover:text-teal-900" href="/forgot-password">Request another reset link</Link></p>
      </section>
    </div>
  );
}
