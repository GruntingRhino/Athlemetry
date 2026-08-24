import { ConsentForm } from "@/components/forms/consent-form";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function ConsentPage() {
  await requireRole(["PARENT", "ADMIN"]);

  return (
    <div className="mx-auto max-w-xl">
      <section className="athlemetry-card p-6 md:p-8">
        <div className="athlemetry-kicker">Family controls</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Parental approval flow</h1>
        <p className="mt-3 athlemetry-body">
          Approve or deny athlete participation for minors requiring parental consent verification.
        </p>
        <div className="mt-6">
          <ConsentForm />
        </div>
      </section>
    </div>
  );
}
