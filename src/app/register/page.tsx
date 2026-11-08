import { RegisterForm } from "@/components/forms/register-form";

export const metadata = { title: "Create account" };

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
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Create your account</h1>
        <p className="mt-3 athlemetry-body">
          Create an account as an athlete, parent or coach. You choose what you share.
        </p>
        <div className="mt-6">
          <RegisterForm initialReferralCode={initialReferralCode} />
        </div>
      </section>
    </div>
  );
}
