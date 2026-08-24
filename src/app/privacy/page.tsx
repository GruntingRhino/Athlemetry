import Link from "next/link";

import { PrivacyActions } from "@/components/forms/privacy-actions";
import { BackToSports } from "@/components/layout/back-to-sports";
import { requireUser } from "@/lib/authz";
import { readPrivacyConsentHistoryForOwner } from "@/lib/privacy-consent-history";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const user = await requireUser();

  const { consentLogs, modelTrainingConsent } = await readPrivacyConsentHistoryForOwner(user.id);

  return (
    <div className="space-y-6 lg:space-y-8">
      <BackToSports />
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="athlemetry-kicker">Settings</div>
        <h1 className="mt-4 athlemetry-section-heading">Privacy and compliance</h1>
        <p className="athlemetry-section-lead">
          Manage consent state, export personal data, and request account deletion.
        </p>
        <p className="mt-4 text-sm text-slate-600">
          <Link className="font-semibold text-teal-800 transition hover:text-teal-900" href="/privacy-notice">Read the Privacy Notice</Link>
          {" · "}
          <Link className="font-semibold text-teal-800 transition hover:text-teal-900" href="/terms">Read the Terms of Use</Link>
        </p>
      </section>

      <section className="athlemetry-card p-5 md:p-6">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">Data rights actions</h2>
        <p className="mt-1 text-sm text-slate-600">Export and deletion tools align with explicit consent logging requirements.</p>
        <div className="mt-4">
          <PrivacyActions initialModelTrainingConsent={modelTrainingConsent?.granted ?? false} />
        </div>
      </section>

      <section className="athlemetry-card p-5 md:p-6">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">Consent logs</h2>
        <ul className="mt-4 space-y-3">
          {consentLogs.map((log) => (
            <li key={log.id} className="athlemetry-panel-item text-sm text-slate-700">
              <p className="font-semibold text-slate-950">{log.consentType}</p>
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
