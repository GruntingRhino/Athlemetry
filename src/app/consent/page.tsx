import { ConsentForm } from "@/components/forms/consent-form";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function ConsentPage() {
  await requireRole(["PARENT", "ADMIN"]);

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Parental approval flow</h1>
      <p className="mt-1 text-sm text-slate-600">
        Approve or deny athlete participation for minors requiring parental consent verification.
      </p>
      <div className="mt-5">
        <ConsentForm />
      </div>
    </div>
  );
}
