import { PrivacyActions } from "@/components/forms/privacy-actions";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const user = await requireUser();

  const consentLogs = await prisma.consentLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Privacy and compliance</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage consent state, export personal data, and request account deletion.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Data rights actions</h2>
        <p className="mt-1 text-sm text-slate-600">Export and deletion tools align with explicit consent logging requirements.</p>
        <div className="mt-4">
          <PrivacyActions />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Consent logs</h2>
        <ul className="mt-3 space-y-2">
          {consentLogs.map((log) => (
            <li key={log.id} className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{log.consentType}</p>
              <p className="text-xs text-slate-500">{log.createdAt.toISOString().slice(0, 19).replace("T", " ")}</p>
              <p className="mt-1">Status: {log.granted ? "Granted" : "Pending/Denied"}</p>
              {log.notes ? <p className="mt-1 text-xs text-slate-600">{log.notes}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
