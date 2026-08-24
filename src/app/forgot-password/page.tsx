import Link from "next/link";

import { PasswordResetRequestForm } from "@/components/forms/password-reset-request-form";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <section className="athlemetry-card p-6 md:p-8">
        <div className="athlemetry-kicker">Account recovery</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Reset your password</h1>
        <p className="mt-3 athlemetry-body">Enter the email for your Athlemetry account. If recovery is available, a reset link will be sent.</p>
        <div className="mt-6"><PasswordResetRequestForm /></div>
        <p className="mt-5 text-sm text-slate-600"><Link className="font-semibold text-teal-800 transition hover:text-teal-900" href="/login">Return to sign in</Link></p>
      </section>
    </div>
  );
}
