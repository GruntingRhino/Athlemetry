import { RegisterForm } from "@/components/forms/register-form";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ ref?: string }> | { ref?: string };
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const initialReferralCode = typeof resolvedSearchParams.ref === "string" ? resolvedSearchParams.ref : "";

  return (
    <div className="mx-auto max-w-3xl">
      <section className="athlemetry-card p-6 md:p-8">
        <div className="athlemetry-kicker">Create your account</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Register</h1>
        <p className="mt-3 athlemetry-body">
          Self-registration supports athlete, parent, and coach roles with consent and privacy controls.
        </p>
        <div className="mt-6">
          <RegisterForm initialReferralCode={initialReferralCode} />
        </div>
      </section>
    </div>
  );
}
