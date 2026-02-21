import { RegisterForm } from "@/components/forms/register-form";

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Create account</h1>
      <p className="mt-1 text-sm text-slate-600">
        Self-registration supports athlete, parent, and coach roles with consent and privacy controls.
      </p>
      <div className="mt-5">
        <RegisterForm />
      </div>
    </div>
  );
}
